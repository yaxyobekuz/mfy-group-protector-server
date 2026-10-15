import { Transform } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from "class-validator";

import { PaginationQuery } from "../../../common/dto/pagination.dto";
import { ScopeKind, UserRole } from "@prisma/client";

export class CreateUserDto {
  /**
   * ⚠️ FAQAT HARF, RAQAM, NUQTA VA PASTKI CHIZIQ. Bo'shliq va
   * maxsus belgi taqiqlangan: login URL'da, log'da va botda
   * ishlatiladi va "ali  valiyev" kabi qiymat har joyda boshqacha
   * normallashardi.
   */
  @IsString()
  @Length(3, 64)
  @Matches(/^[a-z0-9._]+$/, {
    message: "username faqat kichik harf, raqam, nuqta va _ dan iborat bo'lishi kerak",
  })
  username!: string;

  @IsString() @Length(6, 128) password!: string;

  @IsString() @Length(2, 80) firstName!: string;
  @IsString() @Length(2, 80) lastName!: string;
  @IsOptional() @IsString() @MaxLength(32) phone?: string;

  @IsEnum(UserRole) role!: UserRole;

  @IsEnum(ScopeKind) scopeKind!: ScopeKind;

  /** ⚠️ `scopeKind: district` bo'lsa MAJBURIY — service tekshiradi. */
  @IsOptional() @IsString() districtId?: string;

  @IsOptional() @IsArray() @ArrayMaxSize(64) @IsString({ each: true })
  permissions?: string[];

  @IsOptional() @IsString() @MaxLength(64) telegramId?: string;
}

export class UpdateUserDto {
  @IsOptional() @IsString() @Length(2, 80) firstName?: string;
  @IsOptional() @IsString() @Length(2, 80) lastName?: string;
  @IsOptional() @IsString() @MaxLength(32) phone?: string;
  @IsOptional() @IsEnum(UserRole) role?: UserRole;
  @IsOptional() @IsEnum(ScopeKind) scopeKind?: ScopeKind;
  @IsOptional() @IsString() districtId?: string | null;
  @IsOptional() @IsArray() @ArrayMaxSize(64) @IsString({ each: true }) permissions?: string[];
  @IsOptional() @IsString() @MaxLength(64) telegramId?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class ResetPasswordDto {
  @IsString() @Length(6, 128) password!: string;
}

export class ListUsersQuery extends PaginationQuery {
  @IsOptional() @IsEnum(UserRole) role?: UserRole;
  @IsOptional() @IsString() districtId?: string;
  @IsOptional() @IsString() @MaxLength(120) search?: string;

  @IsOptional()
  @Transform(({ value }) => value === "true" || value === true)
  @IsBoolean()
  includeArchived?: boolean;
}

export class ArchiveUserDto {
  @IsBoolean() archived!: boolean;
}
