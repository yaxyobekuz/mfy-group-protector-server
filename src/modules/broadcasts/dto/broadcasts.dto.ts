import { Type } from "class-transformer";
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
} from "class-validator";

import { BroadcastAudience, BroadcastMode, BroadcastStatus } from "@prisma/client";
import { PaginationQuery } from "../../../common/dto/pagination.dto";

/**
 * TARQATMA SO'ROVI.
 *
 * ⚠️ `mode` QAYSI MAYDONNI MAJBURIY QILISHINI SERVER TEKSHIRADI
 * (`broadcasts.service.ts#validate`), DTO emas: `class-validator` da
 * "A bo'lsa B majburiy" shartini yozish mumkin, lekin xato matni
 * tushunarsiz chiqadi ("message must be a string") va yuboruvchi nima
 * qilishni bilmasdi.
 */
export class CreateBroadcastDto {
  @IsEnum(BroadcastAudience) audience!: BroadcastAudience;
  @IsEnum(BroadcastMode) mode!: BroadcastMode;

  /** `mode: text` uchun MAJBURIY. */
  @IsOptional() @IsString() @Length(3, 4000) message?: string;

  /**
   * ── FORWARD / COPY MANBASI ────────────────────────────────────────
   *
   * ⚠️ FAQAT BOT YO'LIDAN KELADI: admin xabarni botga tashlaydi va
   * bot `chat.id` + `message_id` ni yuboradi. Paneldan bu qiymatlarni
   * qo'lda kiritib bo'lmaydi — u yerda `mode: text`.
   */
  @IsOptional() @IsString() @MaxLength(64) fromChatId?: string;
  @IsOptional() @IsString() @MaxLength(64) sourceMessageId?: string;

  /**
   * ⚠️ IKKALASI HAM BO'SH — BUTUN VILOYAT. Eng kuchli amal va u
   * `broadcast.send` ruxsatini talab qiladi.
   *
   * ⚠️ `mahallaId` BERILSA `districtId` E'TIBORSIZ QOLDIRILMAYDI,
   * TEKSHIRILADI: ikkisi mos kelmasa so'rov rad etiladi — aks holda
   * panelda "Marhamat tumani" tanlab turib, boshqa tumanning MFY siga
   * yuborib yuborish mumkin bo'lardi.
   */
  @IsOptional() @IsString() districtId?: string;
  @IsOptional() @IsString() mahallaId?: string;
}

export class ListBroadcastsQuery extends PaginationQuery {
  @IsOptional() @IsEnum(BroadcastStatus) status?: BroadcastStatus;
}

// ═══════════════════════════════════════════════════════════════════
//  BOT TOMONI — ADMIN PANELI
// ═══════════════════════════════════════════════════════════════════

/**
 * ⚠️ `telegramId` — TELEGRAM TASDIQLAGAN qiymat (`update.message.from.id`),
 * bot o'ylab topgani emas. Admin SHU BO'YICHA topiladi (`User.telegramId`)
 * va bot aytgan `userId` QABUL QILINMAYDI — `X-Bot-Key` tarqalgan
 * holatda u begona xodim nomidan tarqatma yuborish yo'li bo'lardi
 * (`bot-citizens.controller.ts` dagi ayni qoida).
 */
export class BotAdminDto {
  @IsString() @MaxLength(64) telegramId!: string;
}

export class BotAudienceQueryDto extends BotAdminDto {
  @IsEnum(BroadcastAudience) audience!: BroadcastAudience;
  @IsOptional() @IsString() districtId?: string;
  @IsOptional() @IsString() mahallaId?: string;
}

export class BotBroadcastDto extends BotAdminDto {
  @IsEnum(BroadcastAudience) audience!: BroadcastAudience;
  @IsEnum(BroadcastMode) mode!: BroadcastMode;

  @IsOptional() @IsString() @Length(3, 4000) message?: string;
  @IsOptional() @IsString() @MaxLength(64) fromChatId?: string;
  @IsOptional() @IsString() @MaxLength(64) sourceMessageId?: string;

  @IsOptional() @IsString() districtId?: string;
  @IsOptional() @IsString() mahallaId?: string;
}

export class BotBroadcastListDto extends BotAdminDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(20) limit?: number;
}
