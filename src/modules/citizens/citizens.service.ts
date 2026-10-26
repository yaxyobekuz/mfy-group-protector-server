/**
 * FUQAROLAR — panel tomoni.
 *
 * ⚠️ FUQARO — XODIM EMAS: bu yerda parol, ruxsat, qamrov yo'q. Panel
 * faqat ro'yxatni ko'radi va kerak bo'lsa BLOKLAYDI (sabab bilan).
 *
 * ⚠️ BLOK — QATTIQ CHORA (`citizens.manage`). U fuqaroni butunlay
 * yopadi va shuning uchun operatorга berilmaydi (`security.guard` bilan
 * ayni sabab).
 */

import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { IssueStatus, type Prisma } from "@prisma/client";

import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../common/audit.service";
import { paginate } from "../../common/dto/pagination.dto";
import type { BlockCitizenDto, ListCitizensQuery } from "./dto/citizens.dto";

@Injectable()
export class CitizensService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListCitizensQuery) {
    const where: Prisma.CitizenWhereInput = {
      ...(query.districtId ? { districtId: query.districtId } : {}),
      ...(query.blocked !== undefined ? { isBlocked: query.blocked } : {}),
      ...(query.search
        ? {
            OR: [
              { firstName: { contains: query.search, mode: "insensitive" } },
              { lastName: { contains: query.search, mode: "insensitive" } },
              { username: { contains: query.search, mode: "insensitive" } },
              { phone: { contains: query.search } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.citizen.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: query.skip,
        take: query.limit,
        include: {
          district: { select: { name: true } },
          _count: { select: { issues: true } },
        },
      }),
      this.prisma.citizen.count({ where }),
    ]);

    return paginate(
      items.map((c) => ({
        id: c.id,
        telegramId: c.telegramId,
        name: [c.firstName, c.lastName].filter(Boolean).join(" "),
        username: c.username,
        phone: c.phone,
        photoUrl: c.photoUrl,
        districtName: c.district?.name ?? null,
        points: c.points,
        appeals: c._count.issues,
        isBlocked: c.isBlocked,
        blockReason: c.blockReason,
        createdAt: c.createdAt,
      })),
      total,
      query,
    );
  }

  async findOne(id: string) {
    const citizen = await this.prisma.citizen.findUnique({
      where: { id },
      include: {
        district: { select: { name: true } },
        mahalla: { select: { name: true } },
      },
    });
    if (!citizen) throw new NotFoundException("Fuqaro topilmadi");

    const [total, open, resolved] = await Promise.all([
      this.prisma.issue.count({ where: { citizenId: id } }),
      this.prisma.issue.count({
        where: { citizenId: id, status: { in: [IssueStatus.new, IssueStatus.in_progress] } },
      }),
      this.prisma.issue.count({ where: { citizenId: id, status: IssueStatus.resolved } }),
    ]);

    return {
      id: citizen.id,
      telegramId: citizen.telegramId,
      name: [citizen.firstName, citizen.lastName].filter(Boolean).join(" "),
      username: citizen.username,
      phone: citizen.phone,
      photoUrl: citizen.photoUrl,
      languageCode: citizen.languageCode,
      districtName: citizen.district?.name ?? null,
      mahallaName: citizen.mahalla?.name ?? null,
      points: citizen.points,
      isBlocked: citizen.isBlocked,
      blockReason: citizen.blockReason,
      createdAt: citizen.createdAt,
      stats: { total, open, resolved },
    };
  }

  async setBlocked(id: string, dto: BlockCitizenDto, userId: string) {
    const citizen = await this.prisma.citizen.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!citizen) throw new NotFoundException("Fuqaro topilmadi");

    // ⚠️ BLOKLASHDA SABAB MAJBURIY (DTO ixtiyoriy — bu yerda
    // majburlanadi): fuqaroga ilovada shu sabab ko'rinadi.
    if (dto.blocked && !dto.reason?.trim()) {
      throw new BadRequestException("Bloklash uchun sabab ko'rsating");
    }

    await this.prisma.citizen.update({
      where: { id },
      data: {
        isBlocked: dto.blocked,
        blockReason: dto.blocked ? dto.reason!.trim() : null,
      },
    });

    await this.audit.record({
      userId,
      action: dto.blocked ? "citizen.block" : "citizen.unblock",
      entity: "Citizen",
      entityId: id,
      meta: dto.blocked ? { reason: dto.reason } : undefined,
    });

    return { ok: true };
  }
}
