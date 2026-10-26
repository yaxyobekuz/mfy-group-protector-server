/**
 * MINI APP DTO'LARI — chegaralar frontend bilan AYNI.
 *
 * ⚠️ CHEGARALAR `mobile/src/shared/config/limits.ts` BILAN MOS BO'LISHI
 * SHART. Ikkisi ajralsa, ilova qabul qilgan matn serverda rad etilib,
 * fuqaro "yuborildi" deb o'ylab qolardi. HAQIQIY tekshiruv shu yerda —
 * ilovadagi raqamni brauzer konsolidan o'zgartirish bir qatorlik ish.
 */

import { Type } from "class-transformer";
import {
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from "class-validator";

import { IssueStatus } from "@prisma/client";

// ── CHEGARALAR (frontend `limits.ts` bilan ayni) ──────────────────────
export const BODY_MIN = 10;
export const BODY_MAX = 2000;
export const ADDRESS_MAX = 300;

// ═══════════════════════════════════════════════════════════════════
//  KIRISH
// ═══════════════════════════════════════════════════════════════════

export class TelegramAuthDto {
  /** `window.Telegram.WebApp.initData` — imzolangan satr. */
  @IsString() @MaxLength(8192) initData!: string;
}

/**
 * ⚠️ TELEGRAM LOGIN UCHUN DTO YO'Q VA BU ATAYLAB.
 *
 * Imzo (`hash`) Telegram YUBORGAN BARCHA maydonlar ustidan
 * hisoblanadi. Global `ValidationPipe` esa `whitelist: true` +
 * `forbidNonWhitelisted: true` bilan ishlaydi — ya'ni DTO'da
 * e'lon qilinmagan maydonni YO rad etadi, YO olib tashlaydi.
 *
 * Ikkalasi ham imzoni buzardi:
 *   — rad etilsa  → Telegram yangi maydon qo'shgan kuni kirish o'ladi;
 *   — tashlansa   → `data_check_string` to'liq bo'lmay, imzo mos kelmasdi.
 *
 * Shuning uchun u yo'l xom `Record` qabul qiladi va TEKSHIRUV
 * IMZONING O'ZIDA (`verifyOAuthPayload`) — u maydon nomlarini
 * emas, imzoni tekshiradi, ya'ni soxta maydon qo'shib bo'lmaydi.
 */

/** ⚠️ FAQAT DEV: server `NODE_ENV=production` da o'zi rad etadi. */
export class DevAuthDto {
  @IsString() @MaxLength(32) telegramId!: string;
  @IsOptional() @IsString() @MaxLength(64) firstName?: string;
}

// ═══════════════════════════════════════════════════════════════════
//  PROFIL
// ═══════════════════════════════════════════════════════════════════

export class UpdateProfileDto {
  @IsOptional() @IsString() @MaxLength(32) phone?: string;
  @IsOptional() @IsString() districtId?: string;
  @IsOptional() @IsString() mahallaId?: string;
  @IsOptional() @IsString() @MaxLength(8) languageCode?: string;
}

// ═══════════════════════════════════════════════════════════════════
//  MUROJAAT
// ═══════════════════════════════════════════════════════════════════

export class AnalyzeDto {
  @IsString() @Length(BODY_MIN, BODY_MAX) body!: string;
}

export class CreateAppealDto {
  @IsString() categoryId!: string;

  @IsString() @Length(BODY_MIN, BODY_MAX) body!: string;

  @IsOptional() @IsString() districtId?: string;
  @IsOptional() @IsString() mahallaId?: string;

  @IsOptional() @Type(() => Number) @IsLatitude() lat?: number;
  @IsOptional() @Type(() => Number) @IsLongitude() lng?: number;

  @IsOptional() @IsString() @MaxLength(ADDRESS_MAX) address?: string;

  @IsOptional() @IsBoolean() isHazard?: boolean;
  @IsOptional() @IsBoolean() isLongStanding?: boolean;
  @IsOptional() @IsBoolean() isRepeatAppeal?: boolean;

  @IsOptional() @IsISO8601() occurredAt?: string;

  /**
   * ⚠️ IMZOLANGAN HAVOLALAR — fayl yo'li emas. Server ularni
   * `signed-ref` bilan tekshirib, fayl ma'lumotini TIKLAYDI. Mijoz
   * aytgan yo'lga ishonilmaydi.
   */
  @IsOptional() @IsString({ each: true }) attachments?: string[];

  /** AI taklifi imzosi (`analyze` javobidan) — `sourceMeta.ai` ga. */
  @IsOptional() @IsString() analysisToken?: string;
}

export class AddAppealCommentDto {
  @IsString() @Length(2, BODY_MAX) body!: string;
}

export class AppealListQuery {
  @IsOptional() @IsEnum(IssueStatus) status?: IssueStatus;
}

export class MapQuery {
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsEnum(IssueStatus) status?: IssueStatus;
}

export class RatingQuery {
  /** `district` — faqat o'z tumani bo'yicha. */
  @IsOptional() @IsString() scope?: string;
}

export class NewsQuery {
  @IsOptional() @Type(() => Number) limit?: number;
}
