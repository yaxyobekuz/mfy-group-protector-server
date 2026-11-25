/**
 * TELEGRAM GURUHLARI — reyestr va kuzatuv navbati.
 *
 * Bu modul IKKI TOMONGA qaraydi:
 *
 *   BOT  →  `recordMembership` / `touchFromMessage` / `captureMessage`
 *   PANEL → `list` / `setOfficial` / `assignMahalla`
 *
 * ⚠️ TELEGRAM YOZADIGAN VA ODAM YOZADIGAN MAYDONLAR QAT'IY AJRATILGAN.
 * Bot `isOfficial`, `mahallaId` ga HECH QACHON tegmaydi; panel esa
 * `title`, `status`, `username` ga tegmaydi. Aralashsa: guruh nomi
 * o'zgargan paytda "rasmiy" belgisi jimgina o'chib ketardi (bot
 * `upsert` qilganda butun qatorni yangilab yuborgani uchun).
 *
 * ⚠️ NIMA UCHUN REYESTR UMUMAN KERAK: Telegram Bot API'da "men qaysi
 * guruhlarda a'zoman" degan savolga javob beradigan metod YO'Q.
 * `getChats` faqat MTProto'da, ya'ni ODAM nomidan ulanishda. Bot faqat
 * O'ZIGA kelgan hodisadan biladi, shuning uchun ro'yxatni biz
 * to'playmiz.
 *
 * ── GURUH VA KANAL BITTA REYESTRDA, LEKIN AYNI EMAS ───────────────────
 *
 * ⚠️ IKKINCHI JADVAL OCHILMADI: kuzatuv oqimi (post → AI → signal →
 * muammo) ikkisida ham AYNI va alohida jadval butun oqimni —
 * `GroupMessage`, `GroupSignal`, qamrov, eksport — ikki nusxaga
 * bo'lib yuborardi.
 *
 * ⚠️ FARQ FAQAT QALQONDA (`common/chat-type.ts`): kanalda zararli
 * kontentni o'sha kanalning O'Z admini yozadi, ya'ni o'chirish
 * ma'nosini yo'qotadi. Shuning uchun kanal uchun qalqon sanoqchilari
 * (`guarded`, `guardBlind`) va "o'chirish huquqi yo'q" auditi
 * ISHLAMAYDI — aks holda panelda hech qachon nolga tushmaydigan
 * ogohlantirish turardi.
 */

import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";

import { PrismaService } from "../../prisma/prisma.service";
import {
  CHANNEL_TYPE,
  guardApplies,
  guardScopeWhere,
  isChannel,
  WATCHED_CHAT_TYPES,
} from "../../common/chat-type";
import { groupListWhere } from "../../common/group-filter.util";
import {
  canTouchDistrict,
  canTouchGroup,
  canTouchUnassigned,
  mahallaScopeWhere,
  type ScopeContext,
} from "../../common/scope.util";
import { paginate, type Paginated } from "../../common/dto/pagination.dto";
import type {
  AssignMahallaDto,
  BulkOfficialDto,
  CaptureMessageDto,
  ListGroupsQuery,
  MembershipDto,
  SetOfficialDto,
  TouchGroupDto,
} from "./dto/groups.dto";

/**
 * Bitta xabardan saqlanadigan eng uzun matn.
 *
 * ⚠️ CHEGARA KERAK: guruhga uzun hujjat tashlansa u butunlay navbatga
 * tushib, AI so'rovini ham, bazani ham shishirardi. 2000 belgi —
 * muammo bayoni uchun yetarlidan ko'p.
 */
const MAX_TEXT = 2000;

/** Telegram `ChatMember.status` — "bot hali ichidami". */
const PRESENT_STATUSES = new Set(["administrator", "member", "restricted"]);

@Injectable()
export class GroupsService {
  private readonly logger = new Logger(GroupsService.name);

  constructor(
    private readonly prisma: PrismaService,
  ) {}

  // ═══════════════════════════════════════════════════════════════
  //  BOT TOMONI
  // ═══════════════════════════════════════════════════════════════

  /**
   * `my_chat_member` hodisasini reyestrga yozadi.
   *
   * Bu hodisa bot guruhga qo'shilganda, admin qilinganda, huquqi
   * o'zgarganda va chiqarilganda keladi — ya'ni ro'yxatning ASOSIY
   * manbasi.
   */
  async recordMembership(dto: MembershipDto) {
    if (!WATCHED_CHAT_TYPES.has(dto.type)) return { skipped: true as const };

    const present = PRESENT_STATUSES.has(dto.status);

    /**
     * ⚠️ OLDINGI HOLAT UPSERT DAN OLDIN O'QILADI: upsert dan keyin
     * u allaqachon YANGISI bo'lib qoladi va "nima o'zgardi" degan
     * savolga javob yo'qolardi.
     */
    const before = await this.prisma.telegramGroup.findUnique({
      where: { chatId: dto.chatId },
      select: { status: true, canDeleteMessages: true, title: true },
    });

    // Telegram'dan kelgan maydonlar — HAR hodisada yangilanadi. Guruh
    // nomi o'zgarsa reyestrda eski nom turib qolsa, panelda butunlay
    // boshqa guruh belgilangandek ko'rinardi.
    const fromTelegram = {
      type: dto.type,
      title: dto.title?.trim() || dto.chatId,
      username: dto.username?.trim() || null,
      status: dto.status,
      canPostMessages: dto.canPostMessages ?? false,
      canInviteUsers: dto.canInviteUsers ?? false,
      // ⚠️ QALQONNING HAQIQIY SHARTI: `guardEnabled` ma'muriyat
      // xohishi, bu esa Telegram ruxsati. Ikkisi boshqa-boshqa.
      canDeleteMessages: dto.canDeleteMessages ?? false,
      ...(dto.memberCount !== undefined
        ? { memberCount: dto.memberCount, memberCountAt: new Date() }
        : {}),
      // Bot ichida bo'lsa `leftAt` TOZALANADI: qayta qo'shilgan guruh
      // "chiqib ketgan" bo'lib qolmasligi kerak.
      leftAt: present ? null : new Date(),
    };

    const group = await this.prisma.telegramGroup.upsert({
      where: { chatId: dto.chatId },
      // ⚠️ `isOfficial`, `mahallaId` va `official*` BERILMAYDI —
      // ular PANELNING maydonlari (fayl boshidagi izoh).
      update: fromTelegram,
      create: {
        chatId: dto.chatId,
        ...fromTelegram,
        addedByTgId: dto.addedByTgId ?? null,
      },
    });

    await this.recordMembershipAudit(dto, before, present);

    return { chatId: group.chatId, status: group.status };
  }

  /**
   * BOT GURUHGA QO'SHILGANI / CHIQARILGANI — AUDITGA.
   *
   * ── NIMA UCHUN KERAK ────────────────────────────────────────────
   *
   * ⚠️ BOT GURUHDAN CHIQARILGANI JIMGINA SODIR BO'LADI: Telegram
   * hodisa yuboradi, reyestrda `status` o'zgaradi — va hammasi
   * shu. Bot guruhga hech narsa YOZMAYDI (doktrina), panelda esa
   * guruh shunchaki ro'yxatdan yo'qolib qoladi. Natijada o'sha
   * mahalladan signal ham, xavfsizlik hodisasi ham kelmay
   * qo'yadi — va "nega bu MFY da muammo yo'q" degan savolga
   * "chunki bot u yerda yo'q" degan javobni hech kim topa
   * olmasdi.
   *
   * ⚠️ AUDIT — append-only (doktrina): yozuv qoladi va "qachondan
   * beri kuzatuvsiz" degan savolga ANIQ sana bilan javob beradi.
   *
   * ── FAQAT O'ZGARISH YOZILADI ────────────────────────────────────
   *
   * ⚠️ HAR HODISA YOZILMAYDI: Telegram `my_chat_member` ni guruh
   * nomi o'zgarganda ham yuboradi va auditga bir xil yozuvlar
   * uyumi tushardi — muhim hodisa esa ular orasida ko'rinmay
   * ketardi.
   *
   * ⚠️ XATO YUTILADI: audit — DALIL, lekin uning yozilmagani
   * reyestrni yangilashni to'xtatmasligi kerak. Aks holda bot
   * guruhdan chiqarilgani umuman qayd etilmay qolardi.
   */
  private async recordMembershipAudit(
    dto: MembershipDto,
    before: { status: string; canDeleteMessages: boolean; title: string } | null,
    present: boolean,
  ): Promise<void> {
    try {
      const wasPresent = before ? PRESENT_STATUSES.has(before.status) : false;

      /**
       * ⚠️ BIRINCHI KO'RISH ALOHIDA HODISA: bot yangi guruhga
       * qo'shildi. `before` yo'qligini "chiqarilgan" deb o'qish
       * mumkin emas.
       */
      let action: string | null = null;

      if (!before) {
        action = present ? "group.bot_joined" : null;
      } else if (wasPresent && !present) {
        // ⚠️ ENG MUHIM HOLAT: kuzatuv va qalqon TO'XTADI.
        action = "group.bot_removed";
      } else if (!wasPresent && present) {
        action = "group.bot_joined";
      } else if (
        present &&
        /**
         * ⚠️ KANALDA O'CHIRISH HUQUQI KUZATILMAYDI: qalqon u
         * yerda umuman ishga tushmaydi (`common/chat-type.ts`),
         * ya'ni "bot o'chira olmaydi" degan yozuv auditni
         * tuzatib bo'lmaydigan ogohlantirish bilan
         * to'ldirardi — va haqiqiy hodisalar ular orasida
         * ko'rinmay ketardi.
         */
        guardApplies(dto.type) &&
        before.canDeleteMessages !== (dto.canDeleteMessages ?? false)
      ) {
        /**
         * ⚠️ O'CHIRISH HUQUQI YO'QOLGANI HAM YOZILADI: qalqon
         * panelda "yoqilgan" bo'lib ko'rinadi, lekin bot hech
         * narsa o'chira olmaydi — va u guruhga ogohlantirish
         * YOZMAYDI, ya'ni buni hech kim sezmasdi
         * (`GroupStats.guardBlind` bilan ayni sabab).
         */
        action = (dto.canDeleteMessages ?? false)
          ? "group.bot_can_delete"
          : "group.bot_cannot_delete";
      }

      if (!action) return;

    } catch (error) {
      this.logger.warn(
        `A'zolik auditi yozilmadi (${dto.chatId}): ${(error as Error).message}`,
      );
    }
  }

  /**
   * ZAXIRA YO'L — guruhdan xabar kelganda reyestrni "yangilab qo'yadi".
   *
   * ⚠️ KERAK, CHUNKI `my_chat_member` O'TMISHGA QARAMAYDI: bot bu kod
   * joylashtirilishidan OLDIN a'zo bo'lgan guruh ro'yxatga O'ZI
   * tushmaydi (Telegram o'tgan hodisalarni qayta yubormaydi).
   * Aksariyat guruhda kunda xabar bo'ladi, ya'ni ro'yxat shu yo'l
   * bilan o'zi to'lib boradi.
   *
   * ⚠️ HOLATGA TEGMAYDI: xabar kelishi botning admin ekanini
   * bildirmaydi. Yangi qator `member` holatida yoziladi, mavjud
   * qatorning `status` ustuni esa O'ZGARMAY qoladi — aks holda admin
   * guruh har xabarda oddiy a'zoga tushib ketardi.
   */
  async touchFromMessage(dto: TouchGroupDto) {
    if (!WATCHED_CHAT_TYPES.has(dto.type)) return { skipped: true as const };

    const title = dto.title?.trim() || dto.chatId;

    /**
     * ⚠️ A'ZOLAR SONI FAQAT KELGANDA YOZILADI. `undefined` ni
     * "0 a'zo" deb yozish panelda "guruhda hech kim yo'q" degan
     * noto'g'ri raqam chiqarardi — bot esa sonni 6 soatda bir marta
     * o'qiydi, ya'ni aksariyat xabarda u BERILMAYDI.
     */
    const counted =
      dto.memberCount !== undefined
        ? { memberCount: dto.memberCount, memberCountAt: new Date() }
        : {};

    const group = await this.prisma.telegramGroup.upsert({
      where: { chatId: dto.chatId },
      update: {
        type: dto.type,
        title,
        username: dto.username?.trim() || null,
        ...counted,
      },
      create: {
        chatId: dto.chatId,
        type: dto.type,
        title,
        username: dto.username?.trim() || null,
        ...counted,
      },
    });

    // Bot shu javobdan "xabarni yuborishim kerakmi" deb biladi — har
    // xabarda ikkinchi so'rov qilmasligi uchun.
    return { chatId: group.chatId, isOfficial: group.isOfficial };
  }

  /**
   * KUZATUV — rasmiy guruhdagi xabarni tahlil navbatiga yozadi.
   *
   * ⚠️ FAQAT `isOfficial` GURUHDAN. Reyestrda bot tasodifan
   * qo'shilgan, test va umuman begona guruhlar ham bor — ularning
   * yozishmasini o'qish mumkin emas. "Rasmiy" belgisi ma'muriyat
   * qo'lida va aynan shu KUZATUVGA ROZILIK ma'nosini bildiradi.
   *
   * ⚠️ TEKSHIRUV HAR XABARDA: belgi panelda istalgan payt olib
   * tashlanishi mumkin va o'shandan keyingi xabar yozilmasligi kerak.
   * Bu bitta indeksli o'qish (`chat_id` — PK).
   */
  async captureMessage(dto: CaptureMessageDto) {
    const text = dto.text?.trim();
    // ⚠️ MATN BO'LMASA YOZILMAYDI: stiker, rasm, ovozli xabar va
    // xizmat xabarlari (kirdi/chiqdi) tahlilga hech narsa bermaydi,
    // lekin navbatni va AI hisobini shishirardi.
    if (!text) return { skipped: "no-text" as const };

    const group = await this.prisma.telegramGroup.findUnique({
      where: { chatId: dto.chatId },
      select: { isOfficial: true },
    });

    if (!group?.isOfficial) return { skipped: "not-official" as const };

    // ⚠️ `upsert` + BO'SH `update`: bir xabar ikki marta kelsa (bot
    // qayta ishga tushdi, Telegram takrorladi) jim o'tkaziladi.
    // `create` bilan yozilsa unique xatosi logni to'ldirardi.
    const message = await this.prisma.groupMessage.upsert({
      where: { chatId_messageId: { chatId: dto.chatId, messageId: dto.messageId } },
      update: {},
      create: {
        chatId: dto.chatId,
        messageId: dto.messageId,
        senderTgId: dto.senderTgId ?? null,
        senderName: dto.senderName?.trim() || null,
        text: text.slice(0, MAX_TEXT),
        replyToText: dto.replyToText?.trim().slice(0, MAX_TEXT) || null,
        // ⚠️ Telegram `date` — SONIYADA, millisekundda emas.
        sentAt: dto.sentAt ? new Date(dto.sentAt * 1000) : new Date(),
      },
    });

    return { id: message.id, queued: true as const };
  }

  // ═══════════════════════════════════════════════════════════════
  //  PANEL TOMONI
  // ═══════════════════════════════════════════════════════════════

  async list(scope: ScopeContext, query: ListGroupsQuery): Promise<Paginated<unknown>> {
    const where = groupListWhere(scope, query);

    const [groups, total] = await Promise.all([
      this.prisma.telegramGroup.findMany({
        where,
        orderBy: [{ isOfficial: "desc" }, { title: "asc" }],
        skip: query.skip,
        take: query.limit,
        include: {
          mahalla: {
            select: { id: true, name: true, district: { select: { id: true, name: true } } },
          },
          officialUser: { select: { id: true, firstName: true, lastName: true } },
          _count: {
            select: {
              // Navbatda nechta xabar turgani — kuzatuv ishlayotganini
              // ko'rsatadigan yagona belgi.
              messages: { where: { analyzedAt: null } },
              signals: { where: { status: "new" } },
            },
          },
        },
      }),
      this.prisma.telegramGroup.count({ where }),
    ]);

    const items = groups.map((group) => ({
      chatId: group.chatId,
      type: group.type,
      /**
       * ⚠️ TUR MATNI YONIDA ALOHIDA BAYROQ: panelda "kanalmi"
       * degan savol o'nlab joyda so'raladi (qalqon tugmasi,
       * ogohlantirish yorlig'i, ustunlar) va har joyda
       * `type === "channel"` deb yozilsa, bittasi albatta
       * unutilardi. Server bir marta hal qiladi.
       */
      isChannel: isChannel(group.type),
      title: group.title,
      username: group.username,
      status: group.status,
      // Bot hali ichidami — panelda "chiqarib yuborilgan" belgisi.
      isPresent: PRESENT_STATUSES.has(group.status),
      canPostMessages: group.canPostMessages,
      isOfficial: group.isOfficial,
      officialAt: group.officialAt,
      officialBy: group.officialUser,
      // ⚠️ `isOfficial` DAN ALOHIDA: qalqon — aholini himoya
      // qilish, `isOfficial` — yozishmani o'qishga rozilik.
      guardEnabled: group.guardEnabled,
      guardAt: group.guardAt,
      /**
       * ⚠️ QALQONNING HAQIQIY SHARTI. `guardEnabled` — ma'muriyat
       * XOHISHI, bu esa Telegram RUXSATI. Ikkisi ajralsa, qalqon
       * "yoqilgan" bo'lib ko'rinib, amalda hech narsa o'chirmaydi —
       * va bot ogohlantirish yozmagani uchun buni hech kim sezmaydi.
       */
      canDeleteMessages: group.canDeleteMessages,
      /** ⚠️ `null` — "hali o'qilmagan", `0` dan BOSHQA narsa. */
      memberCount: group.memberCount,
      memberCountAt: group.memberCountAt,
      mahalla: group.mahalla,
      joinedAt: group.joinedAt,
      leftAt: group.leftAt,
      pendingMessages: group._count.messages,
      newSignals: group._count.signals,
    }));

    return paginate(items, total, query);
  }

  /**
   * RASMIY BELGISINI QO'YADI/OLADI — KUZATUVGA ROZILIK.
   *
   * ⚠️ ENG SEZGIR AMAL: shu belgi qo'yilgandan keyin tizim guruhdagi
   * xabarlarni O'QIY BOSHLAYDI. Shuning uchun (1) alohida ruxsat
   * (`groups.official`), (2) auditga yoziladi, (3) MFY biriktirilgan
   * bo'lishi TALAB QILINADI.
   *
   * ⚠️ MFY MAJBURIY: biriktirilmagan guruhdan kelgan signal HECH
   * QAYSI tumanga tegishli bo'lmay, faqat viloyat xodimiga
   * ko'rinardi — ya'ni amalda hech kim ko'rmasdi. Belgi qo'yishdan
   * oldin hudud aniq bo'lishi kerak.
   */
  async setOfficial(chatId: string, dto: SetOfficialDto, scope: ScopeContext) {
    const group = await this.prisma.telegramGroup.findUnique({
      where: { chatId },
      include: { mahalla: { select: { districtId: true } } },
    });
    if (!group) throw new NotFoundException("Guruh topilmadi");

    if (!canTouchGroup(scope, group.mahalla?.districtId ?? null)) {
      throw new BadRequestException("Bu guruh sizning qamrovingizda emas");
    }

    if (dto.isOfficial && !group.mahallaId) {
      throw new BadRequestException(
        "Avval guruhni MFY ga biriktiring — aks holda signallar hududsiz qoladi",
      );
    }

    const updated = await this.prisma.telegramGroup.update({
      where: { chatId },
      data: {
        isOfficial: dto.isOfficial,
        officialAt: dto.isOfficial ? new Date() : null,
        officialBy: dto.isOfficial ? scope.userId : null,
      },
    });

    // ⚠️ BELGI OLINGANDA NAVBAT TOZALANADI: rozilik qaytarib
    // olingandan keyin tahlil qilinmagan xabarlarni saqlab qolish
    // "o'qimaymiz" degan qarorga qarshi bo'lardi. Tahlil
    // qilinganlari (`analyzedAt` bor) baribir 24 soatda o'chadi.
    if (!dto.isOfficial) {
      const { count } = await this.prisma.groupMessage.deleteMany({
        where: { chatId, analyzedAt: null },
      });
      if (count > 0) {
        this.logger.log(
          `[Groups] ${chatId} rasmiy belgisi olindi — ${count} tahlilsiz xabar o'chirildi`,
        );
      }
    }

    return { chatId: updated.chatId, isOfficial: updated.isOfficial };
  }

  /**
   * OMMAVIY KUZATUV — filtrdan o'tgan BARCHA guruh uchun.
   *
   * ⚠️ MFYSIZ GURUHLAR O'TKAZIB YUBORILADI, amal TO'XTAMAYDI.
   * Yakka `setOfficial` ularni rad etadi (signallar hududsiz
   * qolardi) va bu qoida bu yerda ham kuchda — lekin bitta
   * biriktirilmagan guruh tufayli qolgan 40 tasini yoqmay qo'yish
   * operatorni boshi berk ko'chaga olib borardi. Ular SANALADI va
   * javobda qaytariladi: panel "3 tasi MFYsiz — o'tkazib
   * yuborildi" deb aytadi, ya'ni holat JIM qolmaydi.
   *
   * ⚠️ O'CHIRISHDA BU CHEKLOV YO'Q: kuzatuvni to'xtatish uchun
   * hudud kerak emas.
   *
   * ⚠️ AUDITGA BITTA YOZUV, har guruhga emas: 200 ta qator
   * jurnalni o'qib bo'lmaydigan qilardi (`audit.service.ts`
   * izohi — "hamma narsani yozish"). Qaysi guruhlar ekani `meta`
   * ichida `chatIds` sifatida qoladi, ya'ni dalil yo'qolmaydi.
   */
  async bulkSetOfficial(dto: BulkOfficialDto, scope: ScopeContext) {
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
      select: { chatId: true, mahallaId: true, isOfficial: true },
    });

    // ⚠️ RO'YXAT O'ZGARGAN BO'LSA RAD ETILADI: operator tasdiqlash
    // oynasida ko'rgan raqam bilan amal paytidagi raqam boshqa
    // bo'lsa, u o'zi ko'rmagan guruhni yoqib yuborardi.
    if (dto.expectedCount !== undefined && dto.expectedCount !== candidates.length) {
      throw new BadRequestException(
        `Ro'yxat o'zgardi: tasdiqlashda ${dto.expectedCount} ta edi, hozir ${candidates.length} ta. Sahifani yangilab, qaytadan urinib ko'ring.`,
      );
    }

    // ⚠️ HOLATI ALLAQACHON TO'G'RI BO'LGANLAR TEGILMAYDI: `officialAt`
    // va `officialBy` qayta yozilsa, kuzatuv QACHON va KIM
    // tomonidan yoqilgani — rozilik dalili — yo'qolardi.
    const alreadySet = candidates.filter((g) => g.isOfficial === dto.isOfficial);
    const pending = candidates.filter((g) => g.isOfficial !== dto.isOfficial);

    const skippedNoMahalla = dto.isOfficial
      ? pending.filter((g) => !g.mahallaId)
      : [];
    const targets = dto.isOfficial
      ? pending.filter((g) => g.mahallaId)
      : pending;

    const chatIds = targets.map((g) => g.chatId);

    if (chatIds.length === 0) {
      return {
        changed: 0,
        unchanged: alreadySet.length,
        skippedNoMahalla: skippedNoMahalla.length,
        matched: candidates.length,
      };
    }

    const now = new Date();

    const { count } = await this.prisma.telegramGroup.updateMany({
      where: { chatId: { in: chatIds } },
      data: {
        isOfficial: dto.isOfficial,
        officialAt: dto.isOfficial ? now : null,
        officialBy: dto.isOfficial ? scope.userId : null,
      },
    });

    // ⚠️ BELGI OLINGANDA NAVBAT TOZALANADI — yakka `setOfficial`
    // dagi bilan AYNI qoida: rozilik qaytarib olingandan keyin
    // tahlil qilinmagan xabarni saqlab qolish "o'qimaymiz" degan
    // qarorga qarshi bo'lardi.
    let purgedMessages = 0;
    if (!dto.isOfficial) {
      const purged = await this.prisma.groupMessage.deleteMany({
        where: { chatId: { in: chatIds }, analyzedAt: null },
      });
      purgedMessages = purged.count;
    }

    this.logger.log(
      `[Groups] ommaviy kuzatuv ${dto.isOfficial ? "yoqildi" : "o'chirildi"}: ${count} guruh` +
        (skippedNoMahalla.length > 0
          ? `, ${skippedNoMahalla.length} tasi MFYsiz o'tkazib yuborildi`
          : "") +
        (purgedMessages > 0 ? `, ${purgedMessages} tahlilsiz xabar o'chirildi` : ""),
    );

    return {
      changed: count,
      unchanged: alreadySet.length,
      skippedNoMahalla: skippedNoMahalla.length,
      matched: candidates.length,
      purgedMessages,
    };
  }

  /**
   * MFY BIRIKTIRADI.
   *
   * ⚠️ HUDUD TELEGRAM'DAN KELMAYDI (schema'dagi 2-doktrina): guruh
   * nomida "Chilonzor 12-MFY" yozilgan bo'lishi mumkin, lekin unga
   * ishonib hisobot qurish mumkin emas.
   *
   * ⚠️ O'TGAN MUAMMOLAR QAYTA YOZILMAYDI: `Issue.mahallaId`
   * muhrlangan va bu yerda unga tegilmaydi. Aks holda "mart oyida
   * Chilonzorda 12 ta murojaat" degan raqam biriktirish
   * o'zgarganda jimgina boshqacha bo'lib ketardi.
   */
  async assignMahalla(chatId: string, dto: AssignMahallaDto, scope: ScopeContext) {
    const group = await this.prisma.telegramGroup.findUnique({
      where: { chatId },
      include: { mahalla: { select: { districtId: true } } },
    });
    if (!group) throw new NotFoundException("Guruh topilmadi");

    /**
     * Hozirgi hududga tega olishi kerak...
     *
     * ⚠️ `canTouchGroup`, `canTouchDistrict` EMAS: biriktirilmagan
     * chat hech qaysi tumanniki emas va eski tekshiruv uni tuman
     * operatoridan BUTUNLAY yopib qo'yardi — ya'ni unga berilgan
     * `groups.assign` ruxsati bilan qiladigan ishi qolmasdi.
     *
     * ⚠️ PASTDAGI IKKINCHI TEKSHIRUV O'RNIDA QOLADI va aynan u
     * muhim: operator chatni FAQAT o'z tumanining MFY siga
     * biriktira oladi. Ya'ni "biriktirilmaganni ko'rish" uni
     * boshqa tumanga jo'nata olish degani emas.
     */
    if (!canTouchGroup(scope, group.mahalla?.districtId ?? null)) {
      throw new BadRequestException("Bu guruh sizning qamrovingizda emas");
    }

    let mahallaId: string | null = null;

    if (dto.mahallaId) {
      const mahalla = await this.prisma.mahalla.findUnique({
        where: { id: dto.mahallaId },
        select: { id: true, districtId: true, isArchived: true },
      });
      if (!mahalla) throw new NotFoundException("MFY topilmadi");

      if (mahalla.isArchived) {
        throw new BadRequestException("Arxivlangan MFY ga biriktirib bo'lmaydi");
      }

      // ...va YANGI hududga ham. Aks holda tuman xodimi guruhni
      // boshqa tumanga "jo'natib", o'z ko'rinishidan chiqarib
      // tashlardi.
      if (!canTouchDistrict(scope, mahalla.districtId)) {
        throw new BadRequestException("Tanlangan MFY sizning qamrovingizda emas");
      }

      mahallaId = mahalla.id;
    } else if (group.isOfficial) {
      // ⚠️ RASMIY GURUHDAN MFY'NI OLIB TASHLASH BLOKLANADI: u
      // kuzatuvda qolib, signallari hududsiz chiqardi.
      throw new BadRequestException(
        "Rasmiy guruhdan MFY ni olib tashlash mumkin emas — avval rasmiy belgisini oling",
      );
    }

    const updated = await this.prisma.telegramGroup.update({
      where: { chatId },
      data: { mahallaId },
      include: {
        mahalla: {
          select: { id: true, name: true, district: { select: { id: true, name: true } } },
        },
      },
    });

    return { chatId: updated.chatId, mahalla: updated.mahalla };
  }

  /** Panel sarlavhasidagi sanoqlar. */
  async getStats(scope: ScopeContext) {
    /**
     * ⚠️ SANOQCHILAR RO'YXAT BILAN AYNI SHARTNI ISHLATADI
     * (`canTouchUnassigned`). Ajralsa, panelda "MFY biriktirilmagan:
     * 0" deb turib, ro'yxatda o'nlab biriktirilmagan chat
     * ko'rinardi — yoki teskarisi. Plitkadagi son ro'yxatning
     * SARLAVHASI, alohida hisobot emas.
     */
    const scopeWhere = mahallaScopeWhere(scope, {
      includeUnassigned: canTouchUnassigned(scope),
    });

    const [
      total,
      official,
      channels,
      unassigned,
      pendingMessages,
      guarded,
      guardBlind,
      groupMembers,
      channelMembers,
    ] = await Promise.all([
        this.prisma.telegramGroup.count({ where: scopeWhere }),
        this.prisma.telegramGroup.count({ where: { ...scopeWhere, isOfficial: true } }),
        /**
         * ⚠️ KANALLAR ALOHIDA SANALADI, JAMIDAN AYIRILMAYDI:
         * reyestr bitta va "jami 120 chat" degan son to'g'ri.
         * Lekin qalqon sanoqchilari (`guarded`, `guardBlind`)
         * faqat guruhlarni oladi, ya'ni ma'muriyat "120 dan 40
         * tasida qalqon" degan sonni ko'rganda qolgani kanal
         * ekanini bilishi kerak — aks holda hech qachon
         * to'lmaydigan bo'shliq ko'rinardi.
         */
        this.prisma.telegramGroup.count({
          where: { ...scopeWhere, type: CHANNEL_TYPE },
        }),
        this.prisma.telegramGroup.count({ where: { ...scopeWhere, mahallaId: null } }),
        this.prisma.groupMessage.count({
          where: { analyzedAt: null, group: scopeWhere },
        }),
        this.prisma.telegramGroup.count({
          // ⚠️ KANAL HISOBGA OLINMAYDI: qalqon u yerda ishga
          // tushmaydi (`common/chat-type.ts`).
          where: { ...scopeWhere, ...guardScopeWhere, guardEnabled: true },
        }),
        /**
         * ⚠️ "QALQON YOQILGAN, LEKIN ISHLAMAYDI" — ALOHIDA SANOQ.
         * Bu eng xavfli holat: ma'muriyat himoya bor deb o'ylaydi,
         * bot esa o'chira olmaydi va ogohlantirish ham yozmaydi.
         * Sanoqsiz uni faqat hodisalar jurnalidan, bittalab topish
         * mumkin edi.
         */
        this.prisma.telegramGroup.count({
          where: {
            ...scopeWhere,
            // ⚠️ KANAL CHIQARIB TASHLANADI: kanalda bot o'chirish
            // huquqini olmagan bo'lishi ODATIY hol va qalqon u
            // yerda baribir ishlamaydi — bu qator kanalni ham
            // sanaganda panelda tuzatib bo'lmaydigan qizil
            // ogohlantirish abadiy turardi.
            ...guardScopeWhere,
            guardEnabled: true,
            canDeleteMessages: false,
          },
        }),
        /**
         * GURUH A'ZOLARI — "OBUNACHILAR" SONINING BIR BO'LAGI
         * (qolganlari: kanal obunachilari va botdagi fuqarolar).
         *
         * ⚠️ UCHALASI ALOHIDA KO'RSATILADI VA QO'SHILMAYDI:
         * guruhdagi odam botga yozmagan bo'lishi mumkin, botga
         * yozgan odam hech qaysi guruhda bo'lmasligi mumkin —
         * ularni qo'shish bir odamni IKKI MARTA sanardi va bu son
         * hisobotga chiqardi.
         *
         * ⚠️ FAQAT BOT ICHIDA TURGANLARI: chiqarib yuborilgan
         * guruhning a'zolari endi bizning auditoriyamiz emas.
         */
        this.prisma.telegramGroup.aggregate({
          where: { ...scopeWhere, ...guardScopeWhere, leftAt: null },
          _sum: { memberCount: true },
        }),
        /**
         * KANAL OBUNACHILARI — GURUH A'ZOLARIDAN ALOHIDA SON.
         *
         * ⚠️ QO'SHILMAYDI, CHUNKI BIR ODAM IKKALASIDA HAM BO'LADI:
         * MFY ning guruhi ham, kanali ham bo'lsa, o'sha mahalla
         * aholisi odatda ikkalasiga a'zo. Qo'shilsa, "auditoriya
         * 2 400 kishi" degan son haqiqiydan ikki barobar katta
         * chiqardi — va u tarqatma oldidagi "necha kishiga
         * yuboriladi" sonini ham buzardi.
         *
         * ⚠️ SO'Z HAM BOSHQA: guruhda "a'zo", kanalda "obunachi".
         * Bitta yorliq ostida ko'rsatilsa, xodim ularni bir xil
         * narsa deb o'qirdi.
         */
        this.prisma.telegramGroup.aggregate({
          where: { ...scopeWhere, type: CHANNEL_TYPE, leftAt: null },
          _sum: { memberCount: true },
        }),
      ]);

    return {
      total,
      official,
      /** Reyestrdagi kanallar — qalqon sanoqchilaridan tashqarida. */
      channels,
      unassigned,
      pendingMessages,
      guarded,
      guardBlind,
      /** ⚠️ KANAL OBUNACHILARI BILAN QO'SHILMAYDI (yuqoridagi izoh). */
      groupMembers: groupMembers._sum.memberCount ?? 0,
      channelMembers: channelMembers._sum.memberCount ?? 0,
    };
  }
}
