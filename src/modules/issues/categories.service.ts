/**
 * MUROJAAT KATEGORIYALARI.
 *
 * ⚠️ O'CHIRISH — YUMSHOQ (`isActive: false`). Qattiq o'chirish
 * imkonsiz: `Issue.categoryId` `onDelete: Restrict` va eski muammolar
 * o'z kategoriyasiga ishora qilib turadi. Yumshoq o'chirilgani botda
 * DARHOL yo'qoladi, lekin tarixda ko'rinib turadi.
 *
 * ⚠️ BOT FAQAT O'QIYDI. Kategoriya botda yaratilmaydi: u sozlama,
 * foydalanuvchi kiritadigan ma'lumot emas.
 */

import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";

import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../common/audit.service";
import type { CreateCategoryDto, UpdateCategoryDto } from "./dto/issues.dto";

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * @param activeOnly Bot va tanlov ro'yxatlari uchun `true`.
   */
  async list(activeOnly = false) {
    const categories = await this.prisma.issueCategory.findMany({
      where: activeOnly ? { isActive: true } : {},
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { _count: { select: { issues: true } } },
    });

    return categories.map((category) => ({
      id: category.id,
      name: category.name,
      color: category.color,
      description: category.description,
      sortOrder: category.sortOrder,
      isActive: category.isActive,
      issueCount: category._count.issues,
    }));
  }

  async create(dto: CreateCategoryDto, userId: string) {
    const category = await this.prisma.issueCategory.create({
      data: {
        name: dto.name.trim(),
        color: dto.color?.trim() || null,
        description: dto.description?.trim() || null,
        sortOrder: dto.sortOrder ?? 0,
      },
    });

    await this.audit.record({
      userId,
      action: "issue_category.create",
      entity: "IssueCategory",
      entityId: category.id,
      meta: { name: category.name },
    });

    return category;
  }

  async update(id: string, dto: UpdateCategoryDto, userId: string) {
    const existing = await this.prisma.issueCategory.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Kategoriya topilmadi");

    const category = await this.prisma.issueCategory.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.color !== undefined ? { color: dto.color?.trim() || null } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description?.trim() || null }
          : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });

    await this.audit.record({
      userId,
      action: "issue_category.update",
      entity: "IssueCategory",
      entityId: id,
      meta: { before: { name: existing.name, isActive: existing.isActive }, after: dto },
    });

    return category;
  }

  /**
   * ⚠️ FAQAT YUMSHOQ O'CHIRISH. Oxirgi FAOL kategoriyani o'chirish
   * BLOKLANADI: kategoriya yo'q bo'lsa botdagi "muammo yuborish"
   * oqimi BOSHLANMAYDI (`categoryId` majburiy) va foydalanuvchi
   * nima uchun ishlamayotganini tushunmasdi.
   */
  async deactivate(id: string, userId: string) {
    const category = await this.prisma.issueCategory.findUnique({ where: { id } });
    if (!category) throw new NotFoundException("Kategoriya topilmadi");

    if (category.isActive) {
      const activeCount = await this.prisma.issueCategory.count({
        where: { isActive: true },
      });

      if (activeCount <= 1) {
        throw new BadRequestException(
          "Bu oxirgi faol kategoriya — o'chirilsa botdan muammo yuborish ishlamaydi",
        );
      }
    }

    const updated = await this.prisma.issueCategory.update({
      where: { id },
      data: { isActive: false },
    });

    await this.audit.record({
      userId,
      action: "issue_category.deactivate",
      entity: "IssueCategory",
      entityId: id,
      meta: { name: category.name },
    });

    return updated;
  }
}
