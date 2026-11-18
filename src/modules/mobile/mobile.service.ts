/**
 * MINI APP XIZMATI — fuqaro murojaatlari oqimi.
 *
 * ── DOKTRINA ──────────────────────────────────────────────────────────
 *
 * ⚠️ FUQARO FAQAT O'Z MUROJAATINI KO'RADI (`citizenId`). Hududiy qamrov
 * (`scope.util`) — XODIMLAR uchun; fuqaroda u yo'q.
 *
 * ⚠️ MOBIL MUROJAATDA `authorChatId` NULL: javob fuqaroning shaxsiy
 * chatiga (`citizen.telegramId`) boradi — `issues.service.ts` hal qiladi.
 *
 * ⚠️ AI TAKLIFI `sourceMeta.ai` GA IMZOLANGAN HAVOLA ORQALI yoziladi:
 * mijoz aytgan qiymatga ishonilmaydi (soxta dalil bo'lardi).
 *
 * ⚠️ CHEGARA (`mobileDailyLimit`) — BLOK EMAS: xato ishlatayotgan odamni
 * sekinlatadi, sabab bilan 429 qaytadi. Blok alohida, qattiqroq chora.
 */

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { IssueSource, IssueStatus, type Prisma } from "@prisma/client";

import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../common/audit.service";
import {
  DELETED_CITIZEN_NAME,
  activeCitizenWhere,
} from "../../common/citizen-deleted";
import { normalizePhone } from "../../common/phone";
import { POINTS } from "../../common/points";
import { SECRET_CONTEXT, openSecret } from "../../common/secret-box";
import { signRef, verifyRef } from "../../common/signed-ref";
import { AppealTriageService } from "../issues/appeal-triage.service";
import { OrgRoutingService } from "../organizations/org-routing.service";
import { AssignmentRulesService } from "../issues/assignment-rules.service";
import { IssuesService } from "../issues/issues.service";
import { UploadsService } from "../uploads/uploads.service";
import { URGENCY_HOURS, URGENCY_LABELS } from "./ai/mobile-ai.constants";
import { MobileAiService } from "./ai/mobile-ai.service";
import { AppleTokenService } from "./apple-token.service";
import type {
  AddAppealCommentDto,
  AnalyzeDto,
  CreateAppealDto,
  UpdateProfileDto,
} from "./dto/mobile.dto";

/** AI taklifi `sourceMeta.ai` ga imzolangan tarzda yoziladi (kontekst). */
const AI_SIGN_CONTEXT = "mobile-ai";

interface SignedAi {
  categoryId: string;
  confidence: number;
  priority: string;
  model: string;
  /**
   * ── MUDDAT TAVSIYASI ─────────────────────────────────
   *
   * ⚠️ IMZO ICHIDA, chunki u PANELDA DALIL sifatida ko'rsatiladi
   * ("AI matnni shoshilinch deb baholadi — 24 soat"). Mijoz aytgan
   * qiymatga ishonilsa, istalgan odam o'z murojaatiga "favqulodda"
   * yorlig'ini yopishtira olardi.
   *
   * ⚠️ IXTIYORIY: eski murojaatlarda bu maydonlar YO'Q va ular
   * baribir o'qilishi kerak.
   */
  urgency?: string;
  dueHours?: number;
}

/** Fuqaroga ko'rinadigan holat bosqichlari (ro'yxat tartibida). */
const TIMELINE: { key: string; label: string; statuses: IssueStatus[] }[] = [
  { key: "new", label: "Qabul qilindi", statuses: [IssueStatus.new, IssueStatus.in_progress, IssueStatus.resolved] },
  { key: "assigned", label: "Ijroga yuborildi", statuses: [IssueStatus.in_progress, IssueStatus.resolved] },
  { key: "in_progress", label: "Bajarilmoqda", statuses: [IssueStatus.in_progress, IssueStatus.resolved] },
  { key: "resolved", label: "Yopiladi", statuses: [IssueStatus.resolved] },
];

@Injectable()
export class MobileService {
  private readonly logger = new Logger(MobileService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly issues: IssuesService,
    private readonly rules: AssignmentRulesService,
    /**
     * ⚠️ TASHKILOTGA YO'NALTIRISH — ALOHIDA QOIDA: `rules` MFY ×
     * yo'nalish bo'yicha SHTAB XODIMINI topadi, bu esa tuman ×
     * yo'nalish bo'yicha IJROCHI TASHKILOTNI. Ikkisi boshqa
     * ustunni to'ldiradi va birga ishlaydi.
     */
    private readonly orgRouting: OrgRoutingService,
    private readonly triage: AppealTriageService,
    private readonly uploads: UploadsService,
    private readonly ai: MobileAiService,
    private readonly appleTokens: AppleTokenService,
    private readonly audit: AuditService,
  ) {}

  // ═══════════════════════════════════════════════════════════════
  //  PROFIL
  // ═══════════════════════════════════════════════════════════════

  async getProfile(citizenId: string) {
    const citizen = await this.prisma.citizen.findUnique({
      where: { id: citizenId },
      include: {
        district: { select: { name: true } },
        mahalla: { select: { name: true } },
      },
    });
    if (!citizen) throw new NotFoundException("Fuqaro topilmadi");

    const stats = await this.appealStats(citizenId);

    /**
     * ⚠️ TALAB PROFIL BILAN BIRGA QAYTADI: mijoz (bot, mini-ilova,
     * mobil ilova) raqam so'rash kerakmi-yo'qmi degan savolga
     * ALOHIDA so'rovsiz javob olishi kerak — aks holda har oqim
     * boshida ikkita HTTP so'rov ketardi.
     *
     * ⚠️ QIYMAT SERVERDAN KELADI, mijozda QOTIB QOLMAYDI: sozlama
     * panelda o'zgarsa, ilovani yangilash kerak bo'lmasligi kerak.
     */
    const requirePhone = await this.phoneRequired();

    return {
      id: citizen.id,
      telegramId: citizen.telegramId,
      firstName: citizen.firstName,
      lastName: citizen.lastName,
      username: citizen.username,
      phone: citizen.phone,
      photoUrl: citizen.photoUrl,
      languageCode: citizen.languageCode,
      districtId: citizen.districtId,
      districtName: citizen.district?.name ?? null,
      mahallaId: citizen.mahallaId,
      mahallaName: citizen.mahalla?.name ?? null,
      points: citizen.points,
      createdAt: citizen.createdAt,
      stats,
      requirePhone,
      /** ⚠️ Mijoz uchun TAYYOR javob: "hozir raqam so'rash kerakmi". */
      phoneNeeded: requirePhone && !citizen.phone,
    };
  }

  /**
   * TELEFON MAJBURIYMI — `Settings.requirePhone`.
   *
   * ⚠️ SOZLAMA YO'Q BO'LSA `true`: yozuv hali yaratilmagan bo'lishi
   * mumkin (yangi baza) va o'shanda "majburiy emas" deb qaror qilish
   * himoyani JIMGINA o'chirib qo'yardi.
   */
  private async phoneRequired(): Promise<boolean> {
    const settings = await this.prisma.settings.findUnique({
      where: { id: "singleton" },
      select: { requirePhone: true },
    });
    return settings?.requirePhone ?? true;
  }

  /**
   * HISOBNI O'CHIRISH — FUQARONING O'ZI (App Store 5.1.1(v), Google Play).
   *
   * ── NIMA UCHUN MAJBURIY ────────────────────────────────────────────
   *
   * ⚠️ DO'KON TALABI: ilova ichida hisob yaratish mumkin bo'lsa,
   * ilova ICHIDA uni o'chirish yo'li ham bo'lishi SHART. Usiz ilova
   * App Store'da ham, Google Play'da ham RAD ETILADI. "Bizga yozing,
   * qo'lda o'chiramiz" degan variant QABUL QILINMAYDI.
   *
   * ── NIMA O'CHADI, NIMA QOLADI ──────────────────────────────────────
   *
   *   SHAXSIY MA'LUMOT     →  tozalanadi (ism, username, rasm,
   *                           pochta, telefon, hudud, kirish kalitlari)
   *   MUROJAATLAR/IZOHLAR  →  QOLADI, lekin MUALLIFI ANONIM
   *
   * ⚠️ MUROJAAT O'CHIRILMAYDI: u — hisobot va statistika birligi.
   * "Mart oyida nechta murojaat keldi" degan raqam odam hisobini
   * o'chirgani uchun o'zgarib ketmasligi kerak (`Issue.source`
   * muhrlangan qiymat bo'lgani bilan AYNI sabab). Shuningdek
   * `IssueComment` — append-only, ya'ni uni o'chirish doktrinaga zid.
   *
   * ⚠️ MUROJAAT MATNIDA SHAXSIY MA'LUMOT BO'LISHI MUMKIN (manzil,
   * telefon — fuqaro o'zi yozgan) va u matn QOLADI. Shuning uchun bu
   * holat maxfiylik siyosatida ANIQ yozilgan (`/privacy`) — yashirib
   * qo'yish do'kon tekshiruvida ham, qonun oldida ham muammo
   * bo'lardi.
   *
   * ── QAYTA KIRISH ───────────────────────────────────────────────────
   *
   * ⚠️ UCHALA KALIT (`telegramId`/`googleId`/`appleId`) `null`
   * QILINADI: shu hisob bilan qayta kirilsa, `upsert` mos qator
   * topmaydi va YANGI fuqaro yaratiladi — eskisiga ULANMAYDI. Bu
   * ataylab: "o'chirdim" degan odam qayta kirganda eski murojaatlari
   * qaytib kelsa, o'chirish ishonchini yo'qotardi.
   *
   * ── ESKI TOKEN ─────────────────────────────────────────────────────
   *
   * ⚠️ MOBIL TOKEN 30 KUNLIK VA REFRESH YO'Q, ya'ni o'chirilgan
   * hisobning tokeni hali ham IMZO JIHATIDAN HAQIQIY. Shuning uchun
   * `JwtAuthGuard#checkCitizen` har so'rovda `deletedAt` ni BAZADAN
   * tekshiradi — aks holda o'chirilgan hisob token muddati
   * tugamaguncha ishlab yuraverardi.
   */
  async deleteMe(citizenId: string, ip?: string | null) {
    const citizen = await this.prisma.citizen.findUnique({
      where: { id: citizenId },
      select: { id: true, deletedAt: true, appleRefreshToken: true },
    });
    if (!citizen) throw new NotFoundException("Fuqaro topilmadi");

    /**
     * ⚠️ TAKROR SO'ROV JIM O'TADI (xato EMAS). Guard o'chirilgan
     * hisobni allaqachon to'xtatadi, ya'ni bu yerga tushish uchun
     * ikki so'rov AYNI VAQTDA kelishi kerak (ilova tugmani ikki
     * marta bosdi). O'shanda 404 qaytarish fuqaroga "o'chmadi"
     * degan noto'g'ri xabar berardi — aslida o'chgan.
     */
    if (citizen.deletedAt) return;

    /**
     * ── APPLE RUXSATINI BEKOR QILISH ────────────────────────────────
     *
     * ⚠️ TRANZAKSIYADAN TASHQARIDA VA UNDAN OLDIN: tarmoq chaqiruvi
     * tranzaksiya ichida bo'lsa, baza qulflari Apple javob
     * bermaguncha (10 soniyagacha) ushlab turilardi.
     *
     * ⚠️ XATO O'CHIRISHNI TO'XTATMAYDI (`revoke` o'zi yutadi va
     * `false` qaytaradi): aks holda Apple xizmati ishlamagan paytda
     * fuqaro hisobini umuman o'chira olmasdi — ya'ni do'kon talabi
     * BUZILARDI. Xato logga tushadi.
     */
    let appleRevoked = false;
    if (citizen.appleRefreshToken) {
      const refreshToken = openSecret(
        SECRET_CONTEXT.APPLE_REFRESH,
        citizen.appleRefreshToken,
      );
      if (refreshToken) {
        appleRevoked = await this.appleTokens.revoke(refreshToken);
      } else {
        // ⚠️ KALIT ALMASHGAN BO'LSA SHU YERGA TUSHADI — o'chirish
        // davom etadi, lekin sabab logda ko'rinishi kerak.
        this.logger.warn(
          `Apple refresh token ochilmadi (citizen=${citizenId}) — revoke o'tkazib yuborildi`,
        );
      }
    }

    /**
     * ⚠️ BITTA TRANZAKSIYA: tozalash yarim bajarilsa, hisob
     * "o'chirilgan" deb belgilanib, kalitlari joyida qolardi — ya'ni
     * qayta kirgan odam o'chirilgan hisobga ULANIB qolardi va guard
     * uni darhol bloklardi. Fuqaro ilovaga butunlay kira olmasdi.
     */
    await this.prisma.$transaction(async (tx) => {
      await tx.citizen.update({
        where: { id: citizenId },
        data: {
          deletedAt: new Date(),

          // ── SHAXSIY MA'LUMOT ────────────────────────────────────
          // ⚠️ ISM BO'SH QOLDIRILMAYDI (`firstName` — majburiy
          // ustun) va panelda "o'chirilgan" deb KO'RINISHI kerak:
          // bo'sh satr qo'yilsa, ro'yxatda ismsiz qator chiqib,
          // xodim buni baza xatosi deb o'ylardi.
          firstName: DELETED_CITIZEN_NAME,
          lastName: null,
          username: null,
          photoUrl: null,
          email: null,
          phone: null,

          // ── KIRISH KALITLARI ────────────────────────────────────
          // ⚠️ UCHALASI: qaysi yo'l bilan kirgani muhim emas —
          // qayta kirish YANGI fuqaro yaratishi kerak.
          telegramId: null,
          googleId: null,
          appleId: null,

          // ⚠️ APPLE TOKENI HAM O'CHADI: revoke'dan keyin u yaroqsiz
          // va saqlab turish kerak emas (tirik sir bazada qolmasin).
          appleRefreshToken: null,

          // ── HUDUD VA REYTING ────────────────────────────────────
          // ⚠️ HUDUD TOZALANADI: u shaxsni aniqlashga yaqinlashtiradi
          // (MFY — kichik hudud). Murojaatdagi `mahallaId` esa
          // QOLADI — u hisobot uchun muhrlangan NUSXA.
          districtId: null,
          mahallaId: null,

          // ⚠️ BALL NOLGA: o'chirilgan fuqaro reytingda turmasligi
          // kerak. Filtr ham bor (`deletedAt`), lekin ball qolsa
          // "jami ball" yig'indisi egasi yo'q hisobni sanab
          // yurardi.
          points: 0,

          // ⚠️ BLOK TOZALANADI: u — MA'MURIY chora va o'chirilgan
          // hisobda ma'nosi yo'q. Qolsa, panelda "bloklangan"
          // ro'yxatida egasiz qator turardi.
          isBlocked: false,
          blockReason: null,
        },
      });
    });

    /**
     * ⚠️ AUDIT — TRANZAKSIYADAN KEYIN va `userId: null`: amalni XODIM
     * emas, FUQARONING O'ZI qildi (`AuditLog.userId` — xodim ustuni).
     * Kim o'chirgani `entityId` da qoladi, ya'ni "bu hisob nega
     * anonim?" degan savolga javob bor.
     *
     * ⚠️ `meta` GA SHAXSIY MA'LUMOT YOZILMAYDI: aks holda hozir
     * tozalagan ism/pochta audit jurnalida QOLIB ketardi va butun
     * amal ma'nosiz bo'lardi. Faqat texnik faktlar.
     */
    await this.audit.record({
      userId: null,
      action: "citizen.self_delete",
      entity: "Citizen",
      entityId: citizenId,
      meta: {
        appleRevoked,
        appleTokenHad: Boolean(citizen.appleRefreshToken),
      },
      ip: ip ?? null,
    });
  }

  async updateProfile(citizenId: string, dto: UpdateProfileDto) {
    // ⚠️ TUMAN O'ZGARSA MFY MOSLIGI TEKSHIRILADI: boshqa tumandagi MFY
    // qolib ketsa, murojaat noto'g'ri hududga yo'nalardi.
    let mahallaId = dto.mahallaId;

    if (dto.districtId !== undefined) {
      // Tuman o'zgartirilganda, agar yangi MFY berilmagan bo'lsa, eski
      // MFY tozalanadi (u endi boshqa tumanga tegishli).
      if (dto.mahallaId === undefined) mahallaId = undefined;
    }

    if (mahallaId) {
      const mahalla = await this.prisma.mahalla.findUnique({
        where: { id: mahallaId },
        select: { districtId: true },
      });
      if (!mahalla) throw new NotFoundException("MFY topilmadi");

      const districtId =
        dto.districtId ??
        (await this.prisma.citizen.findUnique({
          where: { id: citizenId },
          select: { districtId: true },
        }))?.districtId;

      if (districtId && mahalla.districtId !== districtId) {
        throw new BadRequestException("Tanlangan MFY bu tumanga tegishli emas");
      }
    }

    /**
     * ── TELEFON ───────────────────────────────────────────────────
     *
     * ⚠️ `undefined` VA `""` — IKKI BOSHQA NARSA va ularni
     * aralashtirish JIM YO'QOTISHGA olib kelgan: botdagi "Profil"
     * tugmasi `updateProfile(citizen, {})` ni chaqiradi (profilni
     * o'qish uchun) va eski kod o'shanda `phone: null` yozib,
     * fuqaro har profilga qaraganda raqamini O'CHIRIB yuborardi.
     * Hech kim sezmasdi — raqam o'sha ekranda ko'rinmaydi ham.
     *
     * Endi: maydon BERILMAGAN bo'lsa — TEGILMAYDI.
     */
    let phone: string | null | undefined;

    if (dto.phone !== undefined) {
      const raw = dto.phone.trim();

      if (!raw) {
        // ⚠️ BO'SHATISH ATAYLAB QILINGAN AMAL — lekin telefon
        // majburiy bo'lsa, u rad etiladi: aks holda fuqaro raqamni
        // o'chirib, keyin murojaat yozolmay qolardi.
        if (await this.phoneRequired()) {
          throw new BadRequestException(
            "Telefon raqami majburiy — uni bo'shatib bo'lmaydi",
          );
        }
        phone = null;
      } else {
        const normalized = normalizePhone(raw);
        if (!normalized) {
          throw new BadRequestException(
            "Telefon raqami noto'g'ri. Namuna: +998 90 123 45 67",
          );
        }
        phone = normalized;
      }
    }

    await this.prisma.citizen.update({
      where: { id: citizenId },
      data: {
        ...(phone !== undefined ? { phone } : {}),
        ...(dto.districtId !== undefined
          ? { districtId: dto.districtId || null, mahallaId: dto.mahallaId || null }
          : {}),
        ...(dto.mahallaId !== undefined && dto.districtId === undefined
          ? { mahallaId: dto.mahallaId || null }
          : {}),
        ...(dto.languageCode ? { languageCode: dto.languageCode } : {}),
      },
    });

    return this.getProfile(citizenId);
  }

  // ═══════════════════════════════════════════════════════════════
  //  MA'LUMOTNOMALAR
  // ═══════════════════════════════════════════════════════════════

  /**
   * YO'NALISHLAR — IKKI DARAJALI, LEKIN TEKIS RO'YXAT.
   *
   * ⚠️ DARAXT SERVERDA QURILMAYDI: mijozlar uchta (bot, mini-ilova,
   * mobil ilova) va har biri tanlovni O'ZICHA ko'rsatadi — bot ikki
   * qadamli tugma bilan, ilova esa ochiladigan ro'yxat bilan. Tayyor
   * daraxt qaytarilsa, tekis ro'yxat kerak bo'lgan joyda (hisobot
   * filtri) uni qayta yoyish kerak bo'lardi.
   *
   * ⚠️ `parentId` — DARAXTNING YAGONA KALITI. Mijoz uni o'qib,
   * "ASOSIY → Kichik" ko'rinishini o'zi quradi.
   */
  async categories() {
    const rows = await this.prisma.issueCategory.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        color: true,
        description: true,
        icon: true,
        slaHours: true,
        orgName: true,
        parentId: true,
      },
    });

    /**
     * ⚠️ BOLALARI BOR OTA "TANLAB BO'LMAYDIGAN" DEB BELGILANADI:
     * fuqaro "Kommunal xizmatlar" ni tanlab qo'ysa, kichik
     * yo'nalishga bo'linishning ma'nosi yo'qolardi — hisobotda yana
     * bitta katta uyum paydo bo'lardi.
     *
     * ⚠️ O'CHIRILMAYDI, BELGILANADI: ota tanlov EKRANIDA kerak (u
     * birinchi qadam), faqat YAKUNIY tanlov bo'la olmaydi.
     */
    const parents = new Set(
      rows.map((row) => row.parentId).filter((id): id is string => Boolean(id)),
    );

    return rows.map((row) => ({
      ...row,
      hasChildren: parents.has(row.id),
      /** ⚠️ Faqat shu qiymatlar murojaatda `categoryId` bo'la oladi. */
      selectable: !parents.has(row.id),
    }));
  }

  async territory() {
    // ⚠️ FUQARO UCHUN QAMROV YO'Q: butun viloyat ko'rinadi, lekin faqat
    // `{id, name}` — xodimlarga ko'rinadigan rais telefoni, aholi soni
    // bu yerda KERAK EMAS.
    const [districts, mahallas] = await Promise.all([
      this.prisma.district.findMany({
        where: { isArchived: false },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: { id: true, name: true },
      }),
      this.prisma.mahalla.findMany({
        where: { isArchived: false },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: { id: true, name: true, districtId: true },
      }),
    ]);

    return { districts, mahallas };
  }

  async homeStats() {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [total, resolved, last30] = await Promise.all([
      this.prisma.issue.count(),
      this.prisma.issue.count({ where: { status: IssueStatus.resolved } }),
      this.prisma.issue.count({ where: { createdAt: { gte: since } } }),
    ]);
    return { total, resolved, last30 };
  }

  // ═══════════════════════════════════════════════════════════════
  //  MUROJAATLAR
  // ═══════════════════════════════════════════════════════════════

  async listAppeals(citizenId: string, status?: IssueStatus) {
    const where: Prisma.IssueWhereInput = {
      citizenId,
      ...(status ? { status } : {}),
    };

    const [items, total, counts] = await Promise.all([
      this.prisma.issue.findMany({
        where,
        orderBy: { createdAt: "desc" },
        include: {
          category: { select: { id: true, name: true, color: true, icon: true } },
          attachments: { select: { path: true }, orderBy: { createdAt: "asc" } },
          _count: { select: { comments: { where: { isPublic: true } } } },
        },
      }),
      this.prisma.issue.count({ where }),
      this.statusCounts(citizenId),
    ]);

    return {
      items: items.map((issue) => this.toListItem(issue)),
      total,
      page: 1,
      limit: total,
      hasMore: false,
      counts,
    };
  }

  async getAppeal(citizenId: string, id: string) {
    const issue = await this.prisma.issue.findFirst({
      // ⚠️ `citizenId` SHARTGA KIRADI: boshqa fuqaroning id'sini qo'lda
      // yuborib ko'ra olmasligi uchun — ro'yxat filtri yetarli emas.
      where: { id, citizenId },
      include: {
        category: { select: { id: true, name: true, color: true, icon: true, orgName: true } },
        /**
         * ⚠️ MUHRLANGAN TASHKILOT — jonli qoidadan EMAS. Fuqaro
         * murojaatini ochganda uning tashkiloti o'sha paytdagi
         * qiymat bo'lishi kerak: qoida keyin o'zgarsa, ekranda
         * "sizning murojaatingiz X ga ketdi" degan yozuv
         * jimgina boshqa tashkilotga aylanib ketardi.
         */
        organization: { select: { name: true, shortName: true } },
        mahalla: { select: { name: true } },
        attachments: {
          select: { id: true, kind: true, path: true, mimeType: true },
          orderBy: { createdAt: "asc" },
        },
        comments: {
          where: { isPublic: true },
          orderBy: { createdAt: "asc" },
          include: {
            user: { select: { firstName: true, lastName: true } },
            citizen: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });
    if (!issue) throw new NotFoundException("Murojaat topilmadi");

    return {
      id: issue.id,
      publicNo: issue.publicNo,
      title: issue.title,
      body: issue.body,
      status: issue.status,
      address: issue.address,
      lat: issue.lat,
      lng: issue.lng,
      isHazard: issue.isHazard,
      isLongStanding: issue.isLongStanding,
      isRepeatAppeal: issue.isRepeatAppeal,
      occurredAt: issue.occurredAt,
      createdAt: issue.createdAt,
      dueAt: issue.dueAt,
      resolvedAt: issue.reviewedAt,
      resolution: issue.resolution,
      category: {
        id: issue.category.id,
        name: issue.category.name,
        color: issue.category.color,
        icon: issue.category.icon,
        /** ⚠️ Muhrlangan tashkilot ustun, yo'nalishdagi matn — zaxira. */
        orgName: issue.organization?.name ?? issue.category.orgName,
      },
      mahallaName: issue.mahalla?.name ?? null,
      districtName: null,
      attachments: issue.attachments.map((a) => ({
        id: a.id,
        kind: a.kind,
        url: a.path,
        mimeType: a.mimeType,
      })),
      comments: issue.comments.map((c) => ({
        id: c.id,
        body: c.body,
        createdAt: c.createdAt,
        // ⚠️ `mine` — FUQARO O'ZI YOZGAN izoh (ilovada boshqa tomonda
        // ko'rinadi). Xodim izohi `citizen` null bo'ladi.
        mine: c.citizen !== null,
        author: c.citizen
          ? [c.citizen.firstName, c.citizen.lastName].filter(Boolean).join(" ") || "Siz"
          : [c.user?.firstName, c.user?.lastName].filter(Boolean).join(" ") || "Ma'muriyat",
      })),
      timeline: this.timeline(issue.status),
    };
  }

  async mapPoints(citizenId: string, filter: { categoryId?: string; status?: IssueStatus }) {
    const rows = await this.prisma.issue.findMany({
      where: {
        citizenId,
        lat: { not: null },
        lng: { not: null },
        ...(filter.categoryId ? { categoryId: filter.categoryId } : {}),
        ...(filter.status ? { status: filter.status } : {}),
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        lat: true,
        lng: true,
        status: true,
        createdAt: true,
        category: { select: { id: true, name: true, color: true, icon: true } },
      },
    });
    return rows;
  }

  // ─────────────────────────────────────────────────────────────────
  //  AI TAKLIFI
  // ─────────────────────────────────────────────────────────────────

  /**
   * ⚠️ TASHKILOTNI AI TANLAMAYDI — QOIDA TANLAYDI. Fuqaroga
   * ko'rsatiladigan "Mas'ul tashkilot" qatori modelning TAXMINI
   * emas, `OrganizationRoute` dagi aniq javob (tuman × yo'nalish).
   * Modeldan "qaysi tashkilot" deb so'ralsa, u ro'yxatda yo'q
   * nomni o'ylab topishi mumkin edi — va fuqaro ekranda SOXTA
   * manzilni ko'rardi, murojaat esa butunlay boshqa joyga
   * ketardi.
   *
   * ⚠️ IKKINCHI AI CHAQIRUVI QO'SHILMAYDI: shlyuz bitta va u
   * hozir sekin ishlayapti — qo'shimcha chaqiruv sehrgarni yana
   * 30 soniyaga cho'zardi, holbuki javob BAZADA aniq turibdi.
   *
   * ⚠️ TASHKILOT IMZOLANGAN HAVOLAGA QO'SHILMAYDI (`SignedAi`):
   * imzo MIJOZ qaytaradigan qiymatlar uchun kerak, bu esa
   * ko'rsatish uchun o'qiladi va murojaat yaratilganda server
   * qoidadan QAYTA o'qiydi (`create`). Imzoga qo'shilsa,
   * yo'naltirish qoidasi oradagi vaqtda o'zgarsa, eski taklif
   * bo'yicha yozilgan murojaat NOTO'G'RI tashkilotga ketardi.
   */
  async analyze(dto: AnalyzeDto, citizenId: string) {
    const categories = await this.prisma.issueCategory.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        description: true,
        icon: true,
        slaHours: true,
        orgName: true,
        parentId: true,
        parent: { select: { name: true } },
      },
    });

    /**
     * ⚠️ FAQAT ENG ANIQ YO'NALISHLAR MODELGA BERILADI: ichida
     * kichik yo'nalishlari BOR asosiy yo'nalish ro'yxatdan
     * CHIQARILADI. Aks holda model doim umumiy yo'nalishni tanlab,
     * butun bo'linishning ma'nosi yo'qolardi — hamma murojaat yana
     * "Kommunal xizmatlar"ga tushardi.
     *
     * ⚠️ BOLASI YO'Q ASOSIY YO'NALISH QOLADI ("Boshqa",
     * "Xavfsizlik"): u o'zi ENG aniq yo'nalish.
     */
    const parentsWithChildren = new Set(
      categories.map((c) => c.parentId).filter((id): id is string => Boolean(id)),
    );
    const leaves = categories.filter((c) => !parentsWithChildren.has(c.id));

    const suggestion = await this.ai.suggest(
      dto.body,
      leaves.map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        parentName: c.parent?.name ?? null,
      })),
    );

    if (!suggestion) {
      // ⚠️ `null` — taklif qulaylik, usiz ham oqim davom etadi.
      return { suggestion: null, token: null };
    }

    const category = categories.find((c) => c.id === suggestion.categoryId);
    if (!category) return { suggestion: null, token: null };

    /**
     * ⚠️ HUDUD FUQARONING PROFILIDAN: taklif bosqichida u hali MFY
     * ko'rsatmagan bo'lishi mumkin va o'shanda VILOYAT zaxirasi
     * ishlatiladi (`org-routing.service.ts`). Natija `null`
     * bo'lsa, ilova avvalgidek yo'nalishdagi matnni ko'rsatadi.
     */
    const owner = await this.prisma.citizen.findUnique({
      where: { id: citizenId },
      select: { mahallaId: true },
    });

    const org = await this.orgRouting.resolve(owner?.mahallaId ?? null, category.id);

    // ⚠️ IMZOLANADI: murojaat yaratishda mijoz shu tokenni qaytaradi va
    // server undan AI taklifini TIKLAYDI — foizni mijoz o'zgartira
    // olmaydi (soxta dalil bo'lardi).
    /**
     * ⚠️ DARAJA → SOAT AYLANTIRISH KODDA (`URGENCY_HOURS`), modelda
     * EMAS. Modeldan raqam so'ralsa, u o'ylab topilgan son
     * qaytarardi va o'sha son murojaatning muddati bo'lib qolardi
     * (`mobile-ai.constants.ts` dagi batafsil izoh).
     */
    const dueHours = URGENCY_HOURS[suggestion.urgency] ?? category.slaHours;

    const signed: SignedAi = {
      categoryId: suggestion.categoryId,
      confidence: suggestion.confidence,
      priority: suggestion.priority,
      model: this.ai.model,
      urgency: suggestion.urgency,
      dueHours,
    };

    return {
      suggestion: {
        categoryId: category.id,
        categoryName: category.name,
        categoryIcon: category.icon,
        /** ⚠️ Ilovada "Kommunal xizmatlar → Ichimlik suvi" deb ko'rsatiladi. */
        parentName: category.parent?.name ?? null,
        confidence: suggestion.confidence,
        priority: suggestion.priority,
        slaHours: category.slaHours,
        /** ⚠️ Qoida topilsa haqiqiy nom, topilmasa yo'nalishdagi matn. */
        orgName: org?.name ?? category.orgName,
        /**
         * ⚠️ FUQAROGA KO'RSATILADI, LEKIN MUDDATNI BELGILAMAYDI:
         * muddat yo'nalish SLA'si yoki MFY qoidasidan chiqadi.
         * Bu — TAVSIYA va uni panelda XODIM qo'llaydi.
         */
        urgency: suggestion.urgency,
        urgencyLabel: URGENCY_LABELS[suggestion.urgency] ?? suggestion.urgency,
        suggestedDueHours: dueHours,
      },
      token: this.signAi(signed),
    };
  }

  // ─────────────────────────────────────────────────────────────────
  //  YARATISH
  // ─────────────────────────────────────────────────────────────────

  async create(citizen: { id: string }, dto: CreateAppealDto) {
    await this.enforceDailyLimit(citizen.id);

    /**
     * ── TELEFONSIZ MUROJAAT QABUL QILINMAYDI ──────────────────────
     *
     * ⚠️ SABAB AMALIY, RASMIYATCHILIK EMAS. Telefonsiz murojaatda
     * xodim odamga BOG'LANA OLMAYDI: Telegram ismi "ALHAMDULILLAX
     * 🙌🙌" bo'lishi mumkin, hudud esa "Belgilanmagan". Murojaat
     * navbatda turadi-yu, hal qilib bo'lmaydi.
     *
     * ⚠️ TEKSHIRUV SHU YERDA — UCHALA YO'L UCHUN BIRDAN: bot,
     * mini-ilova va mobil ilova HAMMASI shu metodni chaqiradi
     * (`bot-citizens.controller.ts` izohi). Mijozda tekshirilsa,
     * uchta joyda uchta nusxa bo'lardi va bittasi albatta
     * eskirardi.
     *
     * ⚠️ XATO MATNI MIJOZGA YO'L KO'RSATADI: u fuqaroga shundayligicha
     * ko'rsatiladi, ya'ni "400 Bad Request" emas, nima qilish
     * kerakligi yozilgan gap bo'lishi kerak.
     */
    if (await this.phoneRequired()) {
      const owner = await this.prisma.citizen.findUnique({
        where: { id: citizen.id },
        select: { phone: true },
      });

      if (!owner?.phone) {
        throw new BadRequestException(
          "Murojaat yuborish uchun telefon raqamingizni kiriting — xodim siz bilan shu raqam orqali bog'lanadi.",
        );
      }
    }

    const category = await this.prisma.issueCategory.findUnique({
      where: { id: dto.categoryId },
      select: {
        id: true,
        isActive: true,
        name: true,
        slaHours: true,
        orgName: true,
        _count: { select: { children: true } },
      },
    });
    if (!category) throw new NotFoundException("Yo'nalish topilmadi");
    if (!category.isActive) throw new BadRequestException("Yo'nalish faol emas");

    /**
     * ⚠️ FAQAT ENG ANIQ YO'NALISH QABUL QILINADI. Ichida kichik
     * yo'nalishlari bor umumiy yo'nalish ("Kommunal xizmatlar")
     * tanlansa, bo'linishning ma'nosi yo'qolardi — hisobotda yana
     * bitta katta uyum paydo bo'lardi va "qaysi xizmat buzuq" degan
     * savol javobsiz qolardi.
     *
     * ⚠️ TEKSHIRUV SERVERDA: mijozdagi ro'yxat (`selectable`)
     * qulaylik, HAQIQIY chegara shu yerda — eski ilova versiyasi
     * do'konda uzoq yashaydi.
     */
    if (category._count.children > 0) {
      throw new BadRequestException(
        "Aniqroq yo'nalishni tanlang — bu yo'nalish ichida kichik yo'nalishlar bor",
      );
    }

    /**
     * ── MFY HUDUDI (nusxa) ────────────────────────────────────────
     *
     * ⚠️ MIJOZ BERMASA — FUQARONING O'Z MFY SIDAN OLINADI. Bot
     * murojaat oqimida hududni UMUMAN so'ramaydi (u profilda
     * belgilanadi) va shu sababli botdan kelgan har murojaatda
     * `Issue.mahallaId` BO'SH qolardi: panelda "Hudud:
     * Belgilanmagan", tuman xodimi uni ko'rmaydi, ijrochi qoidasi
     * ham ishlamaydi (u MFY bo'yicha qidiradi).
     *
     * ⚠️ ZAXIRA — "NUSXA" QOIDASIGA ZID EMAS: qiymat baribir
     * YARATILISH paytida muhrlanadi. Fuqaro keyin hududini
     * o'zgartirsa, eski murojaat eski MFY da qoladi — hisobot
     * o'zgarmasligi uchun aynan shunday bo'lishi kerak.
     */
    let mahallaId = dto.mahallaId ?? null;

    if (mahallaId) {
      const mahalla = await this.prisma.mahalla.findUnique({
        where: { id: mahallaId },
        select: { id: true },
      });
      if (!mahalla) mahallaId = null; // noto'g'ri id — jim tashlanadi, murojaat yo'qolmaydi
    }

    if (!mahallaId) {
      const owner = await this.prisma.citizen.findUnique({
        where: { id: citizen.id },
        select: { mahallaId: true },
      });
      mahallaId = owner?.mahallaId ?? null;
    }

    // ── Fayllar: imzolangan tokenlardan tiklanadi ───────────────────
    const settings = await this.prisma.settings.findUnique({
      where: { id: "singleton" },
      select: { mobileMaxAttachments: true },
    });
    const maxAttachments = settings?.mobileMaxAttachments ?? 5;

    const attachmentRefs = (dto.attachments ?? [])
      .slice(0, maxAttachments)
      .map((token) => this.uploads.resolveToken(token))
      .filter((ref): ref is NonNullable<typeof ref> => ref !== null);

    // ── AI taklifi: imzodan tiklanadi ───────────────────────────────
    const ai = dto.analysisToken ? this.verifyAi(dto.analysisToken) : null;

    const sourceMeta: Record<string, unknown> = {
      channel: "mobile",
      flags: {
        hazard: Boolean(dto.isHazard),
        longStanding: Boolean(dto.isLongStanding),
        repeat: Boolean(dto.isRepeatAppeal),
      },
    };
    // ⚠️ AI TAKLIFI FAQAT SERVER IMZOLAGANIDA yoziladi (soxta dalil
    // bo'lmasligi uchun). `ai` — `SignedAi` obyekti.
    if (ai) sourceMeta.ai = ai as unknown as Prisma.InputJsonValue;

    const publicNo = await this.issues.nextPublicNo(this.prisma);
    const title = this.deriveTitle(dto.body);

    /**
     * ── TRIAJ ────────────────────────────────────────────
     *
     * ⚠️ FAQAT BELGILAYDI, RAD ETMAYDI: murojaat baribir
     * yaratiladi va fuqaro "qabul qilindi" javobini oladi. Qaror —
     * xodimda (`appeal-triage.service.ts` izohi).
     *
     * ⚠️ FUQARO ISMI UZATILADI: haqiqiy holatda murojaat matni
     * fuqaroning O'Z ISMI bo'lgan va buni faqat ism bilan
     * solishtirib aniqlash mumkin.
     */
    const owner = await this.prisma.citizen.findUnique({
      where: { id: citizen.id },
      select: { firstName: true, lastName: true },
    });

    const triage = await this.triage.triage({
      body: dto.body,
      categoryId: category.id,
      mahallaId,
      citizenName: [owner?.firstName, owner?.lastName].filter(Boolean).join(" ") || null,
      aiConfidence: ai?.confidence ?? null,
    });

    /**
     * ── AVTOMATIK IJROCHI ───────────────────────────────────
     *
     * ⚠️ MFY BO'YICHA QIDIRILADI va u BO'SH BO'LISHI MUMKIN
     * (botdan kelgan murojaatda fuqaro hududini ko'rsatmagan
     * bo'lishi mumkin) — o'shanda murojaat avvalgidek navbatda
     * qoladi. Avtomatik taqsimot QULAYLIK, oqimning sharti emas.
     *
     * ⚠️ QOIDA O'Z SLA'SINI BERSA, U YO'NALISHNIKIDAN USTUN
     * (`assignment-rules.service.ts`).
     */
    const auto = await this.rules.fieldsFor(mahallaId, category.id, category.slaHours);

    /**
     * ── IJROCHI TASHKILOT ───────────────────────────────────
     *
     * ⚠️ MFY SIZ MUROJAATDA HAM QIDIRILADI — va bu `rules` dan
     * FARQLI. Ijrochi xodim MFY bo'yicha topiladi va hududsiz
     * murojaatni biriktirish uni BEGONA tuman xodimiga
     * yuborardi; tashkilot esa tuman darajasida ishlaydi va
     * viloyat bo'ylab ZAXIRA qoidasi aynan shu holat uchun bor
     * (`org-routing.service.ts`).
     */
    const org = await this.orgRouting.resolve(mahallaId, category.id);

    const issue = await this.prisma.issue.create({
      data: {
        publicNo,
        categoryId: category.id,
        source: IssueSource.mobile,
        mahallaId,
        title,
        body: dto.body.trim(),
        // ⚠️ FUQARO — `citizenId`, `authorId` EMAS. `authorChatId` NULL:
        // javob shaxsiy chatga, `citizen.telegramId` orqali.
        citizenId: citizen.id,
        authorChatId: null,
        lat: dto.lat ?? null,
        lng: dto.lng ?? null,
        address: dto.address?.trim() || null,
        isHazard: Boolean(dto.isHazard),
        isLongStanding: Boolean(dto.isLongStanding),
        isRepeatAppeal: Boolean(dto.isRepeatAppeal),
        occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : null,
        sourceMeta: sourceMeta as Prisma.InputJsonValue,
        /**
         * ⚠️ MUHRLANGAN NUSXA (`assigneeId`, `mahallaId` bilan
         * ayni qoida): qoida keyin o'zgarsa, bu murojaatning
         * tashkiloti O'ZGARMAYDI — aks holda "o'tgan oy qaysi
         * tashkilot nechta murojaat olgan" hisoboti jimgina
         * qayta yozilardi.
         */
        organizationId: org?.organizationId ?? null,
        dueAt: auto?.dueAt ?? new Date(Date.now() + category.slaHours * 60 * 60 * 1000),
        /**
         * ⚠️ MUDDAT QAYERDAN KELGANI YOZIB QO'YILADI. "Muddat
         * qanday belgilanyapti?" — bu savolga javob panelda
         * ko'rinishi kerak. Avval faqat sana turardi va xodim uni
         * "tizim o'ylab topgan" deb qabul qilardi.
         */
        dueSource: auto ? "rule" : "category",
        /**
         * ⚠️ OMMAVIY HODISA: ayni MFY da, ayni yo'nalish bo'yicha
         * 12 soat ichida ochiq murojaat bo'lsa, bu unga BOG'LANADI
         * — lekin alohida yozuv bo'lib qoladi (fuqaro o'z
         * murojaatini ko'rishi kerak).
         */
        duplicateOfId: triage.duplicateOfId,
        isSuspicious: triage.isSuspicious,
        suspicionReason: triage.suspicionReason,
        // ⚠️ HOLAT `new` BO'LIB QOLADI: biriktirish avtomatik
        // bo'lgani — ishni kimdir boshlagani EMAS.
        ...(auto ? { assigneeId: auto.assigneeId } : {}),
        ...(attachmentRefs.length > 0
          ? {
              attachments: {
                create: attachmentRefs.map((ref) => ({
                  kind: ref.kind,
                  path: ref.path,
                  mimeType: ref.mime,
                  size: ref.size,
                  originalName: ref.originalName,
                })),
              },
            }
          : {}),
      },
      select: { id: true, publicNo: true, createdAt: true, dueAt: true },
    });

    /**
     * ── TASHKILOTGA XABARNOMA ───────────────────────────────
     *
     * ⚠️ KUTILMAYDI (`void`): Telegram so'rovi sekin bo'lishi
     * mumkin va fuqaro "yuborildi" javobini xabar ketishini
     * kutib turmasligi kerak — u ilovada «Yuborilmoqda…»
     * holatida qotib qolardi.
     *
     * ⚠️ TAKRORIY VA SHUBHALI MUROJAATDA YUBORILMAYDI — qoida
     * `IssuesService.notifyOrganization` da, BITTA joyda
     * (uchala yaratish yo'li uchun). Shu yerda qayta
     * tekshirilsa, ikki nusxa paydo bo'lardi va bittasi
     * albatta eskirardi.
     */
    if (org) void this.issues.notifyOrganization(issue.id);

    // ⚠️ YUBORILGANI UCHUN BALL (`points.ts` yagona manba).
    await this.prisma.citizen
      .update({
        where: { id: citizen.id },
        data: { points: { increment: POINTS.APPEAL_CREATED } },
      })
      .catch(() => undefined);

    return {
      id: issue.id,
      publicNo: issue.publicNo,
      createdAt: issue.createdAt,
      dueAt: issue.dueAt,
      categoryName: category.name,
      /**
       * ⚠️ QOIDA TOPILGAN BO'LSA TASHKILOTNING HAQIQIY NOMI,
       * topilmasa yo'nalishdagi MATN (`IssueCategory.orgName` —
       * zaxira). Ikkisi aralashtirilmaydi: biri fuqaroga
       * ko'rinadigan matn, ikkinchisi murojaat BORADIGAN manzil
       * (schema'dagi izoh).
       */
      orgName: org?.name ?? category.orgName,
      slaHours: category.slaHours,
      address: dto.address?.trim() || null,
    };
  }

  async addComment(citizenId: string, id: string, dto: AddAppealCommentDto) {
    const issue = await this.prisma.issue.findFirst({
      where: { id, citizenId },
      select: { id: true },
    });
    if (!issue) throw new NotFoundException("Murojaat topilmadi");

    // ⚠️ FUQARO IZOHI OCHIQ (`isPublic: true`): u murojaatchining O'ZI
    // va yozgani ma'muriyatga ko'rinishi kerak. `userId` NULL — izohni
    // XODIM emas, fuqaro yozgan.
    await this.prisma.issueComment.create({
      data: { issueId: id, citizenId, userId: null, body: dto.body.trim(), isPublic: true },
    });

    return { ok: true };
  }

  /**
   * ⚠️ FAQAT SURAT (`["photo"]`): mobil ilova ham, mini-ilova ham
   * video tanlamaydi (`image_picker.pickImage`), ya'ni bu
   * endpoint'ga kelgan video QO'LDA yasalgan so'rov bo'ladi. Bot
   * yo'li esa videoni qabul qiladi — fuqaro Telegram'da uni ataylab
   * yuboradi va u haqiqiy dalil (`bot-citizens.service.ts`).
   *
   * ⚠️ TEKSHIRUV SERVERDA, ILOVADA EMAS: ilovadagi tanlagich
   * qulaylik, HAQIQIY chegara shu yerda (`mobile.dto.ts` dagi
   * "chegara ilovada emas, serverda" qoidasi bilan ayni).
   */
  async upload(file: { buffer: Buffer; size: number; originalname?: string }) {
    return this.uploads.save(file, ["photo"]);
  }

  // ═══════════════════════════════════════════════════════════════
  //  YANGILIK VA REYTING
  // ═══════════════════════════════════════════════════════════════

  async news(citizenId: string, limit = 30) {
    const citizen = await this.prisma.citizen.findUnique({
      where: { id: citizenId },
      select: { districtId: true },
    });

    // ⚠️ TUMAN BO'YICHA FILTR: viloyat bo'yicha (districtId=null) +
    // fuqaroning tumani. Boshqa tuman e'lonlari ko'rinmaydi.
    const rows = await this.prisma.announcement.findMany({
      where: {
        publishedAt: { not: null },
        OR: [{ districtId: null }, ...(citizen?.districtId ? [{ districtId: citizen.districtId }] : [])],
      },
      orderBy: [{ isPinned: "desc" }, { publishedAt: "desc" }],
      take: Math.min(Math.max(1, limit), 50),
      include: {
        district: { select: { name: true } },
        /**
         * ⚠️ TARTIB BO'YICHA: xodim suratlarni ATAYLAB ketma-ket
         * qo'yadi (avval umumiy ko'rinish, keyin tafsilot) va
         * tartibsiz ko'rsatish e'lonning ma'nosini buzardi.
         */
        media: { orderBy: { sortOrder: "asc" } },
      },
    });

    return rows.map((a) => ({
      id: a.id,
      title: a.title,
      body: a.body,
      coverUrl: a.coverPath,
      isPinned: a.isPinned,
      publishedAt: a.publishedAt,
      viewCount: a.viewCount,
      districtName: a.district?.name ?? null,
      /**
       * ⚠️ `coverUrl` O'Z JOYIDA QOLADI: muqova — ro'yxatdagi BITTA
       * surat, media esa e'lon ICHIDAGI galereya. Eski ilovalar
       * `media` ni bilmaydi va faqat muqovani ko'rsatadi — ya'ni
       * do'kondagi eski nusxa buzilmaydi.
       */
      media: a.media.map((item) => ({
        kind: item.kind,
        url: item.path,
        mimeType: item.mimeType,
      })),
    }));
  }

  async markNewsViewed(id: string) {
    // ⚠️ "OT VA UNUT": yo'q e'lon uchun ham xato bermaydi — ko'rsatkich,
    // hisobot emas.
    await this.prisma.announcement
      .update({ where: { id }, data: { viewCount: { increment: 1 } } })
      .catch(() => undefined);
    return { ok: true };
  }

  async rating(citizenId: string, scope?: string) {
    let districtId: string | null = null;
    if (scope === "district") {
      const citizen = await this.prisma.citizen.findUnique({
        where: { id: citizenId },
        select: { districtId: true },
      });
      districtId = citizen?.districtId ?? null;
    }

    const rows = await this.prisma.citizen.findMany({
      where: {
        points: { gt: 0 },
        isBlocked: false,
        // ⚠️ O'CHIRILGAN HISOB REYTINGDA YO'Q: reyting — RAG'BAT
        // ro'yxati va "O'chirilgan foydalanuvchi" nomi bilan qator
        // unda turishi ma'nosiz bo'lardi. Ball ham nolga tushadi
        // (`deleteMe`), ya'ni bu IKKINCHI himoya qatlami.
        ...activeCitizenWhere,
        ...(districtId ? { districtId } : {}),
      },
      orderBy: { points: "desc" },
      take: 50,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        photoUrl: true,
        points: true,
        district: { select: { name: true } },
        _count: { select: { issues: true } },
      },
    });

    return rows.map((c, index) => ({
      rank: index + 1,
      id: c.id,
      name: [c.firstName, c.lastName].filter(Boolean).join(" "),
      photoUrl: c.photoUrl,
      points: c.points,
      appeals: c._count.issues,
      districtName: c.district?.name ?? null,
    }));
  }

  // ═══════════════════════════════════════════════════════════════
  //  Ichki
  // ═══════════════════════════════════════════════════════════════

  private async enforceDailyLimit(citizenId: string) {
    const settings = await this.prisma.settings.findUnique({
      where: { id: "singleton" },
      select: { mobileDailyLimit: true },
    });
    const limit = settings?.mobileDailyLimit ?? 0;
    if (limit <= 0) return; // 0 — cheksiz

    const since = new Date();
    since.setHours(0, 0, 0, 0);

    const today = await this.prisma.issue.count({
      where: { citizenId, createdAt: { gte: since } },
    });

    if (today >= limit) {
      // ⚠️ SABAB MAJBURIY — fuqaroga ko'rsatiladi (429 ≠ "ilova
      // buzilgan"). Blok emas, sekinlatish: ertaga yana yuboradi.
      throw new ForbiddenException(
        `Bugun ${limit} ta murojaat yuborildi. Ertaga yana yuborishingiz mumkin.`,
      );
    }
  }

  private async appealStats(citizenId: string) {
    const [total, open, resolved] = await Promise.all([
      this.prisma.issue.count({ where: { citizenId } }),
      this.prisma.issue.count({
        where: { citizenId, status: { in: [IssueStatus.new, IssueStatus.in_progress] } },
      }),
      this.prisma.issue.count({ where: { citizenId, status: IssueStatus.resolved } }),
    ]);
    return { total, open, resolved };
  }

  private async statusCounts(citizenId: string) {
    const [all, open, resolved, rejected] = await Promise.all([
      this.prisma.issue.count({ where: { citizenId } }),
      this.prisma.issue.count({
        where: { citizenId, status: { in: [IssueStatus.new, IssueStatus.in_progress] } },
      }),
      this.prisma.issue.count({ where: { citizenId, status: IssueStatus.resolved } }),
      this.prisma.issue.count({ where: { citizenId, status: IssueStatus.rejected } }),
    ]);
    return { all, open, resolved, rejected };
  }

  private timeline(status: IssueStatus) {
    // ⚠️ RAD ETILGANDA BOSHQACHA: "yopiladi" bosqichi bajarilgan deb
    // ko'rsatilmaydi (muammo hal bo'lmadi).
    if (status === IssueStatus.rejected) {
      return [
        { key: "new", label: "Qabul qilindi", done: true },
        { key: "rejected", label: "Rad etildi", done: true },
      ];
    }
    return TIMELINE.map((step) => ({
      key: step.key,
      label: step.label,
      done: step.statuses.includes(status),
    }));
  }

  private toListItem(issue: {
    id: string;
    publicNo: string;
    title: string;
    status: IssueStatus;
    address: string | null;
    createdAt: Date;
    reviewedAt: Date | null;
    dueAt: Date | null;
    category: { id: string; name: string; color: string | null; icon: string | null };
    attachments: { path: string }[];
    _count: { comments: number };
  }) {
    return {
      id: issue.id,
      publicNo: issue.publicNo,
      title: issue.title,
      status: issue.status,
      address: issue.address,
      createdAt: issue.createdAt,
      resolvedAt: issue.reviewedAt,
      dueAt: issue.dueAt,
      category: issue.category,
      photos: issue.attachments.map((a) => a.path),
      commentCount: issue._count.comments,
      timeline: this.timeline(issue.status),
    };
  }

  /** Birinchi qatordan sarlavha (`bot-issues.controller.ts#deriveTitle` bilan ayni g'oya). */
  private deriveTitle(body: string): string {
    const firstLine = body.trim().split("\n")[0]!.trim();
    return firstLine.length > 120 ? `${firstLine.slice(0, 117)}...` : firstLine || "Murojaat";
  }

  private signAi(value: SignedAi): string {
    return signRef(AI_SIGN_CONTEXT, value);
  }

  private verifyAi(token: string): SignedAi | null {
    return verifyRef<SignedAi>(AI_SIGN_CONTEXT, token);
  }
}
