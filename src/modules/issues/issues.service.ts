/**
 * MUAMMOLAR — RASMIY MUROJAAT NAVBATI.
 *
 * Muammo UCH YO'L bilan keladi va `source` ustuni buni MUHRLAYDI:
 *
 *   signal  — AI topdi, odam biriktirdi (`signals.service.ts#attach`)
 *   bot     — odam botdan qo'lda yubordi
 *   manual  — panelda qo'lda yaratildi
 *
 * ⚠️ MANBA O'ZGARMAYDI. Hisobotda "AI nechta muammo topdi, odam
 * nechta yubordi" degan savolga javob shu ustundan chiqadi — AI'ning
 * foydasini o'lchashning YAGONA yo'li.
 *
 * ⚠️ HUDUD MUAMMOGA MUHRLANADI (`mahallaId`), guruhdan jonli
 * o'qilmaydi. Guruhning MFY biriktirishi keyinroq o'zgarishi mumkin
 * va o'shanda o'tgan hisobot JIMGINA qayta yozilardi: "mart oyida
 * Chilonzorda 12 ta murojaat" degan raqam o'zgarib ketardi.
 */

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";

import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../common/audit.service";
import {
  canTouchDistrict,
  isOrgScope,
  isProvinceWide,
  issueScopeWhere,
  type ScopeContext,
} from "../../common/scope.util";
import { paginate, type Paginated } from "../../common/dto/pagination.dto";
import { POINTS } from "../../common/points";
import {
  IssueSource,
  IssueStatus,
  ScopeKind,
  type IssuePriority,
  type Prisma,
} from "@prisma/client";
import { OrgRoutingService } from "../organizations/org-routing.service";
import { AssignmentRulesService } from "./assignment-rules.service";
import { IssueNotifyService } from "./issue-notify.service";
import type {
  AddCommentDto,
  AssignIssueDto,
  CreateIssueDto,
  ListIssuesQuery,
  ResolveIssueDto,
} from "./dto/issues.dto";

/** Tranzaksiya ichida ishlatiladigan client turi. */
type TxClient = Prisma.TransactionClient;

/** Yopilgan holatlar — qayta yopib bo'lmaydi. */
const CLOSED_STATUSES: IssueStatus[] = [IssueStatus.resolved, IssueStatus.rejected];

@Injectable()
export class IssuesService {
  private readonly logger = new Logger(IssuesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notify: IssueNotifyService,
    private readonly rules: AssignmentRulesService,
    /**
     * ⚠️ YO'NALTIRISH QOIDASI ALOHIDA XIZMATDA
     * (`organizations` moduli): u `MahallaAssignee` dan BOSHQA
     * kalit bo'yicha ishlaydi (tuman × yo'nalish) va uni shu
     * yerga ko'chirish ikki qoidani bir tanaga qo'shib,
     * "qaysi biri ustun" degan soxta savolni tug'dirardi.
     */
    private readonly orgRouting: OrgRoutingService,
  ) {}

  // ═══════════════════════════════════════════════════════════════
  //  YARATISH
  // ═══════════════════════════════════════════════════════════════

  /**
   * SIGNALDAN YARATADI — `signals.service.ts#attach` chaqiradi.
   *
   * ⚠️ TRANZAKSIYA TASHQARIDAN KELADI (`tx` parametri): muammo va
   * signal holati BIRGA o'zgarishi kerak. Ikkisi orasida uzilish
   * bo'lsa, muammo yaratilib signal `new` holida qolardi — va u
   * ikkinchi marta biriktirilib, IKKI muammo paydo bo'lardi.
   *
   * ⚠️ `authorChatId` BERILMAYDI: javob MFY guruhiga ketmasligi
   * kerak (bot u yerda kuzatuvchi).
   */
  async createFromSignal(
    tx: TxClient,
    input: {
      categoryId: string;
      mahallaId: string | null;
      title: string;
      body: string;
      priority?: IssuePriority;
      authorId: string;
      sourceMeta: Prisma.InputJsonValue;
    },
  ) {
    const category = await tx.issueCategory.findUnique({
      where: { id: input.categoryId },
      select: { id: true, isActive: true, slaHours: true },
    });
    if (!category) throw new NotFoundException("Kategoriya topilmadi");
    if (!category.isActive) throw new BadRequestException("Kategoriya faol emas");

    /**
     * ⚠️ IJROCHI QOIDASI SIGNALDA HAM ISHLAYDI: signaldan chiqqan
     * muammo ham o'sha MFY ning o'sha yo'nalishiga tegishli va uni
     * boshqacha taqsimlash "botdan kelgani bir xodimda, signaldan
     * kelgani boshqasida" degan chalkashlik tug'dirardi.
     *
     * ⚠️ HOLAT `new` BO'LIB QOLADI — `assignment-rules.service.ts`
     * izohi: biriktirish avtomatik bo'lgani ish boshlanganini
     * bildirmaydi.
     */
    const auto = await this.rules.fieldsFor(
      input.mahallaId,
      input.categoryId,
      category.slaHours,
    );

    /**
     * ⚠️ TASHKILOTGA YO'NALTIRISH SIGNALDAN KELGANDA HAM ISHLAYDI:
     * guruhdagi "suv yo'q" xabari ham, ilovadan kelgan murojaat ham
     * AYNI tashkilotga tegishli. Boshqacha qilinsa, "ilovadan
     * kelgani Suvoqovaga ketdi, guruhdan kelgani esa shtabda
     * qoldi" degan ajralish paydo bo'lardi.
     */
    const org = await this.orgRouting.resolve(input.mahallaId, input.categoryId);

    const issue = await tx.issue.create({
      data: {
        publicNo: await this.nextPublicNo(tx),
        categoryId: input.categoryId,
        source: IssueSource.signal,
        mahallaId: input.mahallaId,
        title: input.title,
        body: input.body,
        priority: input.priority,
        authorId: input.authorId,
        sourceMeta: input.sourceMeta,
        organizationId: org?.organizationId ?? null,
        ...(auto
          ? { assigneeId: auto.assigneeId, dueAt: auto.dueAt, dueSource: "rule" }
          : {}),
      },
      select: { id: true, publicNo: true },
    });

    /**
     * ⚠️ XABARNOMA TRANZAKSIYADAN KEYIN EMAS, LEKIN UNI KUTMAYDI
     * HAM (`void`): Telegram so'rovi tranzaksiya ichida kutilsa,
     * baza ulanishi xabar yuborilguncha band bo'lib turardi — va
     * Telegram javob bermasa, tranzaksiya ham osilib qolardi.
     */
    if (org) void this.notifyOrganization(issue.id);

    return issue;
  }

  /** PANELDA QO'LDA YARATADI. */
  async create(dto: CreateIssueDto, scope: ScopeContext) {
    const category = await this.prisma.issueCategory.findUnique({
      where: { id: dto.categoryId },
      select: { id: true, isActive: true, slaHours: true },
    });
    if (!category) throw new NotFoundException("Kategoriya topilmadi");
    if (!category.isActive) throw new BadRequestException("Kategoriya faol emas");

    if (dto.mahallaId) {
      const mahalla = await this.prisma.mahalla.findUnique({
        where: { id: dto.mahallaId },
        select: { districtId: true },
      });
      if (!mahalla) throw new NotFoundException("MFY topilmadi");

      if (!canTouchDistrict(scope, mahalla.districtId)) {
        throw new ForbiddenException("Bu MFY sizning qamrovingizda emas");
      }
    }

    /**
     * ⚠️ QO'LDA KO'RSATILGAN IJROCHI USTUN: qoida — ZAXIRA javob,
     * odamning qarorini bosib o'tmaydi. Shuning uchun qoida faqat
     * `assigneeId` BERILMAGANDA qidiriladi.
     *
     * ⚠️ MUDDAT HAM SHUNDAY: panelda `dueAt` yozilgan bo'lsa,
     * qoidadagi SLA unga tegmaydi.
     */
    const auto = dto.assigneeId
      ? null
      : await this.rules.fieldsFor(dto.mahallaId, dto.categoryId, category.slaHours);

    /**
     * ⚠️ PANELDA QO'LDA YARATILGAN MUROJAAT HAM TASHKILOTGA
     * YO'NALTIRILADI: xodim telefon orqali kelgan shikoyatni
     * panelga kiritadi va u ham o'sha tashkilotning ishi.
     * Yo'naltirilmasa, oqim manbaga qarab ikkiga bo'linardi.
     */
    const org = await this.orgRouting.resolve(dto.mahallaId, dto.categoryId);

    const issue = await this.prisma.issue.create({
      data: {
        publicNo: await this.nextPublicNo(this.prisma),
        categoryId: dto.categoryId,
        source: IssueSource.manual,
        mahallaId: dto.mahallaId ?? null,
        title: dto.title.trim(),
        body: dto.body.trim(),
        priority: dto.priority,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : (auto?.dueAt ?? null),
        /**
         * ⚠️ MUDDAT QAYERDAN KELGANI YOZILADI: panel "qo'lda
         * qo'yilganmi, qoidadanmi" degan savolga javobni shundan
         * oladi. Avval faqat sana turardi.
         */
        dueSource: dto.dueAt ? "manual" : auto ? "rule" : null,
        authorId: scope.userId,
        assigneeId: dto.assigneeId ?? auto?.assigneeId ?? null,
        organizationId: org?.organizationId ?? null,
        sourceMeta: { channel: "panel" },
      },
      select: { id: true, publicNo: true },
    });

    if (org) void this.notifyOrganization(issue.id);

    await this.audit.record({
      userId: scope.userId,
      action: "issue.create",
      entity: "Issue",
      entityId: issue.id,
      meta: { publicNo: issue.publicNo },
    });

    return issue;
  }

  /**
   * TASHKILOTGA XABARNOMA — YANGI MUROJAAT.
   *
   * ⚠️ BITTA JOYDA, UCHALA OQIM UCHUN: murojaat panel, signal va
   * ilova/bot orqali yaratiladi va "kimga yuborilmaydi" qoidalari
   * uchalasida AYNI bo'lishi kerak. Har yaratish joyida
   * takrorlansa, bittasi albatta eskirardi va o'sha yo'ldan
   * kelgan murojaat tashkilotga yigirma marta xabar yuborardi.
   *
   * ⚠️ `void` BILAN CHAQIRILADI (natija kutilmaydi): Telegram
   * so'rovi sekin bo'lishi mumkin va fuqaro "yuborildi" javobini
   * xabar ketishini kutib turmasligi kerak. Xato ham yuqoriga
   * chiqmaydi (`issue-notify.service.ts` doktrinasi).
   */
  async notifyOrganization(issueId: string): Promise<void> {
    try {
      const issue = await this.prisma.issue.findUnique({
        where: { id: issueId },
        select: {
          publicNo: true,
          body: true,
          address: true,
          dueAt: true,
          duplicateOfId: true,
          isSuspicious: true,
          category: { select: { name: true } },
          mahalla: {
            select: { name: true, district: { select: { name: true } } },
          },
          organization: {
            select: {
              id: true,
              telegramChatId: true,
              isActive: true,
              isArchived: true,
              users: {
                where: { isArchived: false, isActive: true, telegramId: { not: null } },
                select: { telegramId: true },
              },
            },
          },
        },
      });

      if (!issue?.organization) return;
      if (!issue.organization.isActive || issue.organization.isArchived) return;

      /**
       * ⚠️ TAKRORIY MUROJAATDA XABAR YUBORILMAYDI. Transformator
       * o'chganda 20 kishi "svet yo'q" deb yozadi va asosiysiga
       * xabar ALLAQACHON ketgan — qolgan 19 tasi uchun ayni xabar
       * yuborilsa, tashkilotning chati bir hodisa tufayli
       * to'lib ketardi va keyingi HAQIQIY xabar ko'rinmay
       * qolardi.
       */
      if (issue.duplicateOfId !== null) return;

      /**
       * ⚠️ SHUBHALI MUROJAATDA HAM YUBORILMAYDI: matni fuqaroning
       * o'z ismi bo'lgan yoki mazmunsiz murojaat tashkilotga
       * ketsa, uni HAL QILIB BO'LMASDI — tashkilot esa "bu nima"
       * deb shtabga qayta qo'ng'iroq qilardi. Murojaat panelda
       * turadi va xodim uni ko'rib chiqadi
       * (`appeal-triage.service.ts` — "faqat belgilaydi, rad
       * etmaydi").
       */
      if (issue.isSuspicious) return;

      /**
       * ⚠️ MANZIL IKKI MANBADAN: avval tashkilotning O'Z chati
       * (ish guruhi), u bo'lmasa xodimlarining shaxsiy chatlari.
       * Ikkisi BIRGA yuborilmaydi — o'shanda rahbar ayni xabarni
       * guruhda ham, shaxsiy chatida ham olardi.
       *
       * ⚠️ `telegramId` BO'LMASA JIM O'TADI: tashkilot hali botga
       * ulanmagan bo'lishi mumkin va bu XATO EMAS — murojaat
       * panelda baribir ko'rinadi (`citizens.service.ts` dagi
       * tarqatma filtri bilan ayni qoida).
       */
      const chatIds = issue.organization.telegramChatId
        ? [issue.organization.telegramChatId]
        : issue.organization.users
            .map((user) => user.telegramId)
            .filter((id): id is string => id !== null);

      if (chatIds.length === 0) return;

      await this.notify.sendOrgAssignment({
        chatIds,
        publicNo: issue.publicNo,
        categoryName: issue.category.name,
        mahallaName: issue.mahalla?.name ?? null,
        districtName: issue.mahalla?.district.name ?? null,
        address: issue.address,
        body: issue.body,
        dueAt: issue.dueAt,
      });
    } catch (error) {
      this.logger.warn(
        `Tashkilotga xabarnoma yuborilmadi (${issueId}): ${(error as Error).message}`,
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  O'QISH
  // ═══════════════════════════════════════════════════════════════

  async list(scope: ScopeContext, query: ListIssuesQuery): Promise<Paginated<unknown>> {
    const where = {
      // ⚠️ `includeUnassigned`: hududi qo'yilmagan muammo (botdan
      // kelgani) ko'rinishi kerak — aks holda u jim turib qolardi.
      /**
       * ⚠️ `issueScopeWhere`, `mahallaScopeWhere` EMAS: tashkilot
       * xodimi uchun qamrov HUDUDIY emas — u o'z tashkilotiga
       * yo'naltirilgan murojaatlarni ko'radi (`scope.util.ts`).
       * Qolgan hamma xodim uchun natija AVVALGIDEK.
       */
      ...issueScopeWhere(scope, { includeUnassigned: isProvinceWide(scope) }),
      ...(query.status ? { status: query.status } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.source ? { source: query.source } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      /*
       * TUMAN FILTRI — xaritadan o'tish uchun.
       *
       * ⚠️ `mahallaId` USTUN TURADI: ikkisi birga kelsa, aniqrog'i
       * (MFY) tanlanadi. Ikkalasini ham qo'llash mumkin edi, lekin
       * "boshqa tumandagi MFY" kombinatsiyasi BO'SH ro'yxat berib,
       * foydalanuvchi sababini topa olmasdi.
       *
       * ⚠️ QAMROV USTIDAN O'TMAYDI: bu `where` ga QO'SHILADI
       * (`issueScopeWhere` yuqorida) — tuman xodimi boshqa
       * tumanni so'rasa ham AND sharti uni bo'sh qaytaradi.
       */
      ...(query.mahallaId
        ? { mahallaId: query.mahallaId }
        : query.districtId
          ? { mahalla: { districtId: query.districtId } }
          : {}),
      ...(query.assigneeId ? { assigneeId: query.assigneeId } : {}),
      /**
       * ⚠️ QAMROV USTIDAN O'TMAYDI: bu `where` ga QO'SHILADI
       * (`issueScopeWhere` yuqorida) — tashkilot xodimi begona
       * tashkilotni so'rasa ham AND sharti ro'yxatni bo'sh
       * qaytaradi.
       */
      ...(query.organizationId ? { organizationId: query.organizationId } : {}),
      // ⚠️ `overdue` — MUDDATI O'TGAN VA HALI YOPILMAGAN. Yopilgan
      // muammoning muddati o'tgani ahamiyatsiz: u allaqachon hal
      // qilingan.
      ...(query.overdue
        ? { dueAt: { lt: new Date() }, status: { notIn: CLOSED_STATUSES } }
        : {}),
      ...(query.suspicious ? { isSuspicious: true } : {}),
      /**
       * ⚠️ `true` — FAQAT TAKRORIYLARI, `false` — FAQAT ASOSIYLARI.
       * Berilmasa HAMMASI: standart ro'yxat to'liq bo'lishi kerak,
       * aks holda murojaat "yo'qolgan" dek ko'rinardi.
       */
      ...(query.duplicates === true ? { duplicateOfId: { not: null } } : {}),
      ...(query.duplicates === false ? { duplicateOfId: null } : {}),
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: "insensitive" as const } },
              { body: { contains: query.search, mode: "insensitive" as const } },
              { publicNo: { contains: query.search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [issues, total] = await Promise.all([
      this.prisma.issue.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: query.skip,
        take: query.limit,
        include: {
          category: { select: { id: true, name: true, color: true } },
          mahalla: {
            select: { id: true, name: true, district: { select: { id: true, name: true } } },
          },
          assignee: { select: { id: true, firstName: true, lastName: true } },
          /** ⚠️ Ro'yxatda ham ko'rinadi: "bu kimning ishi" degan savol. */
          organization: { select: { id: true, name: true, shortName: true } },
          author: { select: { id: true, firstName: true, lastName: true } },
          citizen: { select: { id: true, firstName: true, lastName: true } },
          // ⚠️ TAKRORIYLAR SONI RO'YXATDA KO'RINADI: "bu bitta
          // murojaat emas, 20 ta odam yozgan" degan ma'lumot xodimga
          // ustuvorlikni tushunish uchun kerak.
          _count: { select: { comments: true, duplicates: true } },
        },
      }),
      this.prisma.issue.count({ where }),
    ]);

    const now = Date.now();

    const items = issues.map((issue) => ({
      id: issue.id,
      publicNo: issue.publicNo,
      title: issue.title,
      status: issue.status,
      priority: issue.priority,
      source: issue.source,
      category: issue.category,
      mahalla: issue.mahalla,
      assignee: issue.assignee,
      /**
       * ⚠️ QISQA NOM USTUN TURADI: "Andijon viloyat suv ta'minoti
       * boshqarmasi" jadval ustuniga sig'maydi va qator ikki
       * qatorga bo'linib, ro'yxat o'qilmaydigan bo'lib qolardi.
       */
      organization: issue.organization
        ? {
            id: issue.organization.id,
            name: issue.organization.shortName ?? issue.organization.name,
          }
        : null,
      /** ⚠️ Tashkilot bajardi, lekin murojaat hali YOPILMAGAN. */
      orgDoneAt: issue.orgDoneAt,
      author: issue.author,
      // ⚠️ MOBIL MUROJAATDA MUALLIF FUQARO: panel `source==="mobile"`
      // da shuni ko'rsatadi.
      citizen: issue.citizen
        ? {
            id: issue.citizen.id,
            name: [issue.citizen.firstName, issue.citizen.lastName].filter(Boolean).join(" "),
          }
        : null,
      dueAt: issue.dueAt,
      // ⚠️ MUDDAT — MO'LJAL, MAJBURIYAT EMAS: tizim o'tganda hech
      // narsa qilmaydi, faqat panelda ajratib ko'rsatadi
      // (schema'dagi izoh).
      isOverdue:
        issue.dueAt !== null &&
        issue.dueAt.getTime() < now &&
        !CLOSED_STATUSES.includes(issue.status),
      commentCount: issue._count.comments,
      /**
       * ⚠️ TAKRORIYLAR SONI: "bu bitta murojaat emas, 20 ta odam
       * yozgan" — ustuvorlikni tushunish uchun eng muhim belgi.
       */
      duplicateCount: issue._count.duplicates,
      /** ⚠️ O'ZI TAKRORIYMI (asosiysi boshqa yozuv). */
      isDuplicate: issue.duplicateOfId !== null,
      duplicateOfId: issue.duplicateOfId,
      isSuspicious: issue.isSuspicious,
      suspicionReason: issue.suspicionReason,
      createdAt: issue.createdAt,
      resolvedAt: issue.reviewedAt,
    }));

    return paginate(items, total, query);
  }

  async findOne(id: string, scope: ScopeContext) {
    const issue = await this.prisma.issue.findUnique({
      where: { id },
      include: {
        category: { select: { id: true, name: true, color: true, icon: true } },
        mahalla: {
          select: {
            id: true,
            name: true,
            chairmanName: true,
            chairmanPhone: true,
            district: { select: { id: true, name: true } },
          },
        },
        assignee: { select: { id: true, firstName: true, lastName: true } },
        /**
         * ⚠️ IJROCHI TASHKILOT — `assignee` NING O'RNINI BOSMAYDI:
         * biri ishni BAJARADI, ikkinchisi shtabda KUZATADI
         * (schema'dagi izoh). Panel ikkisini yonma-yon
         * ko'rsatadi.
         */
        organization: {
          select: {
            id: true,
            name: true,
            shortName: true,
            phone: true,
            district: { select: { id: true, name: true } },
          },
        },
        orgDoneUser: { select: { id: true, firstName: true, lastName: true } },
        author: { select: { id: true, firstName: true, lastName: true } },
        // ⚠️ MOBIL MUROJAAT MUALLIFI — FUQARO (`citizenId`), xodim emas.
        // Panel uni "Yuborgan" sifatida ko'rsatadi.
        citizen: {
          select: { id: true, firstName: true, lastName: true, username: true, phone: true, telegramId: true },
        },
        reviewer: { select: { id: true, firstName: true, lastName: true } },
        /**
         * ⚠️ TAKRORIYLAR RO'YXATI: xodim "shu bitta javob 20
         * odamga ketadi" degan narsani KO'RISHI kerak — aks holda u
         * javobni bitta odamga yozgandek yozardi.
         */
        duplicates: {
          select: {
            id: true,
            publicNo: true,
            createdAt: true,
            citizen: { select: { id: true, firstName: true, lastName: true } },
          },
          orderBy: { createdAt: "asc" },
        },
        duplicateOf: { select: { id: true, publicNo: true, title: true } },
        // Fuqaro yuborgan dalil fayllari.
        attachments: {
          select: { id: true, kind: true, path: true, mimeType: true, size: true },
          orderBy: { createdAt: "asc" },
        },
        signal: {
          select: { id: true, kind: true, severity: true, senderName: true, sentAt: true },
        },
        comments: {
          orderBy: { createdAt: "asc" },
          include: {
            user: { select: { id: true, firstName: true, lastName: true } },
            citizen: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
    });
    if (!issue) throw new NotFoundException("Muammo topilmadi");

    this.assertScope(
      scope,
      issue.mahalla?.district.id ?? null,
      issue.mahallaId,
      issue.organizationId,
    );

    return issue;
  }

  async getStats(scope: ScopeContext) {
    const scopeWhere = issueScopeWhere(scope, {
      includeUnassigned: isProvinceWide(scope),
    });

    const [byStatus, overdue, unassignedMahalla] = await Promise.all([
      this.prisma.issue.groupBy({
        by: ["status"],
        where: scopeWhere,
        _count: { _all: true },
      }),
      this.prisma.issue.count({
        where: { ...scopeWhere, dueAt: { lt: new Date() }, status: { notIn: CLOSED_STATUSES } },
      }),
      this.prisma.issue.count({ where: { ...scopeWhere, mahallaId: null } }),
    ]);

    const counts: Record<string, number> = {
      new: 0,
      in_progress: 0,
      resolved: 0,
      rejected: 0,
    };
    for (const row of byStatus) counts[row.status] = row._count._all;

    return {
      ...counts,
      open: counts.new! + counts.in_progress!,
      overdue,
      unassignedMahalla,
    };
  }

  // ═══════════════════════════════════════════════════════════════
  //  O'ZGARTIRISH
  // ═══════════════════════════════════════════════════════════════

  /**
   * IJROCHI BELGILAYDI.
   *
   * ⚠️ BELGILASH HOLATNI `in_progress` GA SURADI. Sabab: "ijrochisi
   * bor, lekin hali yangi" holati panelda chalkashlik beradi — kimdir
   * ishlayaptimi yoki yo'qmi bilinmaydi. Yopilgan muammoga ijrochi
   * belgilash esa holatni ORQAGA qaytarmaydi (pastdagi shart).
   */
  async assign(id: string, dto: AssignIssueDto, scope: ScopeContext) {
    const issue = await this.loadForWrite(id, scope);

    if (dto.assigneeId) {
      const assignee = await this.prisma.user.findUnique({
        where: { id: dto.assigneeId },
        select: { id: true, isActive: true, isArchived: true, scopeKind: true },
      });
      if (!assignee) throw new NotFoundException("Xodim topilmadi");

      // ⚠️ ARXIVLANGAN XODIMGA TOPSHIRILMAYDI: u panelga kira olmaydi
      // va muammo jimgina hech kim ko'rmaydigan joyda qolib ketardi.
      if (assignee.isArchived || !assignee.isActive) {
        throw new BadRequestException("Bu xodim faol emas");
      }

      /**
       * ⚠️ TASHKILOT XODIMIGA TOPSHIRILMAYDI (`assignment-rules.
       * service.ts#save` dagi ayni tekshiruv): uning qamrovi
       * `organizationId` bo'yicha, ya'ni `assigneeId` ga
       * qo'yilgan murojaat uning ro'yxatida ko'rinmaydi —
       * panelda esa "ijrochi belgilangan" bo'lib turardi.
       */
      if (assignee.scopeKind === ScopeKind.org) {
        throw new BadRequestException(
          "Tashkilot xodimi ijrochi qilib belgilanmaydi — murojaat unga yo'naltirish qoidasi orqali boradi",
        );
      }
    }

    const updated = await this.prisma.issue.update({
      where: { id },
      data: {
        assigneeId: dto.assigneeId ?? null,
        dueAt: dto.dueAt !== undefined ? (dto.dueAt ? new Date(dto.dueAt) : null) : undefined,
        // ⚠️ MUDDATNI ODAM O'ZGARTIRDI — manba ham shunga
        // yangilanadi, aks holda panel eski manbani ko'rsatib,
        // "yo'nalish SLA'si" deb yolg'on gapirardi.
        ...(dto.dueAt !== undefined ? { dueSource: dto.dueAt ? "manual" : null } : {}),
        ...(dto.assigneeId && issue.status === IssueStatus.new
          ? { status: IssueStatus.in_progress }
          : {}),
      },
      select: { id: true, assigneeId: true, status: true, dueAt: true },
    });

    await this.audit.record({
      userId: scope.userId,
      action: "issue.assign",
      entity: "Issue",
      entityId: id,
      meta: { before: issue.assigneeId, after: dto.assigneeId ?? null },
    });

    return updated;
  }

  /**
   * YOPADI — hal qilindi yoki rad etildi.
   *
   * ⚠️ `resolution` MAJBURIY: "hal qilindi" degan bo'sh yozuv
   * keyinchalik hech narsa bermaydi va aynan shu matn BOTDAGI
   * MUALLIFGA javob sifatida ketadi. Bo'sh qoldirilsa, odam
   * "muammongiz hal qilindi" degan mazmunsiz xabar olardi.
   *
   * ⚠️ QAYTA YOPILMAYDI: yopilgan muammo `reviewedBy`/`reviewedAt`
   * olgan va uni qayta yozish kim qachon qaror qilganini
   * yo'qotardi. Qayta ochish — ALOHIDA amal (`reopen`).
   */
  async resolve(id: string, dto: ResolveIssueDto, scope: ScopeContext) {
    const issue = await this.loadForWrite(id, scope);

    if (CLOSED_STATUSES.includes(issue.status)) {
      throw new BadRequestException(
        "Bu muammo allaqachon yopilgan — qayta ochib, so'ng yoping",
      );
    }

    const status = dto.rejected ? IssueStatus.rejected : IssueStatus.resolved;

    const updated = await this.prisma.issue.update({
      where: { id },
      data: {
        status,
        resolution: dto.resolution.trim(),
        reviewedBy: scope.userId,
        reviewedAt: new Date(),
      },
      select: { id: true, publicNo: true, status: true, title: true },
    });

    await this.audit.record({
      userId: scope.userId,
      action: dto.rejected ? "issue.reject" : "issue.resolve",
      entity: "Issue",
      entityId: id,
      meta: { publicNo: updated.publicNo },
    });

    // ⚠️ XABAR YUBORISH ASOSIY AMALDAN KEYIN VA UNI TO'XTATMAYDI:
    // Telegram yiqilsa muammo baribir yopilgan bo'lib qolishi kerak.
    // `notify` ichida xato ushlanadi. Manzil `replyChatId` dan: botda
    // chat, mobilda fuqaroning shaxsiy chati, signalda — null (ketmaydi).
    await this.notify.sendResolution({
      chatId: this.replyChatId(issue),
      publicNo: updated.publicNo,
      title: updated.title,
      resolution: dto.resolution.trim(),
      rejected: Boolean(dto.rejected),
    });

    // ⚠️ FUQAROGA HAL BO'LGANI UCHUN QO'SHIMCHA BALL — faqat HAL
    // QILINGANDA (rad etilganda emas: `points.ts` "jazo emas" izohi).
    if (!dto.rejected && issue.citizenId) {
      await this.prisma.citizen
        .update({
          where: { id: issue.citizenId },
          data: { points: { increment: POINTS.APPEAL_RESOLVED } },
        })
        .catch(() => undefined);
    }

    /**
     * ── TAKRORIY MUROJAATLAR BIRGA YOPILADI ───────────────────
     *
     * ⚠️ HAQIQIY HOLATDAN: transformator o'chsa, guruhda 20 odam
     * "svet o'chdi" deb yozadi. Ularning har biriga ALOHIDA javob
     * yozish bitta ishni yigirma marta qilish degani edi — va
     * xodim oxirgi beshtasini yozmay qo'yardi.
     *
     * ⚠️ JAVOB HAMMASIGA KETADI: har fuqaro o'z murojaatiga
     * javob olishi kerak (ilovada "murojaatlarim" — uning haqqi).
     * Faqat asosiysiga javob berilsa, qolgan 19 odam javobsiz
     * qolardi.
     *
     * ⚠️ YOPILGANLARI TEGILMAYDI: kimdir qo'lda yopib ulgurgan
     * bo'lishi mumkin va uning javobi qayta yozilmasligi kerak.
     */
    await this.closeDuplicates(id, dto, scope, updated.publicNo);

    return updated;
  }

  /**
   * ASOSIY MUROJAAT BILAN BIRGA TAKRORIYLARINI YOPADI.
   *
   * ⚠️ XATO YUTILADI: asosiy murojaat ALLAQACHON yopilgan va
   * takroriylar bilan bog'liq muammo uni qaytarib ochmasligi kerak.
   *
   * ⚠️ KETMA-KET XABAR (`issue-notify` bilan ayni sabab): Telegram
   * 429 bermasligi uchun.
   */
  private async closeDuplicates(
    parentId: string,
    dto: ResolveIssueDto,
    scope: ScopeContext,
    parentPublicNo: string,
  ): Promise<void> {
    try {
      const duplicates = await this.prisma.issue.findMany({
        /**
         * ⚠️ SHUBHALI MUROJAAT BIRGA YOPILMAYDI — IKKINCHI
         * QALQON. Triaj uni takroriy deb ulamaydi
         * (`appeal-triage.service.ts`), lekin xodim uni QO'LDA
         * ulagan bo'lishi mumkin. Shundayam avtomatik yopmaslik
         * kerak: mazmunsiz matnli murojaat egasiga BEGONA javob
         * ketardi.
         */
        where: {
          duplicateOfId: parentId,
          status: { notIn: CLOSED_STATUSES },
          isSuspicious: false,
        },
        select: {
          id: true,
          publicNo: true,
          title: true,
          citizenId: true,
          authorChatId: true,
          citizen: { select: { telegramId: true } },
        },
      });

      if (duplicates.length === 0) return;

      const status = dto.rejected ? IssueStatus.rejected : IssueStatus.resolved;
      const resolution = dto.resolution.trim();

      await this.prisma.issue.updateMany({
        where: { id: { in: duplicates.map((item) => item.id) } },
        data: {
          status,
          resolution,
          reviewedBy: scope.userId,
          reviewedAt: new Date(),
        },
      });

      await this.audit.record({
        userId: scope.userId,
        action: dto.rejected ? "issue.reject.bulk" : "issue.resolve.bulk",
        entity: "Issue",
        entityId: parentId,
        meta: {
          publicNo: parentPublicNo,
          closed: duplicates.length,
          reason: "takroriy murojaatlar",
        },
      });

      for (const duplicate of duplicates) {
        await this.notify.sendResolution({
          chatId: this.replyChatId(duplicate),
          publicNo: duplicate.publicNo,
          title: duplicate.title,
          resolution,
          rejected: Boolean(dto.rejected),
        });

        if (!dto.rejected && duplicate.citizenId) {
          await this.prisma.citizen
            .update({
              where: { id: duplicate.citizenId },
              data: { points: { increment: POINTS.APPEAL_RESOLVED } },
            })
            .catch(() => undefined);
        }
      }

      this.logger.log(
        `${parentPublicNo}: ${duplicates.length} ta takroriy murojaat birga yopildi`,
      );
    } catch (error) {
      this.logger.warn(
        `Takroriy murojaatlar yopilmadi (${parentId}): ${(error as Error).message}`,
      );
    }
  }

  /**
   * QAYTA OCHADI.
   *
   * ⚠️ `resolution` TOZALANADI: eski javob yangi holatga to'g'ri
   * kelmaydi va u panelda "hal qilindi: ..." bo'lib turib, muammo
   * esa ochiq bo'lardi. Tarix auditda va izohlarda qoladi.
   */
  async reopen(id: string, scope: ScopeContext) {
    const issue = await this.loadForWrite(id, scope);

    if (!CLOSED_STATUSES.includes(issue.status)) {
      throw new BadRequestException("Bu muammo ochiq");
    }

    const updated = await this.prisma.issue.update({
      where: { id },
      data: {
        status: issue.assigneeId ? IssueStatus.in_progress : IssueStatus.new,
        resolution: null,
        reviewedBy: null,
        reviewedAt: null,
      },
      select: { id: true, status: true },
    });

    await this.audit.record({
      userId: scope.userId,
      action: "issue.reopen",
      entity: "Issue",
      entityId: id,
    });

    return updated;
  }

  /**
   * IZOH QO'SHADI.
   *
   * ⚠️ APPEND-ONLY: izoh tahrirlanmaydi ham, o'chirilmaydi ham. Bu
   * muammo bo'yicha QAROR TARIXI va uni qayta yozish mumkin emas.
   * Xato yozilsa — yangi izoh qo'shiladi.
   */
  async addComment(id: string, dto: AddCommentDto, scope: ScopeContext) {
    const issue = await this.loadForWrite(id, scope);

    /**
     * ⚠️ TASHKILOT XODIMI OMMAVIY IZOH YOZA OLMAYDI va bu
     * `issues.resolve` berilmagani bilan AYNI qoida: `isPublic`
     * izoh fuqaroning Telegram chatiga XABAR bo'lib ketadi, ya'ni
     * u rasmiy javobning yashirin yo'li bo'lardi. Yuzlab tashkilot
     * hisobiga aholiga to'g'ridan-to'g'ri yozish huquqi berilmaydi
     * — yuborilgan xabarni qaytarib bo'lmaydi.
     *
     * ⚠️ IZOHNING O'ZI TAQIQLANMAYDI: ichki izoh aynan shu yerda
     * kerak ("nasos almashtirildi, 14:00 da suv berildi") va
     * shtab xodimi javobni o'sha izohga tayanib yozadi.
     */
    const isPublic = isOrgScope(scope) ? false : (dto.isPublic ?? false);

    const comment = await this.prisma.issueComment.create({
      data: {
        issueId: id,
        userId: scope.userId,
        body: dto.body.trim(),
        isPublic,
      },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
    });

    // ⚠️ FAQAT `isPublic` IZOH TASHQARIGA KETADI. Standart `false`:
    // ichki muhokama ("bu odam har kuni yozadi") muallifga ketib
    // qolmasligi kerak. Manzil `replyChatId` dan (bot yoki mobil).
    const replyChat = this.replyChatId(issue);
    if (comment.isPublic && replyChat) {
      await this.notify.sendComment({
        chatId: replyChat,
        publicNo: issue.publicNo,
        body: comment.body,
      });
    }

    return comment;
  }

  /**
   * TASHKILOT "BAJARDIM" DEB BELGILAYDI.
   *
   * ⚠️ MUROJAATNI YOPMAYDI VA HOLATNI O'ZGARTIRMAYDI. Rasmiy
   * javobni shtab xodimi yozadi — bu belgi uning uchun SIGNAL:
   * "ish bajarildi, javob yozishingiz mumkin". Holatni
   * `resolved` qilsa, fuqaroga javobsiz "hal qilindi" degan
   * xabar ketardi yoki javob umuman yozilmay qolardi.
   *
   * ⚠️ SHTAB XODIMI HAM BELGILAY OLADI (telefon orqali
   * bajarilganini bilsa): amal `issues.view` dan boshqa ruxsat
   * talab qilmaydi, lekin qamrov baribir tekshiriladi
   * (`loadForWrite`). Faqat tashkilotga qoldirilsa, botga
   * ulanmagan tashkilotning ishi panelda abadiy "bajarilmagan"
   * bo'lib turardi.
   *
   * ⚠️ YOPILGAN MUROJAATDA MA'NOSIZ: javob allaqachon berilgan va
   * belgi hech narsani o'zgartirmasdi.
   */
  async markOrgDone(id: string, done: boolean, scope: ScopeContext) {
    const issue = await this.loadForWrite(id, scope);

    if (CLOSED_STATUSES.includes(issue.status)) {
      throw new BadRequestException("Murojaat allaqachon yopilgan");
    }

    if (!issue.organizationId) {
      throw new BadRequestException("Bu murojaat tashkilotga yo'naltirilmagan");
    }

    const updated = await this.prisma.issue.update({
      where: { id },
      data: {
        orgDoneAt: done ? new Date() : null,
        orgDoneBy: done ? scope.userId : null,
      },
      select: { id: true, orgDoneAt: true },
    });

    await this.audit.record({
      userId: scope.userId,
      action: done ? "issue.org_done" : "issue.org_done.undo",
      entity: "Issue",
      entityId: id,
      meta: { publicNo: issue.publicNo },
    });

    return updated;
  }

  // ───────────────────────────────────────────────────────────────

  /** Yozishdan oldin yuklaydi va qamrovni tekshiradi. */
  private async loadForWrite(id: string, scope: ScopeContext) {
    const issue = await this.prisma.issue.findUnique({
      where: { id },
      select: {
        id: true,
        publicNo: true,
        status: true,
        assigneeId: true,
        mahallaId: true,
        /** ⚠️ Tashkilot xodimining qamrovi aynan shu ustun. */
        organizationId: true,
        orgDoneAt: true,
        authorChatId: true,
        citizenId: true,
        // ⚠️ MOBIL MUROJAATDA `authorChatId` NULL: javob fuqaroning
        // SHAXSIY chatiga (`citizen.telegramId`) boradi. Manzilni bir
        // joydan o'qiymiz — `replyChatId` ikkisidan mavjudini tanlaydi.
        citizen: { select: { telegramId: true } },
        mahalla: { select: { districtId: true } },
      },
    });
    if (!issue) throw new NotFoundException("Muammo topilmadi");

    this.assertScope(
      scope,
      issue.mahalla?.districtId ?? null,
      issue.mahallaId,
      issue.organizationId,
    );

    return issue;
  }

  /**
   * JAVOB QAYSI CHATGA KETADI.
   *
   * ⚠️ `authorChatId` (bot) YOKI `citizen.telegramId` (mini-ilova) —
   * IKKISI HECH QACHON BIRGA to'lmaydi. Signaldan kelganda ikkisi ham
   * null: javob MFY guruhiga ketmaydi (bot kuzatuvchi).
   *
   * ⚠️ MOBIL ILOVADAN (Google) KELGAN MUROJAATDA IKKISI HAM `null`
   * va bu XATO EMAS: o'sha fuqaroning Telegram hisobi yo'q, javobni
   * u ilovaning O'ZIDA ko'radi ("Mening murojaatlarim"). Telegram
   * xabari — qo'shimcha qulaylik, yagona yetkazish yo'li emas.
   */
  private replyChatId(issue: {
    authorChatId: string | null;
    citizen: { telegramId: string | null } | null;
  }): string | null {
    return issue.authorChatId ?? issue.citizen?.telegramId ?? null;
  }

  /**
   * ⚠️ RO'YXAT FILTRI YETARLI EMAS: `PATCH /issues/:id/...` id bilan
   * keladi va ro'yxatdan O'TMAYDI. Filtr va bu tekshiruv — IKKI
   * alohida himoya va ikkalasi ham kerak.
   */
  private assertScope(
    scope: ScopeContext,
    districtId: string | null,
    mahallaId: string | null,
    organizationId: string | null = null,
  ): void {
    /**
     * ⚠️ TASHKILOT XODIMI HUDUD BO'YICHA TEKSHIRILMAYDI: viloyat
     * darajasidagi tashkilotga istalgan tumandan murojaat kelishi
     * mumkin va u o'z murojaatini ko'rishi SHART. Tekshiruv esa
     * `organizationId` ustida — ya'ni begona tashkilotning
     * murojaati unga baribir ochilmaydi (`canTouchIssue`).
     */
    if (isOrgScope(scope)) {
      if (organizationId !== scope.organizationId) {
        throw new ForbiddenException("Bu murojaat sizning tashkilotingizga yo'naltirilmagan");
      }
      return;
    }

    if (isProvinceWide(scope)) return;

    // ⚠️ HUDUDI QO'YILMAGAN MUAMMO (botdan kelgani) — faqat VILOYAT
    // darajasida ko'rinadi: u qaysi tumanga tegishli ekani ma'lum
    // emas va "menikidir" deb qabul qilish boshqa tumanning ishiga
    // aralashish bo'lardi.
    if (mahallaId === null) {
      throw new ForbiddenException(
        "Hududi belgilanmagan murojaat — viloyat darajasida ko'riladi",
      );
    }

    if (!canTouchDistrict(scope, districtId)) {
      throw new ForbiddenException("Bu murojaat sizning qamrovingizda emas");
    }
  }

  /**
   * KEYINGI RAQAM ("MFY-000123").
   *
   * ⚠️ TESHIKSIZ EMAS va bo'lishi SHART EMAS. Teshiksizlikni
   * kafolatlash har yaratishda jadvalni lock qilishni talab qilardi
   * (yoki alohida sekvens jadvali + tranzaksiya), bu esa parallel
   * yaratishni ketma-ketga aylantirardi. Muhimi — TAKRORLANMASLIK va
   * uni `@unique` kafolatlaydi.
   *
   * ⚠️ `count` EMAS, `MAX` ishlatiladi: muammo o'chirilmaydi, lekin
   * `count` baribir xato yo'l — bir marta o'chirilsa raqamlar
   * takrorlanib ketardi.
   */
  async nextPublicNo(client: TxClient | PrismaService): Promise<string> {
    const last = await client.issue.findFirst({
      orderBy: { publicNo: "desc" },
      select: { publicNo: true },
    });

    const lastNumber = last ? Number.parseInt(last.publicNo.replace(/\D/g, ""), 10) : 0;
    const next = Number.isNaN(lastNumber) ? 1 : lastNumber + 1;

    return `MFY-${String(next).padStart(6, "0")}`;
  }
}
