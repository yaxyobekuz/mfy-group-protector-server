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
  canTouchDistrict,
  isProvinceWide,
  mahallaScopeWhere,
  type ScopeContext,
} from "../../common/scope.util";
import { paginate, type Paginated } from "../../common/dto/pagination.dto";
import type {
  AssignMahallaDto,
  CaptureMessageDto,
  ListGroupsQuery,
  MembershipDto,
  SetOfficialDto,
  TouchGroupDto,
} from "./dto/groups.dto";

/**
 * Reyestrga tushadigan chat turlari.
 *
 * ⚠️ `private` ATAYLAB YO'Q: shaxsiy chat — bu BOG'LANISH
 * (`User.telegramId`), guruh emas. Uni bu jadvalga yozish reyestrni
 * har bir foydalanuvchi bilan to'ldirib yuborardi.
 */
const GROUP_TYPES = new Set(["group", "supergroup", "channel"]);

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
    private readonly audit: AuditService,
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
    if (!GROUP_TYPES.has(dto.type)) return { skipped: true as const };

    const present = PRESENT_STATUSES.has(dto.status);

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

    return { chatId: group.chatId, status: group.status };
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
    if (!GROUP_TYPES.has(dto.type)) return { skipped: true as const };

    const title = dto.title?.trim() || dto.chatId;

    const group = await this.prisma.telegramGroup.upsert({
      where: { chatId: dto.chatId },
      update: { type: dto.type, title, username: dto.username?.trim() || null },
      create: {
        chatId: dto.chatId,
        type: dto.type,
        title,
        username: dto.username?.trim() || null,
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
    const where = {
      // ⚠️ `includeUnassigned: true` — MFY biriktirilmagan guruhlar
      // ko'rinishi KERAK: aks holda ular jim turib qolardi va hech
      // kim ularni biriktirmasdi. Tuman xodimi uchun bu faqat
      // viloyat darajasida ochiladi (`scope.util.ts` izohi).
      ...mahallaScopeWhere(scope, { includeUnassigned: isProvinceWide(scope) }),
      ...(query.isOfficial !== undefined ? { isOfficial: query.isOfficial } : {}),
      ...(query.mahallaId ? { mahallaId: query.mahallaId } : {}),
      ...(query.unassigned ? { mahallaId: null } : {}),
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: "insensitive" as const } },
              { username: { contains: query.search, mode: "insensitive" as const } },
              { chatId: { contains: query.search } },
            ],
          }
        : {}),
    };

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

    if (!canTouchDistrict(scope, group.mahalla?.districtId ?? null)) {
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

    await this.audit.record({
      userId: scope.userId,
      action: dto.isOfficial ? "group.official_on" : "group.official_off",
      entity: "TelegramGroup",
      entityId: chatId,
      meta: { title: group.title, mahallaId: group.mahallaId },
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

    // Hozirgi hududga tega olishi kerak...
    if (!canTouchDistrict(scope, group.mahalla?.districtId ?? null)) {
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

    await this.audit.record({
      userId: scope.userId,
      action: "group.assign_mahalla",
      entity: "TelegramGroup",
      entityId: chatId,
      meta: { before: group.mahallaId, after: mahallaId },
    });

    return { chatId: updated.chatId, mahalla: updated.mahalla };
  }

  /** Panel sarlavhasidagi sanoqlar. */
  async getStats(scope: ScopeContext) {
    const scopeWhere = mahallaScopeWhere(scope, {
      includeUnassigned: isProvinceWide(scope),
    });

    const [total, official, unassigned, pendingMessages, guarded] =
      await Promise.all([
        this.prisma.telegramGroup.count({ where: scopeWhere }),
        this.prisma.telegramGroup.count({ where: { ...scopeWhere, isOfficial: true } }),
        this.prisma.telegramGroup.count({ where: { ...scopeWhere, mahallaId: null } }),
        this.prisma.groupMessage.count({
          where: { analyzedAt: null, group: scopeWhere },
        }),
        this.prisma.telegramGroup.count({
          where: { ...scopeWhere, guardEnabled: true },
        }),
      ]);

    return { total, official, unassigned, pendingMessages, guarded };
  }
}
