import { Transform, Type } from "class-transformer";
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from "class-validator";

import { PaginationQuery } from "../../../common/dto/pagination.dto";

/** `?flag=true` → `true`. Query string'da hamma narsa satr. */
const toBool = () =>
  Transform(({ value }) =>
    value === undefined ? undefined : value === "true" || value === true,
  );

// ── BOT YUBORADIGAN ────────────────────────────────────────────────

/**
 * Bot aniqlagan tahdid haqida xabar.
 *
 * ⚠️ `kind` VA `action` NI BOT AYTADI, lekin ularni server
 * TEKSHIRADI (`@IsIn`): kalit tarqalgan bo'lsa, ixtiyoriy qiymat
 * bilan jadvalga yozib bo'lmasligi kerak.
 */
export class ReportThreatDto {
  @IsString() @MaxLength(64) chatId!: string;

  @IsOptional() @IsString() @MaxLength(64) messageId?: string;

  @IsIn([
    "apk_file",
    "unknown_file",
    "suspicious_url",
    "shortened_url",
    "masked_url",
    "scam_text",
  ])
  kind!: string;

  @IsIn(["deleted", "detected", "delete_failed"])
  action!: string;

  @IsOptional() @IsString() @MaxLength(64) senderTgId?: string;
  @IsOptional() @IsString() @MaxLength(256) senderName?: string;
  @IsOptional() @IsString() @MaxLength(64) senderUsername?: string;

  @IsOptional() @IsString() @MaxLength(512) fileName?: string;
  @IsOptional() @IsString() @MaxLength(256) fileMime?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) fileSize?: number;
  @IsOptional() @IsString() @MaxLength(128) fileUniqueId?: string;

  @IsOptional() @IsString() @MaxLength(2048) url?: string;
  @IsOptional() @IsString() @MaxLength(256) urlHost?: string;

  @IsString() @MaxLength(128) reason!: string;

  /**
   * ⚠️ XABAR MATNI SAQLANADI: xabar O'CHIRILADI va undan keyin
   * ma'muriyat nima yozilganini ko'ra olmaydi. Chegara server
   * tomonida ham qo'yiladi.
   */
  @IsOptional() @IsString() @MaxLength(4096) messageText?: string;

  @IsOptional() @IsString() @MaxLength(512) errorMessage?: string;

  /** Telegram `message.date` — SONIYADA. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) sentAt?: number;
}

// ── PANEL YUBORADIGAN ──────────────────────────────────────────────

export class ListSecurityQuery extends PaginationQuery {
  @IsOptional() @IsString() chatId?: string;

  @IsOptional()
  @IsIn([
    "apk_file",
    "unknown_file",
    "suspicious_url",
    "shortened_url",
    "masked_url",
    "scam_text",
  ])
  kind?: string;

  @IsOptional()
  @IsIn(["deleted", "detected", "delete_failed"])
  action?: string;

  @IsOptional() @IsString() districtId?: string;
  @IsOptional() @IsString() mahallaId?: string;

  /** Yuboruvchi bo'yicha — "bu odam yana tashladimi". */
  @IsOptional() @IsString() @MaxLength(64) senderTgId?: string;

  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
}

export class SetGuardDto {
  @toBool()
  @IsBoolean({ message: "guardEnabled true yoki false bo'lishi kerak" })
  guardEnabled!: boolean;
}
