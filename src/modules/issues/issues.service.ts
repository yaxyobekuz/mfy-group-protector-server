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
  isProvinceWide,
  mahallaScopeWhere,
  type ScopeContext,
} from "../../common/scope.util";
import { paginate, type Paginated } from "../../common/dto/pagination.dto";
import { POINTS } from "../../common/points";
import {
  IssueSource,
  IssueStatus,
  type IssuePriority,
  type Prisma,
} from "@prisma/client";
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
      select: { id: true, isActive: true },
    });
    if (!category) throw new NotFoundException("Kategoriya topilmadi");
    if (!category.isActive) throw new BadRequestException("Kategoriya faol emas");

    return tx.issue.create({
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
      },
      select: { id: true, publicNo: true },
    });
  }

  /**
   * BOTDAN YARATADI — xodim botdan qo'lda yubordi.
   *
   * ⚠️ `authorChatId` MUHRLANADI: javob AYNAN SHU chatga qaytadi,
   * keyin bog'lanish uzilsa yoki o'sha telegramga boshqa hisob
   * bog'langan bo'lsa ham. Jonli o'qilsa, javob boshqa odamga ketib
   * qolishi mumkin edi.
   *
   * ⚠️ HUDUD XODIMNING TUMANIDAN OLINMAYDI: xodim boshqa tumandagi
   * muammoni ham yuborishi mumkin (safarda ko'rdi). MFY ni botda
   * tanlash esa o'nlab tugma bo'lardi, shuning uchun `mahallaId`
   * bo'sh qoladi va panelda qo'lda qo'yiladi.
   */
  async createFromBot(input: {
    categoryId: string;
    authorId: string;
    authorChatId: string;
    title: string;
    body: string;
  }) {
    const category = await this.prisma.issueCategory.findUnique({
      where: { id: input.categoryId },
      select: { id: true, isActive: true, name: true },
    });
    if (!category) throw new NotFoundException("Kategoriya topilmadi");
    if (!category.isActive) throw new BadRequestException("Kategoriya faol emas");

    const issue = await this.prisma.issue.create({
      data: {
        publicNo: await this.nextPublicNo(this.prisma),
        categoryId: input.categoryId,
        source: IssueSource.bot,
        title: input.title,
        body: input.body,
        authorId: input.authorId,
        authorChatId: input.authorChatId,
        sourceMeta: { channel: "bot" },
      },
      select: { id: true, publicNo: true, title: true },
    });

    await this.audit.record({
      userId: input.authorId,
      action: "issue.create_bot",
      entity: "Issue",
      entityId: issue.id,
      meta: { publicNo: issue.publicNo, category: category.name },
    });

    return issue;
  }

  /** PANELDA QO'LDA YARATADI. */
  async create(dto: CreateIssueDto, scope: ScopeContext) {
    const category = await this.prisma.issueCategory.findUnique({
      where: { id: dto.categoryId },
      select: { id: true, isActive: true },
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

    const issue = await this.prisma.issue.create({
      data: {
        publicNo: await this.nextPublicNo(this.prisma),
        categoryId: dto.categoryId,
        source: IssueSource.manual,
        mahallaId: dto.mahallaId ?? null,
        title: dto.title.trim(),
        body: dto.body.trim(),
        priority: dto.priority,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
        authorId: scope.userId,
        assigneeId: dto.assigneeId ?? null,
        sourceMeta: { channel: "panel" },
      },
      select: { id: true, publicNo: true },
    });

    await this.audit.record({
      userId: scope.userId,
      action: "issue.create",
      entity: "Issue",
      entityId: issue.id,
      meta: { publicNo: issue.publicNo },
    });

    return issue;
  }

  // ═══════════════════════════════════════════════════════════════
  //  O'QISH
  // ═══════════════════════════════════════════════════════════════

  async list(scope: ScopeContext, query: ListIssuesQuery): Promise<Paginated<unknown>> {
    const where = {
      // ⚠️ `includeUnassigned`: hududi qo'yilmagan muammo (botdan
      // kelgani) ko'rinishi kerak — aks holda u jim turib qolardi.
      ...mahallaScopeWhere(scope, { includeUnassigned: isProvinceWide(scope) }),
      ...(query.status ? { status: query.status } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.source ? { source: query.source } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.mahallaId ? { mahallaId: query.mahallaId } : {}),
      ...(query.assigneeId ? { assigneeId: query.assigneeId } : {}),
      // ⚠️ `overdue` — MUDDATI O'TGAN VA HALI YOPILMAGAN. Yopilgan
      // muammoning muddati o'tgani ahamiyatsiz: u allaqachon hal
      // qilingan.
      ...(query.overdue
        ? { dueAt: { lt: new Date() }, status: { notIn: CLOSED_STATUSES } }
        : {}),
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
          author: { select: { id: true, firstName: true, lastName: true } },
          citizen: { select: { id: true, firstName: true, lastName: true } },
          _count: { select: { comments: true } },
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
      createdAt: issue.createdAt,
      resolvedAt: issue.reviewedAt,
    }));

    return paginate(items, total, query);
  }

  async findOne(id: string, scope: ScopeContext) {
    const issue = await this.prisma.issue.findUnique({
      where: { id },
      include: {
        category: { select: { id: true, name: true, color: true } },
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
        author: { select: { id: true, firstName: true, lastName: true } },
        // ⚠️ MOBIL MUROJAAT MUALLIFI — FUQARO (`citizenId`), xodim emas.
        // Panel uni "Yuborgan" sifatida ko'rsatadi.
        citizen: {
          select: { id: true, firstName: true, lastName: true, username: true, phone: true, telegramId: true },
        },
        reviewer: { select: { id: true, firstName: true, lastName: true } },
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

    this.assertScope(scope, issue.mahalla?.district.id ?? null, issue.mahallaId);

    return issue;
  }

  async getStats(scope: ScopeContext) {
    const scopeWhere = mahallaScopeWhere(scope, {
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
        select: { id: true, isActive: true, isArchived: true },
      });
      if (!assignee) throw new NotFoundException("Xodim topilmadi");

      // ⚠️ ARXIVLANGAN XODIMGA TOPSHIRILMAYDI: u panelga kira olmaydi
      // va muammo jimgina hech kim ko'rmaydigan joyda qolib ketardi.
      if (assignee.isArchived || !assignee.isActive) {
        throw new BadRequestException("Bu xodim faol emas");
      }
    }

    const updated = await this.prisma.issue.update({
      where: { id },
      data: {
        assigneeId: dto.assigneeId ?? null,
        dueAt: dto.dueAt !== undefined ? (dto.dueAt ? new Date(dto.dueAt) : null) : undefined,
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

    return updated;
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

    const comment = await this.prisma.issueComment.create({
      data: {
        issueId: id,
        userId: scope.userId,
        body: dto.body.trim(),
        isPublic: dto.isPublic ?? false,
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

    this.assertScope(scope, issue.mahalla?.districtId ?? null, issue.mahallaId);

    return issue;
  }

  /**
   * JAVOB QAYSI CHATGA KETADI.
   *
   * ⚠️ `authorChatId` (bot) YOKI `citizen.telegramId` (mobil) — IKKISI
   * HECH QACHON BIRGA to'lmaydi. Signaldan kelganda ikkisi ham null:
   * javob MFY guruhiga ketmaydi (bot kuzatuvchi).
   */
  private replyChatId(issue: {
    authorChatId: string | null;
    citizen: { telegramId: string } | null;
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
  ): void {
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
