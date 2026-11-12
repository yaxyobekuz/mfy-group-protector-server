import { Transform, Type } from "class-transformer";
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
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

/**
 * ⚠️ `BroadcastDto` OLIB TASHLANDI — o'rnida
 * `modules/broadcasts/dto/broadcasts.dto.ts`. Tarqatma endi fuqarolar
 * bo'limining ishi emas: u guruhlarga ham boradi va botdan uzatilgan
 * xabarni ham yuboradi.
 */

/**
 * REYTING SO'ROVI (panel).
 *
 * ⚠️ `limit` SAHIFALASHDAN EMAS: reyting — TOP ro'yxat, "keyingi
 * sahifa" tugmasi unda ma'nosiz (401-o'rindagi fuqaroni hech kim
 * qidirmaydi). Shuning uchun `PaginationQuery` MEROS OLINMAYDI va
 * javob `Paginated` emas — oddiy ro'yxat.
 */
export const RATING_MAX_LIMIT = 200;

export class RatingQuery {
  /** Berilsa — faqat shu tuman fuqarolari (qamrov BILAN birga). */
  @IsOptional() @IsString() districtId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(3)
  @Max(RATING_MAX_LIMIT)
  limit: number = 50;
}
