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
import type { CreateCategoryDto, UpdateCategoryDto } from "./dto/issues.dto";

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  /**
   * @param activeOnly Bot va tanlov ro'yxatlari uchun `true`.
   */
  async list(activeOnly = false) {
    const categories = await this.prisma.issueCategory.findMany({
      where: activeOnly ? { isActive: true } : {},
      /**
       * ⚠️ ARALASH RO'YXAT, DARAJALAR AJRATILMAGAN: ota ham, bola
       * ham bitta massivda qaytadi va kim kimning bolasi ekani
       * `parentId` da. Sabab — mijozlar uchta
       * (panel/bot/ilova) va har biri daraxtni O'ZICHA quradi;
       * serverda tayyor daraxt qaytarilsa, tekis ro'yxat kerak
       * bo'lgan joyda (hisobot filtri) uni qayta yoyish kerak
       * bo'lardi.
       */
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { _count: { select: { issues: true, children: true } } },
    });

    return categories.map((category) => ({
      id: category.id,
      name: category.name,
      color: category.color,
      description: category.description,
      /** ⚠️ `null` — bu ASOSIY yo'nalish (daraxt ildizi). */
      parentId: category.parentId,
      /** Kichik yo'nalishlar soni — panel daraxtni shunga qarab chizadi. */
      childCount: category._count.children,
      // ⚠️ ILOVA MAYDONLARI: ilova (`/mobile/categories`) shu uchta
      // maydonni o'qiydi — belgi, javob muddati, mas'ul tashkilot.
      icon: category.icon,
      slaHours: category.slaHours,
      orgName: category.orgName,
      sortOrder: category.sortOrder,
      isActive: category.isActive,
      issueCount: category._count.issues,
    }));
  }

  /**
   * OTA-BOLA ALOQASINI TEKSHIRADI.
   *
   * ⚠️ UCH DARAJA TAQIQLANADI: bola o'zi ham ota bo'la olmaydi.
   * "Kommunal → Suv → Ichimlik suvi → Bosim" hisobotni ham, botdagi
   * tanlovni ham o'qib bo'lmaydigan qilardi — fuqaro to'rt marta
   * tugma bosishi kerak bo'lardi.
   *
   * ⚠️ O'ZINI O'ZIGA OTA QILIB BO'LMAYDI: bu cheksiz tsikl va
   * daraxtni ko'rsatadigan har kod unda qotib qolardi.
   */
  private async assertParent(parentId: string, selfId?: string): Promise<void> {
    if (selfId && parentId === selfId) {
      throw new BadRequestException("Yo'nalish o'ziga biriktirilmaydi");
    }

    const parent = await this.prisma.issueCategory.findUnique({
      where: { id: parentId },
      select: { id: true, parentId: true, isActive: true },
    });
    if (!parent) throw new NotFoundException("Asosiy yo'nalish topilmadi");

    if (parent.parentId) {
      throw new BadRequestException(
        "Kichik yo'nalish ichida yana kichik yo'nalish ochib bo'lmaydi",
      );
    }

    if (!parent.isActive) {
      throw new BadRequestException("Asosiy yo'nalish faol emas");
    }

    /**
     * ⚠️ O'ZINING BOLALARI BORMI — TEKSHIRILADI: ichida kichik
     * yo'nalishlari bor yo'nalishni BOSHQASINING bolasiga
     * aylantirish o'sha bolalarni uchinchi darajaga tushirardi.
     */
    if (selfId) {
      const childCount = await this.prisma.issueCategory.count({
        where: { parentId: selfId },
      });
      if (childCount > 0) {
        throw new BadRequestException(
          "Bu yo'nalish ichida kichik yo'nalishlar bor — avval ularni ko'chiring",
        );
      }
    }
  }

  async create(dto: CreateCategoryDto, userId: string) {
    if (dto.parentId) await this.assertParent(dto.parentId);

    const category = await this.prisma.issueCategory.create({
      data: {
        name: dto.name.trim(),
        parentId: dto.parentId ?? null,
        color: dto.color?.trim() || null,
        description: dto.description?.trim() || null,
        icon: dto.icon?.trim() || null,
        slaHours: dto.slaHours ?? 72,
        orgName: dto.orgName?.trim() || null,
        sortOrder: dto.sortOrder ?? 0,
      },
    });

    return category;
  }

  async update(id: string, dto: UpdateCategoryDto, userId: string) {
    const existing = await this.prisma.issueCategory.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Kategoriya topilmadi");

    if (dto.parentId) await this.assertParent(dto.parentId, id);

    const category = await this.prisma.issueCategory.update({
      where: { id },
      data: {
        // ⚠️ `null` — ASOSIY YO'NALISHGA CHIQARISH, `undefined` —
        // tegilmaydi. Ikkisini aralashtirish kichik yo'nalishni har
        // tahrirlashda ildizga ko'chirib yuborardi.
        ...(dto.parentId !== undefined ? { parentId: dto.parentId || null } : {}),
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.color !== undefined ? { color: dto.color?.trim() || null } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description?.trim() || null }
          : {}),
        ...(dto.icon !== undefined ? { icon: dto.icon?.trim() || null } : {}),
        ...(dto.slaHours !== undefined ? { slaHours: dto.slaHours } : {}),
        ...(dto.orgName !== undefined ? { orgName: dto.orgName?.trim() || null } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
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

    return updated;
  }
}
