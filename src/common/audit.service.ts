/**
 * AUDIT — kim nima qildi.
 *
 * ⚠️ FAQAT MUHIM AMALLAR yoziladi, har so'rov emas: login, ruxsat
 * o'zgarishi, guruhni rasmiy qilish, signalni biriktirish/yopish,
 * muammo holati. "Hamma narsani yozish" jurnalni o'qib bo'lmaydigan
 * qilardi — va u o'shandan keyin hech kimga kerak bo'lmasdi.
 *
 * ⚠️ YOZISH ASOSIY AMALNI TO'XTATMAYDI. Audit yiqilsa (baza to'la,
 * JSON yaroqsiz) xato LOGGA tushadi, lekin so'rov MUVAFFAQIYATLI
 * tugaydi: "muammo yopildi, lekin audit yozilmadi" holati "muammo
 * umuman yopilmadi" dan yaxshi. Shu sababli bu metod `await`
 * qilinadi-u, xato otmaydi.
 */

import { Injectable, Logger } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service";

export interface AuditInput {
  userId?: string | null;
  /** "auth.login", "group.official", "signal.attach", "issue.resolve" */
  action: string;
  entity?: string | null;
  entityId?: string | null;
  /**
   * Qo'shimcha kontekst (eski/yangi qiymat).
   *
   * ⚠️ TURI ERKIN (`unknown`), Prisma'ning `InputJsonValue` EMAS.
   * Sabab: chaqiruvchilar bu yerga DTO obyektini ("nima
   * o'zgartirildi") uzatadi va DTO klassida indeks imzosi yo'q,
   * ya'ni u `InputJsonObject` ga to'g'ri kelmaydi. Har chaqiruv
   * joyida qo'lda `as` yozish o'nlab joyda takrorlanadigan shovqin
   * bo'lardi — shuning uchun JSON'ga keltirish SHU YERDA, bir
   * marta (`toJson`).
   */
  meta?: unknown;
  ip?: string | null;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(input: AuditInput): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId: input.userId ?? null,
          action: input.action,
          entity: input.entity ?? null,
          entityId: input.entityId ?? null,
          meta: this.toJson(input.meta),
          ip: input.ip ?? null,
        },
      });
    } catch (error) {
      // ⚠️ XATO YUQORIGA CHIQMAYDI — yuqoridagi izoh.
      this.logger.warn(
        `Audit yozilmadi (${input.action}): ${(error as Error).message}`,
      );
    }
  }

  /**
   * Istalgan qiymatni JSON'ga keltiradi.
   *
   * ⚠️ `JSON.parse(JSON.stringify(...))` DAN O'TKAZILADI, oddiy
   * `as` bilan turni majburlab qo'yish emas. Sabab: chaqiruvchilar
   * bu yerga DTO klassi, `Date` va `undefined` maydonlarni
   * uzatadi. `as` bilan o'tkazilsa, Prisma ularni yozishga urinib
   * xato berardi (yoki `Date` ni obyekt sifatida yozib, keyin
   * o'qilmaydigan qiymat qolardi). Bu aylanish `Date` ni ISO
   * satriga, `undefined` ni esa yo'q qiladi — ya'ni aynan JSON
   * ustunida yashashi kerak bo'lgan shaklga.
   *
   * ⚠️ AYLANMA HAVOLA (`circular`) BO'LSA `undefined` qaytadi:
   * `JSON.stringify` xato otadi va audit TO'XTAMASLIGI kerak.
   */
  private toJson(value: unknown): Prisma.InputJsonValue | undefined {
    if (value === null || value === undefined) return undefined;

    try {
      return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
    } catch {
      this.logger.warn("Audit meta JSON'ga aylanmadi — e'tiborsiz qoldirildi");
      return undefined;
    }
  }
}
