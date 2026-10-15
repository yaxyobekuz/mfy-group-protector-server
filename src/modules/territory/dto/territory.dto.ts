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

export class CreateDistrictDto {
  @IsString()
  @Length(2, 50, { message: "code 2-50 belgi" })
  code!: string;

  @IsString()
  @Length(2, 120, { message: "name 2-120 belgi" })
  name!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateDistrictDto {
  @IsOptional() @IsString() @Length(2, 50) code?: string;
  @IsOptional() @IsString() @Length(2, 120) name?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) sortOrder?: number;
}

export class CreateMahallaDto {
  @IsString() districtId!: string;

  @IsString() @Length(2, 50) code!: string;
  @IsString() @Length(2, 160) name!: string;

  @IsOptional() @IsString() @MaxLength(160) chairmanName?: string;
  @IsOptional() @IsString() @MaxLength(32) chairmanPhone?: string;

  /**
   * ⚠️ YUQORI CHEGARA BOR: xato kiritilgan "12000000" (viloyat
   * aholisi) bitta MFY ga tushsa, "1000 aholiga murojaat" kesimi
   * ma'nosiz raqam berardi va xatoni topish qiyin bo'lardi.
   */
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(1_000_000) population?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) sortOrder?: number;
}

export class UpdateMahallaDto {
  @IsOptional() @IsString() districtId?: string;
  @IsOptional() @IsString() @Length(2, 50) code?: string;
  @IsOptional() @IsString() @Length(2, 160) name?: string;
  @IsOptional() @IsString() @MaxLength(160) chairmanName?: string;
  @IsOptional() @IsString() @MaxLength(32) chairmanPhone?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(1_000_000) population?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) sortOrder?: number;
}

export class ArchiveDto {
  @IsBoolean() archived!: boolean;
}

/**
 * ⚠️ `@Transform`: query string'da hamma narsa SATR ("true"/"false").
 * `@IsBoolean` ni to'g'ridan-to'g'ri qo'ysak, `?includeArchived=true`
 * har doim validatsiyada yiqilardi.
 */
export class ListMahallaQuery {
  @IsOptional() @IsString() districtId?: string;
  @IsOptional() @IsString() @MaxLength(120) search?: string;

  @IsOptional()
  @Transform(({ value }) => value === "true" || value === true)
  @IsBoolean()
  includeArchived?: boolean;
}

export class ListDistrictQuery {
  @IsOptional()
  @Transform(({ value }) => value === "true" || value === true)
  @IsBoolean()
  includeArchived?: boolean;
}
