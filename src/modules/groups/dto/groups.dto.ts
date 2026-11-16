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

  /**
   * ⚠️ QALQON AYNAN SHUNGA BOG'LIQ: huquq yo'q bo'lsa bot zararli
   * xabarni o'chira olmaydi va panel buni KO'RSATISHI kerak — aks
   * holda "himoya yoqilgan" deb o'ylab yurilardi.
   */
  @IsOptional() @IsBoolean() canDeleteMessages?: boolean;

  /** A'zolar soni — panelda "obunachilar" sanog'i uchun. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) memberCount?: number;

  @IsOptional() @IsString() @MaxLength(64) addedByTgId?: string;
}

export class TouchGroupDto {
  @IsString() @MaxLength(64) chatId!: string;
  @IsString() @MaxLength(32) type!: string;
  @IsOptional() @IsString() @MaxLength(256) title?: string;
  @IsOptional() @IsString() @MaxLength(64) username?: string;

  /**
   * ⚠️ HAR XABARDA KELMAYDI: bot a'zolar sonini bir necha soatda
   * bir marta o'qiydi (`getChatMemberCount` — alohida Telegram
   * so'rovi). `undefined` — "o'zgarmadi", `0` dan BOSHQA narsa.
   */
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) memberCount?: number;
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
  /** ⚠️ Bir xil nomli MFY lar uchun — `group-filter.util.ts` izohi. */
  @IsOptional() @IsString() districtId?: string;
  @IsOptional() @IsString() mahallaId?: string;
  @IsOptional() @toBool() @IsBoolean() unassigned?: boolean;
  @IsOptional() @IsString() @MaxLength(120) search?: string;

  /**
   * ⚠️ CHAT TURI FILTRI: reyestrda guruh ham, kanal ham turadi va
   * ularga qilinadigan ish boshqa (kanalda qalqon yo'q —
   * `common/chat-type.ts`). Operator ro'yxatni toraytirmasa,
   * ommaviy amal unga tegishli bo'lmagan chatlarni ham qamrab
   * olgandek ko'rinardi.
   */
  @IsOptional() @IsIn(["group", "channel"]) chatType?: "group" | "channel";
}

export class SetOfficialDto {
  @IsBoolean() isOfficial!: boolean;
}

/**
 * OMMAVIY KUZATUV — ekrandagi FILTR bo'yicha.
 *
 * ⚠️ `chatId` RO'YXATI EMAS, FILTR YUBORILADI. Sabab: panelda
 * operator "ekranda ko'rinayotgan hammasi" deb o'ylaydi, lekin
 * ro'yxat sahifalangan — mijoz faqat 50 tasini biladi. Id ro'yxati
 * yuborilsa, "hammasiga yoqdim" degan odam aslida birinchi
 * sahifani yoqqan bo'lardi va buni HECH NARSA ko'rsatmasdi.
 *
 * ⚠️ FILTR SERVERDA QAYTA HAL QILINADI va ustiga qamrov sharti
 * QO'SHILADI (`mahallaScopeWhere`) — ya'ni tuman xodimi filtrni
 * qo'lda yasab ham begona guruhga tega olmaydi.
 *
 * ⚠️ `expectedCount` — TASDIQ. Panel tasdiqlash oynasida raqam
 * ko'rsatadi; o'sha paytdan amalga qadar ro'yxat o'zgargan bo'lsa
 * (yangi guruh qo'shildi), server RAD ETADI. Aks holda odam "12 ta"
 * deb tasdiqlab, 40 tasini yoqib yuborardi.
 */
export class BulkOfficialDto {
  @IsBoolean() isOfficial!: boolean;

  @IsOptional() @toBool() @IsBoolean() filterIsOfficial?: boolean;
  /**
   * ⚠️ TUMAN FILTRI HAM UZATILADI: ommaviy amalning qamrovi —
   * EKRANDAGI filtr natijasi. Bu maydon tushib qolsa, operator
   * bitta tumanni ko'rib turib, amalni BUTUN VILOYATGA
   * bajarardi (`group-filter.util.ts` boshidagi izoh).
   */
  @IsOptional() @IsString() filterDistrictId?: string;
  @IsOptional() @IsString() filterMahallaId?: string;
  @IsOptional() @toBool() @IsBoolean() filterUnassigned?: boolean;
  @IsOptional() @IsString() @MaxLength(120) filterSearch?: string;
  /** ⚠️ Chat turi filtri — `groups.dto.ts#ListGroupsQuery` izohi. */
  @IsOptional() @IsIn(["group", "channel"]) filterChatType?: "group" | "channel";

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) expectedCount?: number;
}

/**
 * ⚠️ `mahallaId: null` — BIRIKTIRISHNI YECHISH. `@IsOptional()`
 * `null` ni ham o'tkazadi va service'da u ataylab farqlanadi:
 * berilmagan (`undefined`) va bo'shatilgan (`null`) bir xil emas.
 */
export class AssignMahallaDto {
  @IsOptional() @IsString() mahallaId?: string | null;
}
