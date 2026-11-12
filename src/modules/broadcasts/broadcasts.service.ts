/**
 * TARQATMA — TUMAN/MFY KESIMIDA XABAR YUBORISH.
 *
 * ── IKKI AUDITORIYA, BITTA OQIM ───────────────────────────────────────
 *
 *   citizens  →  botga yozgan fuqarolarning SHAXSIY chati
 *   groups    →  MFY ning Telegram GURUHLARI
 *
 * ⚠️ IKKISI QO'SHILMAYDI, ALOHIDA SANALADI: guruhdagi odam botga
 * yozmagan bo'lishi mumkin va teskarisi ham — ularni bitta "obunachi"
 * soniga qo'shish bir odamni ikki marta sanardi.
 *
 * ── "BOT GURUHDA HECH NARSA YOZMAYDI" QOIDASI ─────────────────────────
 *
 * ⚠️ QOIDA O'Z KUCHIDA QOLADI va u AVTOMATIK javoblar haqida: bot
 * guruhda o'zidan reaksiya bermaydi, murojaatga javob yozmaydi,
 * "o'chirdim" demaydi. Sabab — o'sha xabar yozishmaga tushib, keyingi
 * tahlilda "guruhda muammo bor" degan SIGNALGA aylanardi.
 *
 * ⚠️ TARQATMA ESA BOSHQA NARSA: uni ODAM boshlaydi, aniq auditoriyaga
 * va bir marta. Aylanish ham yopilgan — kuzatuv BOT YOZGAN xabarni
 * umuman olmaydi (`group-watch/handler.ts` dagi `ctx.from?.is_bot`
 * tekshiruvi), ya'ni e'lon signalga aylanib ketmaydi.
 *
 * ⚠️ SHUNGA QARAMAY `groups` STANDART AUDITORIYA EMAS: panelda uni
 * ATAYLAB tanlash kerak. Guruhga yuborilgan xabarni o'chirib
 * bo'lmaydi va u yuzlab odamning ko'z o'ngida turadi.
 *
 * ── NIMA UCHUN FON'DA ─────────────────────────────────────────────────
 *
 * ⚠️ TARQATMA MINGLAB XABAR BO'LISHI MUMKIN. HTTP so'rovi uni kutib
 * turolmaydi (nginx ham, brauzer ham uzib qo'yadi) va "yubordimmi
 * yo'qmi" degan savol javobsiz qolardi. Shuning uchun yozuv DARHOL
 * yaratiladi, yuborish esa fon'da ketadi — panel holatni so'rab
 * turadi.
 */

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleInit,
} from "@nestjs/common";
import { BroadcastAudience, BroadcastMode, BroadcastStatus } from "@prisma/client";

import { AuditService } from "../../common/audit.service";
import { activeCitizenWhere } from "../../common/citizen-deleted";
import { paginate, type Paginated } from "../../common/dto/pagination.dto";
import { canTouchDistrict, districtScopeWhere, isProvinceWide, type ScopeContext } from "../../common/scope.util";
import {
  copyMessage,
  escapeHtml,
  forwardMessage,
  sendMessage,
} from "../../common/telegram";
import { env } from "../../config/env.config";
import { PrismaService } from "../../prisma/prisma.service";
import type {
  CreateBroadcastDto,
  ListBroadcastsQuery,
} from "./dto/broadcasts.dto";

/**
 * XABARLAR ORASIDAGI PAUZA.
 *
 * ⚠️ TELEGRAM SEKUNDIGA ~30 XABARGA RUXSAT BERADI va undan oshsa
 * `429` qaytaradi. Pauzasiz tarqatma birinchi 30 ta xabardan keyin
 * to'xtab qolardi — aholining yarmi xabarni olmasdi va sababi
 * panelda "failed: 400" bo'lib ko'rinardi.
 *
 * ⚠️ 40 ms = sekundiga 25 ta: chegaradan pastroq, chunki o'sha
 * botdan FUQARO JAVOBLARI ham ketadi (`issue-notify`) va ular
 * tarqatma tufayli yo'qolmasligi kerak.
 */
const SEND_GAP_MS = 40;

/** Guruhga yuborishda pauza uzunroq — guruh chegarasi qattiqroq. */
const GROUP_GAP_MS = 1000;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

@Injectable()
export class BroadcastsService implements OnModuleInit {
  private readonly logger = new Logger(BroadcastsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * YARIM QOLGAN TARQATMALARNI YOPADI.
   *
   * ⚠️ KERAK, CHUNKI YUBORISH FON'DA KETADI: server tarqatma
   * o'rtasida qayta ishga tushsa, yozuv abadiy `sending` holatida
   * qolardi — panel esa uni "hali ketyapti" deb o'qib, har 3
   * soniyada so'rab turardi. Soatlab.
   *
   * ⚠️ AVTOMATIK QAYTA BOSHLANMAYDI va bu ataylab: qayerda
   * to'xtaganini bilmaymiz, ya'ni qayta yuborish bir qism odamga
   * xabarni IKKI MARTA yuborardi. Tarqatma — qaytarib bo'lmaydigan
   * amal, shuning uchun qarorni ODAM qabul qiladi.
   *
   * ⚠️ CHEGARA KENG (2 soat): minglab manzilli tarqatma haqiqatan
   * uzoq ketadi va ishlab turgan jarayonni "yiqilgan" deb
   * belgilash ikki marta yuborishdan ham yomon chalkashlik
   * tug'dirardi.
   */
  async onModuleInit(): Promise<void> {
    const staleBefore = new Date(Date.now() - 2 * 60 * 60 * 1000);

    const { count } = await this.prisma.broadcast
      .updateMany({
        where: {
          status: { in: [BroadcastStatus.pending, BroadcastStatus.sending] },
          createdAt: { lt: staleBefore },
        },
        data: {
          status: BroadcastStatus.failed,
          error:
            "Server qayta ishga tushganda uzilib qoldi — qayta yuborish kerak bo'lishi mumkin",
          finishedAt: new Date(),
        },
      })
      .catch(() => ({ count: 0 }));

    if (count > 0) {
      this.logger.warn(`${count} ta yarim qolgan tarqatma yopildi`);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  QAMROV VA TEKSHIRUV
  // ═══════════════════════════════════════════════════════════════

  /**
   * SO'ROVNI TEKSHIRADI va hududni ANIQLAYDI.
   *
   * ⚠️ MFY BERILSA TUMANI O'ZI TOPILADI: panelda "Marhamat tumani"
   * tanlab turib, boshqa tumanning MFY siga yuborish mumkin
   * bo'lmasligi kerak — ikkisi mos kelmasa so'rov RAD ETILADI.
   */
  private async resolveScope(
    dto: {
      districtId?: string;
      mahallaId?: string;
      mode: BroadcastMode;
      message?: string;
      fromChatId?: string;
      sourceMessageId?: string;
    },
    scope: ScopeContext,
  ): Promise<{ districtId: string | null; mahallaId: string | null }> {
    if (!env.botToken) {
      throw new BadRequestException("BOT_TOKEN sozlanmagan — xabar yuborib bo'lmaydi");
    }

    // ── MAZMUN ────────────────────────────────────────────────────
    if (dto.mode === BroadcastMode.text) {
      if (!dto.message?.trim()) {
        throw new BadRequestException("Xabar matni bo'sh");
      }
    } else if (!dto.fromChatId || !dto.sourceMessageId) {
      /**
       * ⚠️ MANBASIZ FORWARD — JIM BO'SH XABAR: Telegram shunchaki
       * xato qaytaradi va tarqatma "0 yuborildi" bo'lib tugardi.
       */
      throw new BadRequestException(
        "Uzatiladigan xabar ko'rsatilmagan — avval xabarni botga tashlang",
      );
    }

    // ── HUDUD ─────────────────────────────────────────────────────
    let districtId = dto.districtId ?? null;
    let mahallaId = dto.mahallaId ?? null;

    if (mahallaId) {
      const mahalla = await this.prisma.mahalla.findUnique({
        where: { id: mahallaId },
        select: { id: true, districtId: true },
      });
      if (!mahalla) throw new NotFoundException("MFY topilmadi");

      if (districtId && districtId !== mahalla.districtId) {
        throw new BadRequestException("Tanlangan MFY bu tumanga tegishli emas");
      }
      districtId = mahalla.districtId;
    }

    /**
     * ⚠️ VILOYAT QAMROVISIZ XODIM BUTUN VILOYATGA YUBORA OLMAYDI:
     * tuman xodimi uchun `districtId` MAJBURIY va u faqat O'Z tumani
     * bo'lishi mumkin. Aks holda tuman operatori butun viloyatga
     * xabar tarqatib yuborardi.
     */
    if (!isProvinceWide(scope)) {
      if (!districtId) {
        throw new ForbiddenException(
          "Butun viloyatga yuborish uchun viloyat qamrovi kerak — tuman yoki MFY tanlang",
        );
      }
      if (!canTouchDistrict(scope, districtId)) {
        throw new ForbiddenException("Bu tuman sizning qamrovingizda emas");
      }
    } else if (districtId && !canTouchDistrict(scope, districtId)) {
      throw new ForbiddenException("Bu tuman sizning qamrovingizda emas");
    }

    return { districtId, mahallaId };
  }

  // ═══════════════════════════════════════════════════════════════
  //  MANZILLAR
  // ═══════════════════════════════════════════════════════════════

  /**
   * FUQARO MANZILLARI — SHAXSIY CHAT.
   *
   * ⚠️ `telegramId: { not: null }` MAJBURIY: Google bilan kirgan
   * fuqaroda u YO'Q va unga Telegram orqali xabar yuborib bo'lmaydi.
   * Filtrsiz ular "failed" bo'lib sanalardi va panelda "yuborilmadi:
   * 400" degan qo'rqinchli son chiqardi — aslida esa hech narsa
   * buzilmagan (CLAUDE.md — "telegramId endi ixtiyoriy").
   *
   * ⚠️ BLOKLANGAN VA O'CHIRILGAN HISOBGA YOZILMAYDI.
   */
  private async citizenChatIds(
    districtId: string | null,
    mahallaId: string | null,
  ): Promise<string[]> {
    const rows = await this.prisma.citizen.findMany({
      where: {
        isBlocked: false,
        ...activeCitizenWhere,
        telegramId: { not: null },
        ...(districtId ? { districtId } : {}),
        ...(mahallaId ? { mahallaId } : {}),
      },
      select: { telegramId: true },
    });

    return rows
      .map((row) => row.telegramId)
      .filter((id): id is string => Boolean(id));
  }

  /**
   * GURUH MANZILLARI — MFY GURUHLARI.
   *
   * ⚠️ FAQAT BOT ICHIDA TURGAN GURUHLAR (`leftAt: null`): chiqarib
   * yuborilgan guruhga yuborish har safar xato berardi va "failed"
   * sonini mazmunsiz shishirardi.
   *
   * ⚠️ MFY BIRIKTIRILMAGAN GURUHGA YUBORILMAYDI: u qaysi tumanga
   * tegishli ekani NOMA'LUM va "hammaga" tarqatmada ham begona
   * (test, tasodifiy) guruhlar bor. Hududsiz guruhga e'lon yuborish
   * — eng oson qilinadigan jiddiy xato.
   */
  private async groupChatIds(
    districtId: string | null,
    mahallaId: string | null,
  ): Promise<string[]> {
    const rows = await this.prisma.telegramGroup.findMany({
      where: {
        leftAt: null,
        ...(mahallaId
          ? { mahallaId }
          : districtId
            ? { mahalla: { districtId } }
            : { mahallaId: { not: null } }),
      },
      select: { chatId: true },
    });

    return rows.map((row) => row.chatId);
  }

  /**
   * AUDITORIYA HAJMI — YUBORISHDAN OLDIN.
   *
   * ⚠️ TASDIQ EKRANI UCHUN: "1 240 kishiga yuboriladi" degan son
   * yuboruvchini TO'XTATADI, agar hudud noto'g'ri tanlangan bo'lsa.
   * Usiz xato faqat yuborilgandan KEYIN bilinardi — qaytarib
   * bo'lmaydigan paytda.
   */
  async preview(
    dto: { audience: BroadcastAudience; districtId?: string; mahallaId?: string },
    scope: ScopeContext,
  ) {
    const { districtId, mahallaId } = await this.resolveScope(
      { ...dto, mode: BroadcastMode.text, message: "preview" },
      scope,
    );

    const wantsCitizens =
      dto.audience === BroadcastAudience.citizens ||
      dto.audience === BroadcastAudience.both;
    const wantsGroups =
      dto.audience === BroadcastAudience.groups ||
      dto.audience === BroadcastAudience.both;

    const [citizens, groups] = await Promise.all([
      wantsCitizens ? this.citizenChatIds(districtId, mahallaId) : Promise.resolve([]),
      wantsGroups ? this.groupChatIds(districtId, mahallaId) : Promise.resolve([]),
    ]);

    return {
      citizens: citizens.length,
      groups: groups.length,
      total: citizens.length + groups.length,
    };
  }

  // ═══════════════════════════════════════════════════════════════
  //  YUBORISH
  // ═══════════════════════════════════════════════════════════════

  /**
   * TARQATMANI BOSHLAYDI.
   *
   * ⚠️ YOZUV AVVAL YARATILADI, KEYIN YUBORILADI: jarayon o'rtasida
   * server qayta ishga tushsa ham "nima yuborilgani" dalili qoladi.
   *
   * ⚠️ `void this.run(...)` — ATAYLAB KUTILMAYDI. Javob darhol
   * qaytadi va panel holatni so'rab turadi. `await` qilinsa, HTTP
   * so'rovi minglab xabar davomida ochiq turardi.
   */
  async create(dto: CreateBroadcastDto, scope: ScopeContext, via: "panel" | "bot") {
    const { districtId, mahallaId } = await this.resolveScope(dto, scope);

    const broadcast = await this.prisma.broadcast.create({
      data: {
        audience: dto.audience,
        mode: dto.mode,
        text: dto.mode === BroadcastMode.text ? dto.message!.trim() : null,
        fromChatId: dto.fromChatId ?? null,
        sourceMessageId: dto.sourceMessageId ?? null,
        districtId,
        mahallaId,
        createdBy: scope.userId,
        via,
      },
      select: { id: true, status: true, createdAt: true },
    });

    await this.audit.record({
      userId: scope.userId,
      action: "broadcast.send",
      entity: "Broadcast",
      entityId: broadcast.id,
      meta: {
        audience: dto.audience,
        mode: dto.mode,
        districtId,
        mahallaId,
        via,
      },
    });

    void this.run(broadcast.id).catch((error: Error) => {
      this.logger.error(`Tarqatma ${broadcast.id} yiqildi: ${error.message}`);
    });

    return { id: broadcast.id, status: broadcast.status, createdAt: broadcast.createdAt };
  }

  /**
   * FON JARAYONI — manzillarni aylanib chiqadi.
   *
   * ⚠️ XATO BITTA MANZILDA TO'XTATMAYDI: kimdir botni bloklagan
   * bo'lsa (403), qolganlarga yuborilaveradi. Shuning uchun har
   * natija alohida sanaladi.
   *
   * ⚠️ SANOQ ORALIQDA HAM YOZILADI (har 25 ta): tarqatma uzoq
   * davom etadi va panel "qancha ketdi" degan savolga javob
   * ko'rsatishi kerak — oxirida bir marta yozilsa, ekranda soatlab
   * `0` turardi.
   */
  private async run(id: string): Promise<void> {
    const broadcast = await this.prisma.broadcast.findUnique({ where: { id } });
    if (!broadcast) return;

    const wantsCitizens =
      broadcast.audience === BroadcastAudience.citizens ||
      broadcast.audience === BroadcastAudience.both;
    const wantsGroups =
      broadcast.audience === BroadcastAudience.groups ||
      broadcast.audience === BroadcastAudience.both;

    const [citizens, groups] = await Promise.all([
      wantsCitizens
        ? this.citizenChatIds(broadcast.districtId, broadcast.mahallaId)
        : Promise.resolve([]),
      wantsGroups
        ? this.groupChatIds(broadcast.districtId, broadcast.mahallaId)
        : Promise.resolve([]),
    ]);

    const targets: { chatId: string; gap: number }[] = [
      ...citizens.map((chatId) => ({ chatId, gap: SEND_GAP_MS })),
      ...groups.map((chatId) => ({ chatId, gap: GROUP_GAP_MS })),
    ];

    await this.prisma.broadcast.update({
      where: { id },
      data: {
        status: BroadcastStatus.sending,
        startedAt: new Date(),
        total: targets.length,
      },
    });

    const html = broadcast.text ? escapeHtml(broadcast.text) : null;

    let sent = 0;
    let failed = 0;

    for (let index = 0; index < targets.length; index += 1) {
      const target = targets[index];

      const result =
        broadcast.mode === BroadcastMode.text
          ? await sendMessage(target.chatId, html ?? "")
          : broadcast.mode === BroadcastMode.forward
            ? await forwardMessage(
                target.chatId,
                broadcast.fromChatId!,
                broadcast.sourceMessageId!,
              )
            : await copyMessage(
                target.chatId,
                broadcast.fromChatId!,
                broadcast.sourceMessageId!,
              );

      if (result.ok) sent += 1;
      else failed += 1;

      /**
       * ⚠️ `429` DA TELEGRAM AYTGAN VAQT KUTILADI: o'zimiz tanlagan
       * pauza yetmaganini FAQAT Telegram biladi va uni e'tiborsiz
       * qoldirish qolgan hamma xabarning rad etilishiga olib kelardi.
       */
      if (result.retryAfter) {
        await sleep(Math.min(result.retryAfter, 60) * 1000);
      } else if (index < targets.length - 1) {
        await sleep(target.gap);
      }

      if ((index + 1) % 25 === 0) {
        await this.prisma.broadcast
          .update({ where: { id }, data: { sent, failed } })
          .catch(() => undefined);
      }
    }

    await this.prisma.broadcast.update({
      where: { id },
      data: {
        status: BroadcastStatus.done,
        sent,
        failed,
        finishedAt: new Date(),
      },
    });

    this.logger.log(`Tarqatma ${id}: ${sent} yuborildi, ${failed} yuborilmadi`);
  }

  // ═══════════════════════════════════════════════════════════════
  //  O'QISH
  // ═══════════════════════════════════════════════════════════════

  async list(
    scope: ScopeContext,
    query: ListBroadcastsQuery,
  ): Promise<Paginated<unknown>> {
    /**
     * ⚠️ QAMROV: tuman xodimi faqat O'Z tumaniga ketgan tarqatmani
     * ko'radi. Viloyat tarqatmasi (`districtId: null`) esa faqat
     * viloyat darajasiga — u butun aholiga ketgan va tuman xodimining
     * ishi emas.
     */
    const where = {
      ...(isProvinceWide(scope) ? {} : districtScopeWhere(scope)),
      ...(query.status ? { status: query.status } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.broadcast.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: query.skip,
        take: query.limit,
        select: {
          id: true,
          audience: true,
          mode: true,
          text: true,
          status: true,
          total: true,
          sent: true,
          failed: true,
          error: true,
          via: true,
          createdAt: true,
          finishedAt: true,
          district: { select: { id: true, name: true } },
          mahalla: { select: { id: true, name: true } },
          author: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.broadcast.count({ where }),
    ]);

    return paginate(items, total, query);
  }

  async findOne(id: string, scope: ScopeContext) {
    const broadcast = await this.prisma.broadcast.findUnique({
      where: { id },
      select: {
        id: true,
        audience: true,
        mode: true,
        text: true,
        status: true,
        total: true,
        sent: true,
        failed: true,
        error: true,
        via: true,
        createdAt: true,
        startedAt: true,
        finishedAt: true,
        districtId: true,
        district: { select: { id: true, name: true } },
        mahalla: { select: { id: true, name: true } },
        author: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!broadcast) throw new NotFoundException("Tarqatma topilmadi");

    if (!isProvinceWide(scope) && !canTouchDistrict(scope, broadcast.districtId)) {
      throw new ForbiddenException("Bu tarqatma sizning qamrovingizda emas");
    }

    return broadcast;
  }
}
