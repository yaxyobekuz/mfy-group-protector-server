import { Transform } from "class-transformer";
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from "class-validator";

import { PaginationQuery } from "../../../common/dto/pagination.dto";
import {
  IssuePriority,
  SignalKind,
  SignalSeverity,
  SignalStatus,
} from "@prisma/client";

export class ListSignalsQuery extends PaginationQuery {
  /**
   * ⚠️ BERILMASA `new` — service'dagi standart. E'tiborsiz
   * qoldirilganlar o'chirilmaydi (AI xatosini ko'rish uchun), lekin
   * ular ishga xalaqit bermasligi kerak.
   */
  @IsOptional() @IsEnum(SignalStatus) status?: SignalStatus;
  @IsOptional() @IsEnum(SignalKind) kind?: SignalKind;
  @IsOptional() @IsEnum(SignalSeverity) severity?: SignalSeverity;
  @IsOptional() @IsString() chatId?: string;
  /** ⚠️ Xaritadan o'tish uchun — tuman kesimi (MFY orqali). */
  @IsOptional() @IsString() districtId?: string;
  @IsOptional() @IsString() mahallaId?: string;
  @IsOptional() @IsString() @MaxLength(120) search?: string;
}

export class AttachSignalDto {
  @IsString() categoryId!: string;

  /**
   * ⚠️ MAJBURIY EMAS: berilmasa signal matnining BIRINCHI GAPIDAN
   * yasaladi (`signals.service.ts#deriveTitle`). AI'dan sarlavha
   * so'rash pul sarflaydi va natija "Suv ta'minoti bo'yicha
   * murojaat" kabi rasmiy o'ramga aylanadi.
   */
  @IsOptional() @IsString() @Length(3, 200) title?: string;

  @IsOptional() @IsEnum(IssuePriority) priority?: IssuePriority;
}

export class DismissSignalDto {
  /**
   * ⚠️ MAJBURIY EMAS, lekin TAVSIYA ETILADI: aynan bu matnlardan
   * "AI nimani noto'g'ri topdi" degan savolga javob chiqadi va
   * prompt shunga qarab tuzatiladi.
   */
  @IsOptional() @IsString() @MaxLength(400) reason?: string;
}
