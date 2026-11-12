import { Transform, Type } from "class-transformer";
import {
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
} from "class-validator";

import { PaginationQuery } from "../../../common/dto/pagination.dto";
import {
  IssuePriority,
  IssueSource,
  IssueStatus,
} from "@prisma/client";

const toBool = () =>
  Transform(({ value }) =>
    value === undefined ? undefined : value === "true" || value === true,
  );

export class CreateIssueDto {
  @IsString() categoryId!: string;

  @IsOptional() @IsString() mahallaId?: string;

  @IsString() @Length(3, 200) title!: string;

  /**
   * ⚠️ CHEGARA 4000: panelda ro'yxat ko'rinishi va botga
   * qaytariladigan javob o'qilishi kerak. Uzun matn kesilmaydi —
   * foydalanuvchiga qayta yozish taklif qilinadi, aks holda u
   * yozganining yarmi jimgina yo'qolardi.
   */
  @IsString() @Length(10, 4000) body!: string;

  @IsOptional() @IsEnum(IssuePriority) priority?: IssuePriority;
  @IsOptional() @IsISO8601() dueAt?: string;
  @IsOptional() @IsString() assigneeId?: string;
}

export class ListIssuesQuery extends PaginationQuery {
  @IsOptional() @IsEnum(IssueStatus) status?: IssueStatus;
  @IsOptional() @IsEnum(IssuePriority) priority?: IssuePriority;
  @IsOptional() @IsEnum(IssueSource) source?: IssueSource;
  @IsOptional() @IsString() categoryId?: string;
  /**
   * ⚠️ MFY EMAS, TUMAN: xaritadan "shu tumandagi murojaatlar" deb
   * o'tilganda kerak. `mahallaId` bilan BIRGA kelsa, aniqrog'i
   * (`mahallaId`) ustun turadi — service'da shunday.
   */
  @IsOptional() @IsString() districtId?: string;
  @IsOptional() @IsString() mahallaId?: string;
  @IsOptional() @IsString() assigneeId?: string;
  @IsOptional() @toBool() @IsBoolean() overdue?: boolean;

  /**
   * SHUBHALI MUROJAATLAR — ALOHIDA FILTR.
   *
   * ⚠️ "Murojaat noto'g'ri qo'shilyapti" degan savolga javob: mazmunsiz
   * matnli yozuvlar RAD ETILMAYDI, lekin ularni bitta ekranda ko'rib
   * chiqish kerak. Filtrisiz ular oddiy murojaatlar orasida yo'qolib,
   * navbatni shishirardi.
   */
  @IsOptional() @toBool() @IsBoolean() suspicious?: boolean;

  /**
   * TAKRORIY MUROJAATLAR.
   *
   * ⚠️ `false` — FAQAT ASOSIYLARI: ommaviy hodisada 20 ta yozuvdan
   * 19 tasi takroriy va ular ro'yxatni to'ldirib, xodimga "20 ta
   * ish bor" degan yolg'on taassurot berardi.
   */
  @IsOptional() @toBool() @IsBoolean() duplicates?: boolean;

  @IsOptional() @IsString() @MaxLength(120) search?: string;
}

/**
 * ⚠️ `assigneeId: null` — IJROCHINI OLIB TASHLASH. `undefined` esa
 * "o'zgartirmaslik": ikkisi BOSHQA narsa va service'da ham shunday
 * farqlanadi.
 */
export class AssignIssueDto {
  @IsOptional() @IsString() assigneeId?: string | null;
  @IsOptional() @IsISO8601() dueAt?: string | null;
}

export class ResolveIssueDto {
  /**
   * ⚠️ MAJBURIY VA KAMIDA 10 BELGI: aynan shu matn BOTDAGI
   * MUALLIFGA javob sifatida ketadi. "ok" deb yopilsa, odam
   * mazmunsiz xabar olardi.
   */
  @IsString() @Length(10, 4000) resolution!: string;

  /** `true` → rad etildi, `false`/berilmagan → hal qilindi. */
  @IsOptional() @IsBoolean() rejected?: boolean;
}

export class AddCommentDto {
  @IsString() @Length(2, 4000) body!: string;

  /** ⚠️ Standart `false`: ichki muhokama tashqariga chiqmasligi kerak. */
  @IsOptional() @IsBoolean() isPublic?: boolean;
}

// ── KATEGORIYALAR ──────────────────────────────────────────────────

export class CreateCategoryDto {
  @IsString() @Length(2, 80) name!: string;

  /**
   * ASOSIY YO'NALISH — KICHIK YO'NALISH UCHUN.
   *
   * ⚠️ IXTIYORIY: berilmasa yozuv ASOSIY yo'nalish bo'ladi.
   * Daraxt ATIGI IKKI DARAJA — tekshiruv
   * `categories.service.ts#assertParent` da (DTO da yozib bo'lmaydi:
   * u bazaga qarashni talab qiladi).
   */
  @IsOptional() @IsString() parentId?: string;

  /** Hex rang ("#2563eb") — panelda ajratish uchun. */
  @IsOptional() @IsString() @MaxLength(16) color?: string;

  @IsOptional() @IsString() @MaxLength(400) description?: string;

  // ── ILOVA MAYDONLARI ──────────────────────────────────────────────
  /** Belgi KALITI (`icons.tsx` / `category-icons.ts`) — SVG emas. */
  @IsOptional() @IsString() @MaxLength(32) icon?: string;
  /** Javob muddati (soat) — ilovada "3 kun" deb ko'rsatiladi. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(2160) slaHours?: number;
  @IsOptional() @IsString() @MaxLength(160) orgName?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) sortOrder?: number;
}

export class UpdateCategoryDto {
  @IsOptional() @IsString() @Length(2, 80) name?: string;

  /**
   * ⚠️ BO'SH SATR — "ASOSIY YO'NALISHGA CHIQAR": `null` ni JSON
   * tanasida yuborish `@IsOptional()` bilan `undefined` dan
   * farqlanmasdi, ya'ni kichik yo'nalishni ildizga ko'chirib
   * bo'lmasdi.
   */
  @IsOptional() @IsString() parentId?: string;
  @IsOptional() @IsString() @MaxLength(16) color?: string;
  @IsOptional() @IsString() @MaxLength(400) description?: string;
  @IsOptional() @IsString() @MaxLength(32) icon?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(2160) slaHours?: number;
  @IsOptional() @IsString() @MaxLength(160) orgName?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) sortOrder?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

// ── IJROCHI QOIDASI (MFY × YO'NALISH → XODIM) ──────────────────────

/**
 * ⚠️ IKKALA FILTR HAM IXTIYORIY, lekin qamrov BARIBIR ishlaydi
 * (`districtScopeWhere`): filtr — qulaylik, himoya emas.
 */
export class ListAssignmentRulesQuery {
  @IsOptional() @IsString() districtId?: string;
  @IsOptional() @IsString() mahallaId?: string;
}

export class SaveAssignmentRuleDto {
  @IsString() mahallaId!: string;
  @IsString() categoryId!: string;

  /** ⚠️ XODIM (`User`), fuqaro EMAS — `schema.prisma` izohi. */
  @IsString() userId!: string;

  /**
   * ⚠️ IXTIYORIY: berilmasa yo'nalishning umumiy SLA'si ishlatiladi.
   * Berilsa — undan USTUN (bir MFY da suv muammosi tezroq hal
   * bo'lishi mumkin).
   */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(2160) slaHours?: number;
}
