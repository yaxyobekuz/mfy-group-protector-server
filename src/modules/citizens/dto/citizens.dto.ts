import { Transform } from "class-transformer";
import {
  IsBoolean,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from "class-validator";

import { PaginationQuery } from "../../../common/dto/pagination.dto";

const toBool = () =>
  Transform(({ value }) =>
    value === undefined ? undefined : value === "true" || value === true,
  );

export class ListCitizensQuery extends PaginationQuery {
  @IsOptional() @IsString() districtId?: string;
  @IsOptional() @toBool() @IsBoolean() blocked?: boolean;
  @IsOptional() @IsString() @MaxLength(120) search?: string;
}

export class BlockCitizenDto {
  @IsBoolean() blocked!: boolean;

  /**
   * ⚠️ SABAB BLOKLASHDA MAJBURIY — fuqaroga ilovada ko'rsatiladi.
   * Bo'sh qoldirilsa, odam "ilova ishlamayapti" deb o'ylab yurardi.
   * Blokni YECHISHDA sabab kerak emas.
   */
  @IsOptional() @IsString() @Length(3, 300) reason?: string;
}

export class BroadcastDto {
  @IsString() @Length(3, 4000) message!: string;

  /**
   * null/bo'sh — BARCHA fuqarolarga. Berilsa — faqat shu tuman
   * fuqarolariga.
   *
   * ⚠️ KENG QAMROVLI AMAL: xabar fuqarolarning SHAXSIY chatiga boradi.
   * Shuning uchun `citizens.manage` talab qilinadi va audit yoziladi.
   */
  @IsOptional() @IsString() districtId?: string;
}
