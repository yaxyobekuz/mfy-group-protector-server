import { Type } from "class-transformer";
import { IsISO8601, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class ReportQuery {
  /** ISO sana ("2026-01-01"). Berilmasa — butun tarix. */
  @IsOptional() @IsISO8601() from?: string;
  @IsOptional() @IsISO8601() to?: string;

  @IsOptional() @IsString() districtId?: string;
  @IsOptional() @IsString() mahallaId?: string;
  @IsOptional() @IsString() categoryId?: string;
}

export class DailyQuery {
  /**
   * ⚠️ YUQORI CHEGARA 90 KUN: dinamika grafigi uzunroq oraliqda
   * o'qilmaydigan bo'lib qoladi, ustiga so'rov butun jadvalni
   * xotiraga tortardi (`reports.service.ts#daily` xotirada
   * guruhlaydi).
   */
  @IsOptional() @Type(() => Number) @IsInt() @Min(7) @Max(90) days: number = 30;
}
