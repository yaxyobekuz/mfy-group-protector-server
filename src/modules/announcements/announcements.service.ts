/**
 * YANGILIK (E'LON) — panel tomoni.
 *
 * ⚠️ FUQARO TOMONI ALOHIDA (`mobile.service.ts#news`): u faqat NASHR
 * ETILGAN va fuqaro tumaniga mos e'lonlarni ko'radi. Bu yerda esa
 * xodim qoralamani ham ko'radi va tahrirlaydi.
 */

import { Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../common/audit.service";
import { paginate } from "../../common/dto/pagination.dto";
import type {
  CreateAnnouncementDto,
  ListAnnouncementsQuery,
  UpdateAnnouncementDto,
} from "./dto/announcements.dto";

@Injectable()
export class AnnouncementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListAnnouncementsQuery) {
    const where: Prisma.AnnouncementWhereInput = {
      ...(query.districtId ? { districtId: query.districtId } : {}),
      ...(query.publishedOnly ? { publishedAt: { not: null } } : {}),
      ...(query.search
        ? { title: { contains: query.search, mode: "insensitive" } }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.announcement.findMany({
        where,
        orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
        skip: query.skip,
        take: query.limit,
        include: { district: { select: { name: true } } },
      }),
      this.prisma.announcement.count({ where }),
    ]);

    return paginate(
      items.map((a) => ({
        id: a.id,
        title: a.title,
        body: a.body,
        coverUrl: a.coverPath,
        isPinned: a.isPinned,
        districtId: a.districtId,
        districtName: a.district?.name ?? null,
        publishedAt: a.publishedAt,
        viewCount: a.viewCount,
        createdAt: a.createdAt,
      })),
      total,
      query,
    );
  }

  async create(dto: CreateAnnouncementDto, userId: string) {
    const created = await this.prisma.announcement.create({
      data: {
        title: dto.title.trim(),
        body: dto.body.trim(),
        coverPath: dto.coverPath?.trim() || null,
        isPinned: dto.isPinned ?? false,
        districtId: dto.districtId || null,
        publishedAt: dto.publish ? new Date() : null,
        createdBy: userId,
      },
      select: { id: true },
    });

    await this.audit.record({
      userId,
      action: "announcement.create",
      entity: "Announcement",
      entityId: created.id,
      meta: { published: Boolean(dto.publish) },
    });

    return created;
  }

  async update(id: string, dto: UpdateAnnouncementDto, userId: string) {
    const existing = await this.prisma.announcement.findUnique({
      where: { id },
      select: { id: true, publishedAt: true },
    });
    if (!existing) throw new NotFoundException("E'lon topilmadi");

    const updated = await this.prisma.announcement.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.body !== undefined ? { body: dto.body.trim() } : {}),
        ...(dto.coverPath !== undefined ? { coverPath: dto.coverPath.trim() || null } : {}),
        ...(dto.isPinned !== undefined ? { isPinned: dto.isPinned } : {}),
        ...(dto.districtId !== undefined ? { districtId: dto.districtId || null } : {}),
        // ⚠️ NASHR SANASI: `publish=true` birinchi marta nashr qilsa
        // sana QO'YILADI; qayta nashrda eski sana SAQLANADI (ro'yxat
        // tartibi buzilmasin). `publish=false` — qoralamaga qaytaradi.
        ...(dto.publish === true && !existing.publishedAt ? { publishedAt: new Date() } : {}),
        ...(dto.publish === false ? { publishedAt: null } : {}),
      },
      select: { id: true },
    });

    await this.audit.record({
      userId,
      action: "announcement.update",
      entity: "Announcement",
      entityId: id,
    });

    return updated;
  }

  async remove(id: string, userId: string) {
    const existing = await this.prisma.announcement.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException("E'lon topilmadi");

    await this.prisma.announcement.delete({ where: { id } });

    await this.audit.record({
      userId,
      action: "announcement.delete",
      entity: "Announcement",
      entityId: id,
    });

    return { ok: true };
  }
}
