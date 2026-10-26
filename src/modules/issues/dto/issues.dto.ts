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
  @IsOptional() @IsString() mahallaId?: string;
  @IsOptional() @IsString() assigneeId?: string;
  @IsOptional() @toBool() @IsBoolean() overdue?: boolean;
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
  @IsOptional() @IsString() @MaxLength(16) color?: string;
  @IsOptional() @IsString() @MaxLength(400) description?: string;
  @IsOptional() @IsString() @MaxLength(32) icon?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(2160) slaHours?: number;
  @IsOptional() @IsString() @MaxLength(160) orgName?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) sortOrder?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
