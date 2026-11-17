/**
 * XAVFSIZLIK — guruhda aniqlangan zararli kontent jurnali.
 *
 * Bu modul IKKI TOMONGA qaraydi:
 *
 *   BOT  →  `report` (tahdid aniqlandi / o'chirildi)
 *   PANEL → `list` / `stats` / `config` / `setGuard`
 *
 * ── NIMA UCHUN SIGNALDAN ALOHIDA ──────────────────────────────────────
 *
 * ⚠️ `SecurityEvent` — `GroupSignal` EMAS va ular aralashtirilmaydi.
 * Signal — AI TAXMINI, u odam qaroriga muhtoj va xato bo'lishi mumkin.
 * Bu yerda esa qoida QAT'IY (`.apk` = zararli) va bot DARHOL harakat
 * qiladi. Ikkisini bitta jadvalga qo'shish "signallar — tekshirilmagan
 * taxmin" degan doktrinani buzardi.
 *
 * ── QALQON `isOfficial` GA BOG'LIQ EMAS ──────────────────────────────
 *
 * ⚠️ `isOfficial` — yozishmani O'QISHGA rozilik; `guardEnabled` esa
 * aholini himoya qiladi. Guruh "kuzatuvga yopiq" bo'lsa ham undagi
 * odamlarni virusdan himoya qilish mumkin va bu ikki qaror BIR-BIRIGA
 * BOG'LIQ EMAS.
 *
 * ── QALQON KANALGA TEGISHLI EMAS ─────────────────────────────────────
 *
 * ⚠️ KANALDA ZARARLI KONTENTNI O'SHA KANALNING O'Z ADMINI YOZADI.
 * Guruhda qalqon BEGONA odamdan (firibgardan) aholini himoya qiladi;
 * kanalda esa "himoya qilinadigan" va "tahdid soladigan" tomon bir
 * xil bo'lib qoladi — ya'ni bot ma'muriyatning o'z e'lonini
 * o'chirishga urinardi, raisning e'lonida havola bo'lishi esa ODATIY
 * hol.
 *
 * ⚠️ UCH QAVAT TO'SIQ (`common/chat-type.ts`):
 *
 *   1. bot kanalda qalqonni UMUMAN ishga tushirmaydi
 *   2. `guardConfig` kanal uchun `guardEnabled: false` qaytaradi
 *   3. `setGuard` / `bulkSetGuard` kanalni RAD ETADI, `report` esa
 *      kanal uchun hodisa YARATMAYDI
 *
 * Bittasi yetarli emas: botning eski nusxasi ishlayotgan bo'lsa (1)
 * yo'q, server yiqilganda esa bot eski kesh bilan ishlaydi — ya'ni
 * (2) ham jim o'tib ketardi. Panelda yoqilgan qalqon esa eng yomoni:
 * u kanal qatorida "ishlamayapti" degan — tuzatib bo'lmaydigan —
 * ogohlantirish bo'lib turardi.
 */

import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";

import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../common/audit.service";
import {
  CHANNEL_TYPE,
  guardApplies,
  guardScopeWhere,
  isChannel,
} from "../../common/chat-type";
import { groupListWhere } from "../../common/group-filter.util";
import {
  canTouchDistrict,
  canTouchGroup,
  signalScopeWhere,
  type ScopeContext,
} from "../../common/scope.util";
import { paginate, type Paginated } from "../../common/dto/pagination.dto";
import type {
  BulkGuardDto,
  ListSecurityQuery,
  ReportThreatDto,
  SetGuardDto,
} from "./dto/security.dto";

/** Xabar matnining saqlanadigan uzunligi. */
const MAX_EVIDENCE_TEXT = 2000;

@Injectable()
export class SecurityService {
  private readonly logger = new Logger(SecurityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ═══════════════════════════════════════════════════════════════
  //  BOT TOMONI
  // ═══════════════════════════════════════════════════════════════

  /**
   * QALQON SOZLAMASI — bot har guruh uchun shuni so'raydi.
   *
   * ⚠️ QORA RO'YXAT SERVERDA TURADI va botga UZATILADI: botda nusxa
   * saqlansa, panelda domen qo'shilgach u yangilanmay qolardi
   * (botda Prisma yo'q, ya'ni u bazani o'qiy olmaydi).
   */
  async guardConfig(chatId: string) {
    const [group, settings] = await Promise.all([
      this.prisma.telegramGroup.findUnique({
        where: { chatId },
        // ⚠️ `type` HAM O'QILADI: kanalda qalqon ishga tushmaydi
        // (fayl boshidagi doktrina) va javob shu yerda yopiladi.
        select: { guardEnabled: true, type: true },
      }),
      this.prisma.settings.findUnique({ where: { id: "singleton" } }),
    ]);

    return {
      /**
       * ⚠️ GURUH REYESTRDA YO'Q BO'LSA — QALQON O'CHIQ. Noma'lum
       * guruhda xabar o'chirish mumkin emas: bot u yerga tasodifan
       * qo'shilgan bo'lishi mumkin.
       *
       * ⚠️ KANALDA HAM O'CHIQ, bazada `true` bo'lsa ham: qalqon
       * kanalga tegishli emas (fayl boshidagi doktrina) va eski
       * yoqilgan qiymat bazada qolib ketgan bo'lishi mumkin.
       * Javobni shu yerda yopish — ikkinchi qavat to'siq, botdagi
       * tekshiruv esa birinchisi.
       */
      guardEnabled:
        Boolean(group?.guardEnabled) && guardApplies(group?.type),
      deleteFiles: settings?.guardDeleteFiles ?? true,
      deleteUrls: settings?.guardDeleteUrls ?? true,
      blockedHosts: settings?.guardBlockedHosts ?? [],
      allowedHosts: settings?.guardAllowedHosts ?? [],
    };
  }

  /**
   * TAHDID QAYD ETILDI.
   *
   * ⚠️ `upsert`, `create` EMAS: bir xabar ikki marta kelishi mumkin
   * (bot qayta ishga tushdi, Telegram takrorladi) va dublikat yozuv
   * hisobotni shishirardi. Unique kalit — `(chatId, messageId)`.
   */
  async report(dto: ReportThreatDto) {
    const group = await this.prisma.telegramGroup.findUnique({
      where: { chatId: dto.chatId },
      select: { chatId: true, type: true },
    });

    // ⚠️ NOMA'LUM GURUH JIM TASHLANADI: reyestrda yo'q guruh uchun
    // yozuv yaratish begona chatni hisobotga olib kirardi.
    if (!group) return { skipped: true };

    /**
     * ⚠️ KANAL UCHUN HODISA YARATILMAYDI: `security_events` —
     * APPEND-ONLY (doktrina), ya'ni bir marta yozilgan yozuvni
     * keyin tozalab bo'lmaydi. Botning eski nusxasi kanal postini
     * yuborib qolsa, u xavfsizlik hisobotini kanalga tegishli
     * bo'lmagan — va hech kim hal qila olmaydigan — qatorlar bilan
     * ABADIY to'ldirardi.
     *
     * ⚠️ `canDeleteMessages` HAM YOZILMAYDI (pastdagi blok shu
     * `return` dan keyin turadi): kanalda bu huquqning bor-yo'qligi
     * hech narsani o'zgartirmaydi va panelda yolg'on ogohlantirish
     * chiqarardi.
     */
    if (!guardApplies(group.type)) return { skipped: true };

    const data = {
      chatId: dto.chatId,
      messageId: dto.messageId ?? null,
      kind: dto.kind as never,
      action: dto.action as never,
      senderTgId: dto.senderTgId ?? null,
      senderName: dto.senderName ?? null,
      senderUsername: dto.senderUsername ?? null,
      fileName: dto.fileName ?? null,
      fileMime: dto.fileMime ?? null,
      fileSize: dto.fileSize ?? null,
      fileUniqueId: dto.fileUniqueId ?? null,
      url: dto.url ?? null,
      urlHost: dto.urlHost ?? null,
      reason: dto.reason,
      messageText: dto.messageText?.slice(0, MAX_EVIDENCE_TEXT) ?? null,
      errorMessage: dto.errorMessage ?? null,
      sentAt: dto.sentAt ? new Date(dto.sentAt * 1000) : null,
    };

    // ⚠️ `messageId` BO'LMASA `upsert` KALITI YO'Q — shunda oddiy
    // `create`. Bu kamdan-kam holat (Telegram deyarli har doim
    // raqam beradi), lekin `upsert` undefined kalit bilan
    // yiqilardi.
    /**
     * ── QALQON ISHLAY OLADIMI ──────────────────────────────────
     *
     * ⚠️ HODISA YOZUVIDAN OLDIN: qalqon yoqilgan, lekin bot admin
     * emas degan holat PANELDA ko'rinishi kerak. Eski kodda bu
     * holat faqat `errorMessage` dagi inglizcha satrda turardi
     * (`message can't be deleted`) va undan nima qilish kerakligi
     * bilinmasdi.
     *
     * ⚠️ `undefined` BO'LSA TEGILMAYDI: "bilinmadi" ni `false` deb
     * yozish panelda yo'q muammo haqida ogohlantirish chiqarardi.
     */
    if (dto.botCanDelete !== undefined) {
      await this.prisma.telegramGroup
        .update({
          where: { chatId: dto.chatId },
          data: { canDeleteMessages: dto.botCanDelete },
        })
        .catch(() => undefined);
    }

    const event = dto.messageId
      ? await this.prisma.securityEvent.upsert({
          where: {
            chatId_messageId: { chatId: dto.chatId, messageId: dto.messageId },
          },
          create: data,
          update: {
            // ⚠️ FAQAT NATIJA YANGILANADI: qolgan maydonlar
            // DALIL va ular o'zgarmasligi kerak.
            action: data.action,
            errorMessage: data.errorMessage,
          },
        })
      : await this.prisma.securityEvent.create({ data });

    this.logger.warn(
      `${dto.chatId} — ${dto.kind} (${dto.reason}) → ${dto.action}`,
    );

    return { id: event.id, recorded: true };
  }

  // ═══════════════════════════════════════════════════════════════
  //  PANEL TOMONI
  // ═══════════════════════════════════════════════════════════════

  /**
   * ⚠️ QAMROV GURUH ORQALI (`signalScopeWhere`): `SecurityEvent` da
   * hudud ustuni YO'Q va bu ataylab — signal bilan bir xil sabab
   * (hodisa yangi, hududi guruhning JORIY holatidan kelib chiqadi).
   *
   * ⚠️ `includeUnassigned`: MFY biriktirilmagan guruhdagi tahdid ham
   * KO'RINISHI kerak — aks holda eng e'tiborsiz qolgan guruhlardagi
   * xavf jimgina yashirinib yurardi.
   */
  async list(
    query: ListSecurityQuery,
    scope: ScopeContext,
  ): Promise<Paginated<unknown>> {
    const where: Record<string, unknown> = {
      ...signalScopeWhere(scope, { includeUnassigned: true }),
    };

    if (query.chatId) where.chatId = query.chatId;
    if (query.kind) where.kind = query.kind;
    if (query.action) where.action = query.action;
    if (query.senderTgId) where.senderTgId = query.senderTgId;

    /**
     * ⚠️ NOTO'G'RI O'CHIRISHLAR ALOHIDA KO'RILADI: ular qoidaning
     * XATOSI haqidagi yagona dalil va umumiy ro'yxatda minglab
     * haqiqiy tahdid orasida ko'rinmay ketardi. Panelda ular
     * bo'yicha ALOHIDA filtr bor.
     */
    if (query.falsePositive !== undefined) {
      where.isFalsePositive = query.falsePositive;
    }

    if (query.districtId || query.mahallaId) {
      where.group = {
        ...(query.mahallaId
          ? { mahallaId: query.mahallaId }
          : { mahalla: { districtId: query.districtId } }),
      };
    }

    if (query.from || query.to) {
      const createdAt: Record<string, Date> = {};
      if (query.from) createdAt.gte = new Date(query.from);
      // ⚠️ `to` KUN OXIRIGACHA: `2026-10-15` yozilganda o'sha kunning
      // o'zi ham kirishi kerak, aks holda oxirgi kun tushib qolardi.
      if (query.to) {
        const end = new Date(query.to);
        end.setUTCHours(23, 59, 59, 999);
        createdAt.lte = end;
      }
      where.createdAt = createdAt;
    }

    const [items, total] = await Promise.all([
      this.prisma.securityEvent.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: query.skip,
        take: query.limit,
        include: {
          group: {
            select: {
              chatId: true,
              title: true,
              username: true,
              guardEnabled: true,
              mahalla: {
                select: {
                  id: true,
                  name: true,
                  district: { select: { id: true, name: true } },
                },
              },
            },
          },
        },
      }),
      this.prisma.securityEvent.count({ where }),
    ]);

    return paginate(items, total, query);
  }

  // ═══════════════════════════════════════════════════════════════
  //  NOTO'G'RI O'CHIRISHNI TUZATISH
  // ═══════════════════════════════════════════════════════════════

  /**
   * HODISANI "NOTO'G'RI" DEB BELGILAYDI VA HOSTNI OQ RO'YXATGA
   * QO'SHADI.
   *
   * ── NIMA UCHUN KERAK ────────────────────────────────────────────
   *
   * ⚠️ ODDIY HAVOLA HAM BLOKLANISHI MUMKIN va bu TIRIK holat: qora
   * ro'yxatlar tashqi manbadan keladi (50 000 host) va ularga
   * qonuniy sayt xato bilan tushishi mumkin; qisqartirgich qoidasi
   * esa `t.me/...` ko'rinishidagi har havolani ushlaydi. Bunday
   * paytda guruh a'zosining xabari jimgina o'chib ketadi — bot
   * ogohlantirish YOZMAYDI, ya'ni buni faqat panelda ko'rish
   * mumkin.
   *
   * ⚠️ IKKI AMAL BITTA TUGMADA: hodisani belgilash XATO haqida
   * dalil qoldiradi, oq ro'yxat esa uning QAYTALANMASLIGINI
   * ta'minlaydi. Faqat belgilansa, ertasi kuni o'sha havola yana
   * o'chirilardi va xodim yana belgilardi — cheksiz.
   *
   * ── HODISA O'CHIRILMAYDI ────────────────────────────────────────
   *
   * ⚠️ `security_events` — APPEND-ONLY (doktrina): yozuv
   * O'CHIRILMAYDI, faqat BELGILANADI. Noto'g'ri o'chirishlar
   * ro'yxati — qoidani tuzatish uchun yagona manba va uni
   * tozalash o'sha dalilni yo'q qilardi.
   *
   * ⚠️ O'CHIRILGAN XABARNI QAYTARIB BO'LMAYDI: Telegram API da
   * bunday imkon YO'Q. Ya'ni "tiklash" — xabarni emas, HAVOLANI
   * tiklash: bundan keyin u o'chirilmaydi.
   */
  async allowEvent(
    id: string,
    scope: ScopeContext,
    userId: string,
    ip?: string,
  ) {
    const event = await this.prisma.securityEvent.findUnique({
      where: { id },
      include: { group: { select: { mahalla: { select: { districtId: true } } } } },
    });

    if (!event) throw new NotFoundException("Hodisa topilmadi");

    // ⚠️ QAMROV TEKSHIRUVI ALOHIDA (`Ruxsat ≠ qamrov` doktrinasi):
    // id bilan keladigan amal ro'yxat filtridan O'TMAYDI.
    const districtId = event.group?.mahalla?.districtId ?? null;
    if (districtId && !canTouchDistrict(scope, districtId)) {
      throw new BadRequestException("Bu hodisa sizning qamrovingizda emas");
    }

    const host = this.hostOf(event.urlHost, event.url);

    /**
     * ⚠️ HOST BO'LMASA — FAQAT BELGILANADI: fayl qoidasi (`.apk`)
     * bo'yicha o'chirilgan hodisada host umuman yo'q va unda oq
     * ro'yxatga qo'shadigan narsa ham yo'q. Xato bermaslik kerak:
     * xodim baribir "bu noto'g'ri edi" deb belgilashi mumkin
     * bo'lishi kerak.
     */
    let allowedHost: string | null = null;

    if (host) {
      // ⚠️ `"singleton"` — sozlama BITTA QATOR (fayldagi
      // `guardConfig` bilan ayni kalit): `findFirst` ishlatilsa,
      // test bazasida ikkinchi qator paydo bo'lganda tasodifiy
      // biri olinardi.
      const settings = await this.prisma.settings.findUnique({
        where: { id: "singleton" },
        select: { id: true, guardAllowedHosts: true, guardBlockedHosts: true },
      });

      if (settings) {
        const allowed = new Set(settings.guardAllowedHosts);

        if (!allowed.has(host)) {
          allowed.add(host);
          allowedHost = host;
        }

        /**
         * ⚠️ QO'LDAGI QORA RO'YXATDAN HAM OLIB TASHLANADI: aks
         * holda `inspectUrl` da oq ro'yxat ustun bo'lsa ham,
         * panelda host IKKI ro'yxatda turib, "qaysi biri
         * ishlayapti" degan savol paydo bo'lardi.
         *
         * ⚠️ TASHQI RO'YXATDAN (`ThreatHost`) OLIB TASHLANMAYDI:
         * u manbadan keladi va keyingi yangilanishda qaytib
         * kelardi. Oq ro'yxat esa undan BARIBIR ustun
         * (`inspectUrl` dagi tartib).
         */
        const blocked = settings.guardBlockedHosts.filter((item) => item !== host);

        await this.prisma.settings.update({
          where: { id: settings.id },
          data: {
            guardAllowedHosts: [...allowed].sort(),
            guardBlockedHosts: blocked,
          },
        });
      }
    }

    const updated = await this.prisma.securityEvent.update({
      where: { id },
      data: {
        isFalsePositive: true,
        reviewedBy: userId,
        reviewedAt: new Date(),
      },
    });

    await this.audit.record({
      userId,
      action: "security.false_positive",
      entity: "SecurityEvent",
      entityId: id,
      meta: {
        chatId: event.chatId,
        kind: event.kind,
        reason: event.reason,
        url: event.url,
        allowedHost,
      },
      ip,
    });

    return {
      ok: true,
      isFalsePositive: updated.isFalsePositive,
      allowedHost,
      /**
       * ⚠️ XABAR QAYTARILMAGANI OCHIQ AYTILADI: xodim "tiklash"
       * tugmasini bosib, xabar guruhga qaytadi deb o'ylardi.
       */
      note: allowedHost
        ? `${allowedHost} oq ro'yxatga qo'shildi — bundan keyin o'chirilmaydi`
        : "Hodisa noto'g'ri deb belgilandi",
    };
  }

  /**
   * ⚠️ HOST IKKI MANBADAN: `urlHost` to'ldirilmagan eski
   * yozuvlarda u `url` dan qayta o'qiladi — aks holda eski
   * hodisalar uchun tugma ishlamasdi.
   */
  private hostOf(urlHost: string | null, url: string | null): string | null {
    const direct = urlHost?.trim().toLowerCase();
    if (direct) return direct.replace(/^www\./, "");

    if (!url) return null;

    try {
      const parsed = new URL(url.includes("://") ? url : `http://${url}`);
      return parsed.hostname.toLowerCase().replace(/^www\./, "");
    } catch {
      return null;
    }
  }

  /** Panel sarlavhasidagi raqamlar. */
  async stats(scope: ScopeContext) {
    const where = signalScopeWhere(scope, { includeUnassigned: true });

    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [
      total,
      deleted,
      failed,
      last24h,
      byKind,
      guardedGroups,
      totalGroups,
      blindGroups,
      falsePositives,
      channels,
    ] = await Promise.all([
        this.prisma.securityEvent.count({ where }),
        this.prisma.securityEvent.count({ where: { ...where, action: "deleted" } }),
        // ⚠️ "O'CHIRILMADI" ALOHIDA SANALADI: bot admin bo'lmasa
        // o'chira olmaydi va bu holat KO'RINISHI kerak — aks holda
        // ma'muriyat "himoya ishlayapti" deb o'ylab yuraverardi.
        this.prisma.securityEvent.count({
          where: { ...where, action: { in: ["detected", "delete_failed"] } },
        }),
        this.prisma.securityEvent.count({
          where: { ...where, createdAt: { gte: since24h } },
        }),
        this.prisma.securityEvent.groupBy({
          by: ["kind"],
          where,
          _count: { _all: true },
        }),
        /**
         * ⚠️ UCHALA SANOQCHI HAM KANALNI OLMAYDI
         * (`guardScopeWhere`): "40/120 da qalqon yoqilgan" degan
         * son maxraji kanallarni ham sanaganda hech qachon
         * to'lmasdi — ma'muriyat esa qolgan 80 tasini yoqishga
         * urinib yurardi.
         */
        this.prisma.telegramGroup.count({
          where: { ...guardScopeWhere, guardEnabled: true, status: { not: "left" } },
        }),
        this.prisma.telegramGroup.count({
          where: { ...guardScopeWhere, status: { not: "left" } },
        }),
        /**
         * ⚠️ "QALQON YOQILGAN, LEKIN BOT O'CHIRA OLMAYDI" —
         * ALOHIDA SANOQ va u ENG MUHIM raqam. `guardEnabled` —
         * ma'muriyat XOHISHI, `canDeleteMessages` — Telegram
         * RUXSATI. Ikkisi ajralganda himoya yo'q, lekin panelda
         * "yoqilgan" bo'lib ko'rinadi va bot guruhga ogohlantirish
         * ham YOZMAYDI.
         */
        this.prisma.telegramGroup.count({
          where: {
            // ⚠️ KANAL CHIQARIB TASHLANADI: u yerda qalqon
            // baribir ishlamaydi va "o'chirish huquqi yo'q" degan
            // ogohlantirishni tuzatib bo'lmasdi.
            ...guardScopeWhere,
            guardEnabled: true,
            status: { not: "left" },
            canDeleteMessages: false,
          },
        }),
        /**
         * ⚠️ NOTO'G'RI O'CHIRISHLAR SANOG'I — QOIDA SIFATINING
         * YAGONA O'LCHOVI. U o'smayotgan bo'lsa qoida aniq
         * ishlayapti; o'syotgan bo'lsa ro'yxatni ko'rib chiqish
         * kerak. Usiz "oddiy havolalar ham bloklanyapti" degan
         * shikoyatni raqam bilan tekshirib bo'lmasdi.
         */
        this.prisma.securityEvent.count({
          where: { ...where, isFalsePositive: true },
        }),
        /**
         * ⚠️ KANALLAR SONI AYTILADI, JIM TASHLANMAYDI: yuqoridagi
         * sanoqchilar ularni hisobga olmaydi va panelda "40/80"
         * degan son ko'rinadi — holbuki reyestrda 120 chat bor.
         * Son aytilmasa, xodim yo'qolgan 40 tasini izlab yurardi.
         */
        this.prisma.telegramGroup.count({
          where: { type: CHANNEL_TYPE, status: { not: "left" } },
        }),
      ]);

    return {
      total,
      deleted,
      failed,
      last24h,
      byKind: Object.fromEntries(
        byKind.map((row) => [row.kind, row._count._all]),
      ),
      guardedGroups,
      totalGroups,
      /** Qalqon yoqilgan, lekin botda o'chirish huquqi yo'q guruhlar. */
      blindGroups,
      /** Xodim "noto'g'ri o'chirildi" deb belgilagan hodisalar. */
      falsePositives,
      /**
       * KANALLAR — QALQON SANOQCHILARIDAN TASHQARIDA.
       *
       * ⚠️ `totalGroups` GA QO'SHILMAYDI: kanalda qalqon
       * ishlamaydi, ya'ni u "himoyalanmagan guruh" emas —
       * "himoya tegishli bo'lmagan chat".
       */
      channels,
    };
  }

  /**
   * QALQONNI YOQISH/O'CHIRISH — guruh bo'yicha.
   *
   * ⚠️ `canTouchDistrict` MAJBURIY: bu amal id bilan keladi va
   * ro'yxat filtridan O'TMAYDI. Usiz tuman operatori boshqa
   * tumandagi guruhning qalqonini o'chirib qo'ya olardi.
   */
  async setGuard(
    chatId: string,
    dto: SetGuardDto,
    scope: ScopeContext,
    actorId: string,
    ip?: string,
  ) {
    const group = await this.prisma.telegramGroup.findUnique({
      where: { chatId },
      select: {
        chatId: true,
        title: true,
        type: true,
        guardEnabled: true,
        mahalla: { select: { districtId: true } },
      },
    });

    if (!group) throw new NotFoundException("Guruh topilmadi");

    /**
     * ⚠️ `canTouchGroup`: biriktirilmagan guruh ro'yxatda
     * ko'rinadigan bo'lgach (`group-filter.util.ts`), uning
     * qalqon tugmasi ham ishlashi kerak. Aks holda panelda tugma
     * turib, server 404 qaytarardi — "panel buzuq" degan eng
     * yomon taassurot.
     */
    if (!canTouchGroup(scope, group.mahalla?.districtId ?? null)) {
      throw new NotFoundException("Guruh topilmadi");
    }

    /**
     * ⚠️ KANALDA QALQON YOQILMAYDI — SERVER RAD ETADI (fayl
     * boshidagi doktrina). Panelda tugma ham ko'rinmaydi, lekin
     * tekshiruv shu yerda ham KERAK: `PATCH` so'rovi id bilan
     * keladi va panelni chetlab o'tib yuborilishi mumkin. Yoqilgan
     * qiymat bazaga tushsa, kanal qatorida tuzatib bo'lmaydigan
     * "qalqon ishlamayapti" ogohlantirishi paydo bo'lardi.
     *
     * ⚠️ O'CHIRISH ESA RAD ETILMAYDI: eski (kanal qoidasi
     * kiritilishidan oldin) yoqilgan qiymatni tozalash yo'li
     * ochiq qolishi kerak — aks holda bazadagi `true` ni hech kim
     * olib tashlay olmasdi.
     */
    if (dto.guardEnabled && isChannel(group.type)) {
      throw new BadRequestException(
        "Kanalda xavfsizlik qalqoni ishlamaydi: postni kanalning o'z admini yozadi, ya'ni o'chiradigan begona xabar yo'q",
      );
    }

    const updated = await this.prisma.telegramGroup.update({
      where: { chatId },
      data: {
        guardEnabled: dto.guardEnabled,
        guardAt: dto.guardEnabled ? new Date() : null,
        guardBy: dto.guardEnabled ? actorId : null,
      },
      select: { chatId: true, title: true, guardEnabled: true, guardAt: true },
    });

    await this.audit.record({
      userId: actorId,
      action: dto.guardEnabled ? "group.guard_on" : "group.guard_off",
      entity: "telegram_group",
      entityId: chatId,
      meta: { title: group.title },
      ip,
    });

    return updated;
  }

  /**
   * OMMAVIY QALQON — filtrdan o'tgan BARCHA guruh uchun.
   *
   * ⚠️ MFY SHARTI YO'Q, kuzatuv sharti ham yo'q: qalqon
   * `isOfficial` dan MUSTAQIL (fayl boshidagi doktrina). Guruh
   * kuzatuvga yopiq bo'lsa ham undagi odamlarni virusdan himoya
   * qilish mumkin.
   *
   * ⚠️ QAMROV FILTRDAN KELADI (`groupListWhere`), har guruhga
   * alohida `canTouchDistrict` emas: `updateMany` bitta so'rov va
   * uning `where` i allaqachon qamrov bilan cheklangan. Yakka
   * `setGuard` dagi tekshiruv O'RNIDA QOLADI — u id bilan keladi
   * va ro'yxatdan o'tmaydi (CLAUDE.md: "Ruxsat ≠ qamrov").
   *
   * ⚠️ AUDITGA BITTA YOZUV, har guruhga emas — `bulkSetOfficial`
   * bilan AYNI sabab: 200 qator jurnalni o'qib bo'lmaydigan
   * qilardi. Guruhlar `meta.chatIds` da qoladi.
   */
  async bulkSetGuard(
    dto: BulkGuardDto,
    scope: ScopeContext,
    actorId: string,
    ip?: string,
  ) {
    const where = groupListWhere(scope, {
      isOfficial: dto.filterIsOfficial,
      districtId: dto.filterDistrictId,
      mahallaId: dto.filterMahallaId,
      unassigned: dto.filterUnassigned,
      search: dto.filterSearch,
      chatType: dto.filterChatType,
    });

    const candidates = await this.prisma.telegramGroup.findMany({
      where,
      select: { chatId: true, type: true, guardEnabled: true },
    });

    // ⚠️ RO'YXAT O'ZGARGAN BO'LSA RAD ETILADI: operator tasdiqlash
    // oynasida ko'rgan raqam bilan amal paytidagi raqam boshqa
    // bo'lsa, u o'zi ko'rmagan guruhda xabar o'chirishni yoqib
    // yuborardi — qaytarib bo'lmaydigan amal.
    if (dto.expectedCount !== undefined && dto.expectedCount !== candidates.length) {
      throw new BadRequestException(
        `Ro'yxat o'zgardi: tasdiqlashda ${dto.expectedCount} ta edi, hozir ${candidates.length} ta. Sahifani yangilab, qaytadan urinib ko'ring.`,
      );
    }

    /**
     * ⚠️ KANALLAR O'TKAZIB YUBORILADI, AMAL TO'XTAMAYDI
     * (`bulkSetOfficial` dagi "MFYsiz guruhlar" bilan AYNI qoida):
     * filtrda bitta kanal turgani uchun qolgan 40 guruhga qalqon
     * yoqmay qo'yish operatorni boshi berk ko'chaga olib borardi.
     * Soni javobda QAYTARILADI — panel "3 kanal o'tkazib
     * yuborildi" deb aytadi, ya'ni holat JIM qolmaydi.
     *
     * ⚠️ `expectedCount` TEKSHIRUVIDAN KEYIN: operator tasdiqlash
     * oynasida ro'yxatdagi JAMI sonni ko'rgan va u shu bilan
     * solishtiriladi. Kanallar oldin ayirilsa, har tasdiqlash
     * "ro'yxat o'zgardi" xatosi bilan tugardi.
     *
     * ⚠️ O'CHIRISHDA KANAL CHIQARILMAYDI: eski yoqilgan qiymatni
     * tozalash yo'li ochiq qolishi kerak (`setGuard` dagi ayni
     * sabab).
     */
    const skippedChannels = dto.guardEnabled
      ? candidates.filter((g) => !guardApplies(g.type))
      : [];
    const eligible = dto.guardEnabled
      ? candidates.filter((g) => guardApplies(g.type))
      : candidates;

    // ⚠️ HOLATI ALLAQACHON TO'G'RI BO'LGANLAR TEGILMAYDI:
    // `guardAt`/`guardBy` qayta yozilsa, qalqon QACHON va KIM
    // tomonidan yoqilgani yo'qolardi — bu xavfsizlik dalili.
    const pending = eligible.filter((g) => g.guardEnabled !== dto.guardEnabled);
    const chatIds = pending.map((g) => g.chatId);

    if (chatIds.length === 0) {
      return {
        changed: 0,
        unchanged: eligible.length,
        skippedChannels: skippedChannels.length,
        matched: candidates.length,
      };
    }

    const { count } = await this.prisma.telegramGroup.updateMany({
      where: { chatId: { in: chatIds } },
      data: {
        guardEnabled: dto.guardEnabled,
        guardAt: dto.guardEnabled ? new Date() : null,
        guardBy: dto.guardEnabled ? actorId : null,
      },
    });

    await this.audit.record({
      userId: actorId,
      action: dto.guardEnabled ? "group.guard_on_bulk" : "group.guard_off_bulk",
      entity: "telegram_group",
      // ⚠️ `entityId` YO'Q: amal bitta guruhga tegishli emas.
      entityId: null,
      meta: {
        count,
        chatIds,
        /** ⚠️ O'TKAZIB YUBORILGAN KANALLAR HAM DALIL. */
        skippedChannels: skippedChannels.map((g) => g.chatId),
        filter: {
          isOfficial: dto.filterIsOfficial,
          districtId: dto.filterDistrictId,
          mahallaId: dto.filterMahallaId,
          unassigned: dto.filterUnassigned,
          search: dto.filterSearch,
          chatType: dto.filterChatType,
        },
      },
      ip,
    });

    this.logger.log(
      `[Security] ommaviy qalqon ${dto.guardEnabled ? "yoqildi" : "o'chirildi"}: ${count} guruh` +
        (skippedChannels.length > 0
          ? `, ${skippedChannels.length} kanal o'tkazib yuborildi`
          : ""),
    );

    return {
      changed: count,
      unchanged: eligible.length - count,
      /** ⚠️ KANALLAR SONI PANELDA AYTILADI — jim o'tkazilmaydi. */
      skippedChannels: skippedChannels.length,
      matched: candidates.length,
    };
  }
}
