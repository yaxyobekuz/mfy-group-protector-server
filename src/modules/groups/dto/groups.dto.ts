import { Transform, Type } from "class-transformer";
import {
  IsBoolean,
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
 * ⚠️ `chatId` — SATR, son emas. Telegram supergroup id'lari
 * `-1001234567890` kabi va JSON'da son sifatida kelganda ular
 * `Number.MAX_SAFE_INTEGER` chegarasiga yaqin bo'lib, aniqlik
 * yo'qolishi mumkin. Bot ularni satrga aylantirib yuboradi.
 */
export class MembershipDto {
  @IsString() @MaxLength(64) chatId!: string;
  @IsString() @MaxLength(32) type!: string;
  @IsOptional() @IsString() @MaxLength(256) title?: string;
  @IsOptional() @IsString() @MaxLength(64) username?: string;
  @IsString() @MaxLength(32) status!: string;
  @IsOptional() @IsBoolean() canPostMessages?: boolean;
  @IsOptional() @IsBoolean() canInviteUsers?: boolean;
  @IsOptional() @IsString() @MaxLength(64) addedByTgId?: string;
}

export class TouchGroupDto {
  @IsString() @MaxLength(64) chatId!: string;
  @IsString() @MaxLength(32) type!: string;
  @IsOptional() @IsString() @MaxLength(256) title?: string;
  @IsOptional() @IsString() @MaxLength(64) username?: string;
}

export class CaptureMessageDto {
  @IsString() @MaxLength(64) chatId!: string;
  @IsString() @MaxLength(64) messageId!: string;
  @IsOptional() @IsString() @MaxLength(64) senderTgId?: string;
  @IsOptional() @IsString() @MaxLength(256) senderName?: string;

  /**
   * ⚠️ CHEGARA 4096 — Telegram xabarining eng uzun uzunligi. Service
   * uni 2000 ga kesadi, lekin validatsiya bu yerda ham bor: aks
   * holda cheksiz matn yuborish mumkin bo'lardi va u xotiraga
   * tushgandan KEYIN kesilardi.
   */
  @IsString() @MaxLength(4096) text!: string;

  @IsOptional() @IsString() @MaxLength(4096) replyToText?: string;

  /** Telegram `message.date` — SONIYADA. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) sentAt?: number;
}

// ── PANEL YUBORADIGAN ──────────────────────────────────────────────

export class ListGroupsQuery extends PaginationQuery {
  @IsOptional() @toBool() @IsBoolean() isOfficial?: boolean;
  @IsOptional() @IsString() mahallaId?: string;
  @IsOptional() @toBool() @IsBoolean() unassigned?: boolean;
  @IsOptional() @IsString() @MaxLength(120) search?: string;
}

export class SetOfficialDto {
  @IsBoolean() isOfficial!: boolean;
}

/**
 * ⚠️ `mahallaId: null` — BIRIKTIRISHNI YECHISH. `@IsOptional()`
 * `null` ni ham o'tkazadi va service'da u ataylab farqlanadi:
 * berilmagan (`undefined`) va bo'shatilgan (`null`) bir xil emas.
 */
export class AssignMahallaDto {
  @IsOptional() @IsString() mahallaId?: string | null;
}
