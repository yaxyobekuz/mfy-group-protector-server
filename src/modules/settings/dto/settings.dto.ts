import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from "class-validator";

import { SignalSeverity } from "@prisma/client";

export class UpdateSettingsDto {
  @IsOptional() @IsString() @Length(2, 160) orgName?: string;

  @IsOptional() @IsBoolean() aiEnabled?: boolean;

  /**
   * ⚠️ PASTKI CHEGARA 5 DAQIQA. Undan tez-tez ishlasa, har aylanish
   * ozgina xabar bilan AI'ga borib, so'rov sonini (va hisobni)
   * ko'paytirardi — ustiga model SUHBATNI ko'rmay qolardi: "ha,
   * bizda ham shunday" degan gap oldingi xabarsiz ma'nosiz.
   */
  @IsOptional() @Type(() => Number) @IsInt() @Min(5) @Max(1440)
  aiIntervalMinutes?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(10) @Max(2000)
  aiMaxMessagesPerRun?: number;

  /**
   * ⚠️ PASTKI CHEGARA 1 SOAT: xabarlar darhol o'chirilsa, "signal
   * nimadan chiqdi" degan savolni tekshirib bo'lmasdi.
   */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(720)
  messageRetentionHours?: number;

  /**
   * ⚠️ FAQAT RAQAM VA MINUS: chat id shunday ko'rinadi
   * (`-1001234567890` yoki `123456789`). Tekshirilmasa, kimdir
   * username yozib qo'yib ("@kanal"), xabar jimgina yuborilmay
   * qolardi — Telegram 400 qaytaradi, lekin uni faqat logda
   * ko'rish mumkin.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @Matches(/^-?\d+$/, { each: true, message: "alertChatIds faqat raqamdan iborat bo'lishi kerak" })
  alertChatIds?: string[];

  @IsOptional() @IsEnum(SignalSeverity) alertMinSeverity?: SignalSeverity;

  // ── XAVFSIZLIK QALQONI ───────────────────────────────────────────

  @IsOptional() @IsBoolean() guardDeleteFiles?: boolean;
  @IsOptional() @IsBoolean() guardDeleteUrls?: boolean;

  /**
   * ⚠️ FAQAT DOMEN, HAVOLA EMAS: `https://evil.com/path` yozilsa u
   * hech qachon mos kelmasdi (taqqoslash domen bo'yicha) va
   * ma'muriyat "qo'shdim, lekin ishlamayapti" deb o'ylab qolardi.
   *
   * ⚠️ `ArrayMaxSize`: ro'yxat har xabarda tekshiriladi va uzun
   * ro'yxat botni sekinlashtirardi.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @Matches(/^[a-z0-9.-]+\.[a-z]{2,}$/i, {
    each: true,
    message: "guardBlockedHosts faqat domen bo'lishi kerak (masalan: evil.com)",
  })
  guardBlockedHosts?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @Matches(/^[a-z0-9.-]+\.[a-z]{2,}$/i, {
    each: true,
    message: "guardAllowedHosts faqat domen bo'lishi kerak (masalan: gov.uz)",
  })
  guardAllowedHosts?: string[];
}
