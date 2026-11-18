import { Transform } from "class-transformer";
import {
  IsBoolean,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from "class-validator";

import { PHONE_MAX } from "../../../common/phone";

const toBool = () =>
  Transform(({ value }) =>
    value === undefined ? undefined : value === "true" || value === true,
  );

export class ListOrganizationsQuery {
  @IsOptional() @IsString() districtId?: string;
  @IsOptional() @IsString() @MaxLength(160) search?: string;
  /** ⚠️ Arxivlanganlar STANDART HOLDA ko'rsatilmaydi (xodimlar ro'yxati bilan ayni). */
  @IsOptional() @toBool() @IsBoolean() includeArchived?: boolean;
}

export class CreateOrganizationDto {
  @IsString() @Length(2, 200) name!: string;
  @IsOptional() @IsString() @MaxLength(80) shortName?: string;

  /**
   * ⚠️ BERILMASA — VILOYAT DARAJASIDAGI tashkilot. Majburiy
   * qilinsa, "Andijon viloyat gaz ta'minoti" ni kiritish uchun
   * tasodifiy tuman tanlash kerak bo'lardi va u hisobotda o'sha
   * tumanning tashkiloti bo'lib ko'rinardi.
   */
  @IsOptional() @IsString() districtId?: string;

  @IsOptional() @IsString() @MaxLength(PHONE_MAX) phone?: string;
  @IsOptional() @IsString() @MaxLength(300) address?: string;
}

export class UpdateOrganizationDto {
  @IsOptional() @IsString() @Length(2, 200) name?: string;
  @IsOptional() @IsString() @MaxLength(80) shortName?: string;
  @IsOptional() @IsString() districtId?: string;
  @IsOptional() @IsString() @MaxLength(PHONE_MAX) phone?: string;
  @IsOptional() @IsString() @MaxLength(300) address?: string;
  @IsOptional() @toBool() @IsBoolean() isActive?: boolean;
}

export class ArchiveOrganizationDto {
  @toBool() @IsBoolean() archived!: boolean;
}

/**
 * YO'NALTIRISH QOIDASI.
 *
 * ⚠️ `districtId` BERILMASA — VILOYAT ZAXIRASI (barcha tumanlar
 * uchun). Bu "bo'sh qoldirildi" emas, ATAYIN tanlanadigan qiymat va
 * panelda alohida qator bo'lib ko'rinadi.
 */
export class SaveOrgRouteDto {
  @IsString() organizationId!: string;
  @IsString() categoryId!: string;
  @IsOptional() @IsString() districtId?: string;
}

export class ListOrgRoutesQuery {
  @IsOptional() @IsString() districtId?: string;
  @IsOptional() @IsString() organizationId?: string;
}

/**
 * TASHKILOT HISOBI — TAYYOR LOGIN-PAROL.
 *
 * ⚠️ PAROL MIJOZDAN KELMAYDI, SERVER YASAYDI. Admin parol o'ylab
 * topsa, yuzlab tashkilotga "123456" kabi parollar tarqalardi — va
 * ularning ro'yxati bir joyda yotardi. Server `randomBytes` dan
 * yasaydi va javobda BIR MARTA qaytaradi.
 */
export class CreateOrgLoginDto {
  @IsString() @Length(2, 60) firstName!: string;
  @IsString() @Length(2, 60) lastName!: string;
  @IsOptional() @IsString() @MaxLength(PHONE_MAX) phone?: string;

  /**
   * ⚠️ IXTIYORIY: berilmasa tashkilot nomidan yasaladi. Berilsa ham
   * BAND bo'lmagani tekshiriladi — `username` butun tizim bo'ylab
   * yagona (`User.username @unique`).
   */
  @IsOptional() @IsString() @Length(3, 60) username?: string;
}
