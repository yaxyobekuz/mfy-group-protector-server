import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";

import {
  BroadcastAudience,
  BroadcastDelivery,
  BroadcastMode,
  BroadcastParseMode,
  BroadcastStatus,
} from "@prisma/client";
import { PaginationQuery } from "../../../common/dto/pagination.dto";

/**
 * INLINE TUGMA.
 *
 * ⚠️ FAQAT HAVOLA: `callback_data` tugmasi bosilganda botga
 * hodisa keladi va uni ishlovchi kod kerak bo'lardi — aks holda
 * tugma bosiladi-yu, hech narsa bo'lmaydi.
 */
export class BroadcastButtonDto {
  @IsString() @Length(1, 48) text!: string;
  @IsString() @MaxLength(512) url!: string;
}

/**
 * ⚠️ UCHTA JOYDA AYNI MAYDONLAR KERAK (panel, bot, sinov), shuning
 * uchun ular bazaviy sinfda: nusxa olinsa, yangi imkoniyat bir
 * joyda qo'shilib, ikkinchisida unutilardi.
 */
export class BroadcastContentDto {
  @IsEnum(BroadcastAudience) audience!: BroadcastAudience;
  @IsEnum(BroadcastMode) mode!: BroadcastMode;

  /** Panel ro'yxatidagi nom — ixtiyoriy. */
  @IsOptional() @IsString() @MaxLength(120) title?: string;

  @IsOptional() @IsString() @Length(3, 4000) message?: string;

  @IsOptional() @IsString() @MaxLength(64) fromChatId?: string;
  @IsOptional() @IsString() @MaxLength(64) sourceMessageId?: string;

  @IsOptional() @IsString() districtId?: string;
  @IsOptional() @IsString() mahallaId?: string;

  /**
   * ⚠️ CHEGARA 1–365: "0 kun" bo'sh auditoriya berardi, juda katta
   * son esa filtrni ma'nosiz qilardi.
   */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(365) activeDays?: number;

  /**
   * ⚠️ `chats` AUDITORIYASI UCHUN. Chegara 500: undan ko'pi
   * odatda "hammaga" degani va u uchun tayyor auditoriya bor.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  chatIds?: string[];

  @IsOptional() @IsEnum(BroadcastParseMode) parseMode?: BroadcastParseMode;

  @IsOptional() @IsBoolean() disablePreview?: boolean;
  @IsOptional() @IsBoolean() silent?: boolean;
  @IsOptional() @IsBoolean() pinMessage?: boolean;

  /**
   * ⚠️ UCHTADAN KO'P TUGMA QO'YILMAYDI: ular bitta ustunda
   * chiziladi va telefonda xabarning o'zidan uzun bo'lib
   * ketardi.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => BroadcastButtonDto)
  buttons?: BroadcastButtonDto[];
}

export class CreateBroadcastDto extends BroadcastContentDto {
  /**
   * ⚠️ ISO SATR, `Date` EMAS: brauzer mahalliy vaqtni yuboradi va
   * `Date` ga aylantirish zonani YO'QOTARDI.
   */
  @IsOptional() @IsISO8601() scheduledAt?: string;
}

export class ListBroadcastsQuery extends PaginationQuery {
  @IsOptional() @IsEnum(BroadcastStatus) status?: BroadcastStatus;
  @IsOptional() @IsEnum(BroadcastAudience) audience?: BroadcastAudience;
}

export class ListRecipientsQuery extends PaginationQuery {
  @IsOptional() @IsEnum(BroadcastDelivery) status?: BroadcastDelivery;
}

export class PreviewBroadcastDto {
  @IsEnum(BroadcastAudience) audience!: BroadcastAudience;
  @IsOptional() @IsString() districtId?: string;
  @IsOptional() @IsString() mahallaId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(365) activeDays?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  chatIds?: string[];
}

// ═══════════════════════════════════════════════════════════════
//  BOTDAN KELADIGANLAR
// ═══════════════════════════════════════════════════════════════

export class BotAdminDto {
  @IsString() @MaxLength(64) telegramId!: string;
}

export class BotAudienceQueryDto extends BotAdminDto {
  @IsEnum(BroadcastAudience) audience!: BroadcastAudience;
  @IsOptional() @IsString() districtId?: string;
  @IsOptional() @IsString() mahallaId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(365) activeDays?: number;
}

export class BotBroadcastDto extends CreateBroadcastDto {
  @IsString() @MaxLength(64) telegramId!: string;
}

export class BotBroadcastListDto extends BotAdminDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(20) limit?: number;
}

/** Botdan tarqatmani to'xtatish. */
export class BotBroadcastIdDto extends BotAdminDto {
  @IsString() @MaxLength(64) broadcastId!: string;
}
