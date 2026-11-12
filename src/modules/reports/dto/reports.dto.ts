import { Type } from "class-transformer";
import {
  IsEnum,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import { IssueStatus } from "@prisma/client";

export class ReportQuery {
  /** ISO sana ("2026-01-01"). Berilmasa — butun tarix. */
  @IsOptional() @IsISO8601() from?: string;
  @IsOptional() @IsISO8601() to?: string;

  @IsOptional() @IsString() districtId?: string;
  @IsOptional() @IsString() mahallaId?: string;
  @IsOptional() @IsString() categoryId?: string;

  /** Faqat xarita kesimida ishlatiladi. */
  @IsOptional() @IsEnum(IssueStatus) status?: IssueStatus;
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

/**
 * HISOBOT YORDAMCHISIGA SAVOL.
 *
 * ⚠️ `ReportQuery` NI MEROS QILIB OLADI va bu ataylab: yordamchi
 * EKRANDAGI kesimga javob berishi kerak. Filtr berilmasa, xodim
 * "Yanvar oyida nima bo'ldi" deb so'rab, butun tarix bo'yicha javob
 * olardi — va buni sezmasdi, chunki javob matn bo'lib chiqadi.
 */
export class AssistantBody extends ReportQuery {
  /**
   * ⚠️ UZUNLIK CHEGARASI: savol promptga qo'shiladi va cheksiz matn
   * modelning o'z chegarasini to'ldirib, raqamlarni SIQIB chiqarardi
   * — javob esa baribir kelardi, faqat ma'nosiz bo'lardi.
   */
  @IsString() @MinLength(3) @MaxLength(500) question!: string;
}
