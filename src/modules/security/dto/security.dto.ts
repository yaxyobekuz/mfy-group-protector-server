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

  /**
   * BOTDA O'CHIRISH HUQUQI BORMI — URINISHDAN KEYINGI XULOSA.
   *
   * ⚠️ `undefined` — "BILINMADI" va u `false` dan BOSHQA narsa:
   * huquq so'rovining o'zi xato bergan holatni "huquq yo'q" deb
   * yozish panelda YO'Q muammo haqida ogohlantirish chiqarardi.
   *
   * ⚠️ NIMA UCHUN SHU YERDA: `my_chat_member` hodisasi bot shu kod
   * joylashtirilgandan KEYIN qo'shilgan guruhlarda ishlaydi. Eski
   * guruhlarda huquq haqida birinchi xabar aynan o'chirish urinishi
   * paytida keladi — ya'ni bu yagona manba.
   */
  @IsOptional() @IsBoolean() botCanDelete?: boolean;

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

  /**
   * NOTO'G'RI O'CHIRISHLAR FILTRI.
   *
   * ⚠️ ALOHIDA KESIM: `true` — qoidaning XATOLARI (ularni ko'rib
   * ro'yxatni tuzatish kerak), `false` — tasdiqlangan tahdidlar.
   * Berilmasa — ikkisi birga, chunki kundalik ishda ro'yxat
   * to'liq ko'rinishi kerak.
   */
  @IsOptional() @toBool() @IsBoolean() falsePositive?: boolean;

  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
}

export class SetGuardDto {
  @toBool()
  @IsBoolean({ message: "guardEnabled true yoki false bo'lishi kerak" })
  guardEnabled!: boolean;
}

/**
 * OMMAVIY QALQON — ekrandagi FILTR bo'yicha.
 *
 * ⚠️ FILTR MAYDONLARI GURUHLAR RO'YXATINIKI (`BulkOfficialDto`
 * bilan AYNI shakl): panel bitta ro'yxatni ko'rsatadi va ikki
 * amal o'sha ro'yxat ustida ishlaydi. Shakl boshqacha bo'lsa,
 * "qalqon boshqa guruhlarga tushdi" holati chiqardi.
 *
 * ⚠️ MFY SHARTI BU YERDA YO'Q — qalqon `isOfficial` dan MUSTAQIL
 * (fayl boshidagi doktrina): hududsiz guruhdagi odamni ham
 * virusdan himoya qilish mumkin.
 */
export class BulkGuardDto {
  @toBool()
  @IsBoolean({ message: "guardEnabled true yoki false bo'lishi kerak" })
  guardEnabled!: boolean;

  @IsOptional() @toBool() @IsBoolean() filterIsOfficial?: boolean;
  /** ⚠️ Guruh ro'yxatidagi tuman filtri — `groups.dto.ts` izohi. */
  @IsOptional() @IsString() filterDistrictId?: string;
  @IsOptional() @IsString() filterMahallaId?: string;
  @IsOptional() @toBool() @IsBoolean() filterUnassigned?: boolean;
  @IsOptional() @IsString() @MaxLength(120) filterSearch?: string;
  /** ⚠️ Chat turi filtri — `groups.dto.ts#ListGroupsQuery` izohi. */
  @IsOptional() @IsIn(["group", "channel"]) filterChatType?: "group" | "channel";

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) expectedCount?: number;
}

/**
 * TASHQI TAHDID RO'YXATINI YOQISH/O'CHIRISH.
 *
 * ⚠️ O'CHIRILGAN RO'YXAT YANGILANMAYDI, lekin HOSTLARI QOLADI —
 * qayta yoqilganda qaytadan yuklab o'tirmaslik uchun. Botga esa
 * faqat YOQILGAN ro'yxatlarning hostlari beriladi.
 */
export class SetFeedEnabledDto {
  @IsBoolean() isEnabled!: boolean;
}

/**
 * NOTO'G'RI O'CHIRISHNI TUZATISH — IZOH IXTIYORIY.
 *
 * ⚠️ TANA BO'SH BO'LISHI MUMKIN: tugma bitta bosish bilan
 * ishlashi kerak. Izoh talab qilinsa, xodim oyna ochilishini
 * ko'rib, "keyin qilaman" deb ketardi — va qoida tuzatilmay
 * qolardi.
 */
export class AllowEventDto {
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}
