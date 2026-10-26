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
  NotFoundException,
} from "@nestjs/common";
import { IssueSource, IssueStatus, type Prisma } from "@prisma/client";

import { PrismaService } from "../../prisma/prisma.service";
import { POINTS } from "../../common/points";
import { signRef, verifyRef } from "../../common/signed-ref";
import { IssuesService } from "../issues/issues.service";
import { UploadsService } from "../uploads/uploads.service";
import { MobileAiService } from "./ai/mobile-ai.service";
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly issues: IssuesService,
    private readonly uploads: UploadsService,
    private readonly ai: MobileAiService,
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
    };
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

    await this.prisma.citizen.update({
      where: { id: citizenId },
      data: {
        phone: dto.phone?.trim() || null,
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
      },
    });
    return rows;
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
        orgName: issue.category.orgName,
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

  async analyze(dto: AnalyzeDto) {
    const categories = await this.prisma.issueCategory.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        description: true,
        icon: true,
        slaHours: true,
        orgName: true,
      },
    });

    const suggestion = await this.ai.suggest(
      dto.body,
      categories.map((c) => ({ id: c.id, name: c.name, description: c.description })),
    );

    if (!suggestion) {
      // ⚠️ `null` — taklif qulaylik, usiz ham oqim davom etadi.
      return { suggestion: null, token: null };
    }

    const category = categories.find((c) => c.id === suggestion.categoryId);
    if (!category) return { suggestion: null, token: null };

    // ⚠️ IMZOLANADI: murojaat yaratishda mijoz shu tokenni qaytaradi va
    // server undan AI taklifini TIKLAYDI — foizni mijoz o'zgartira
    // olmaydi (soxta dalil bo'lardi).
    const signed: SignedAi = {
      categoryId: suggestion.categoryId,
      confidence: suggestion.confidence,
      priority: suggestion.priority,
      model: this.ai.model,
    };

    return {
      suggestion: {
        categoryId: category.id,
        categoryName: category.name,
        categoryIcon: category.icon,
        confidence: suggestion.confidence,
        priority: suggestion.priority,
        slaHours: category.slaHours,
        orgName: category.orgName,
      },
      token: this.signAi(signed),
    };
  }

  // ─────────────────────────────────────────────────────────────────
  //  YARATISH
  // ─────────────────────────────────────────────────────────────────

  async create(citizen: { id: string }, dto: CreateAppealDto) {
    await this.enforceDailyLimit(citizen.id);

    const category = await this.prisma.issueCategory.findUnique({
      where: { id: dto.categoryId },
      select: { id: true, isActive: true, name: true, slaHours: true, orgName: true },
    });
    if (!category) throw new NotFoundException("Yo'nalish topilmadi");
    if (!category.isActive) throw new BadRequestException("Yo'nalish faol emas");

    // ── MFY hududi (nusxa) ──────────────────────────────────────────
    let mahallaId = dto.mahallaId ?? null;
    if (mahallaId) {
      const mahalla = await this.prisma.mahalla.findUnique({
        where: { id: mahallaId },
        select: { id: true },
      });
      if (!mahalla) mahallaId = null; // noto'g'ri id — jim tashlanadi, murojaat yo'qolmaydi
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
        dueAt: new Date(Date.now() + category.slaHours * 60 * 60 * 1000),
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
      orgName: category.orgName,
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

  async upload(file: { buffer: Buffer; size: number; originalname?: string }) {
    return this.uploads.save(file);
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
      include: { district: { select: { name: true } } },
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
