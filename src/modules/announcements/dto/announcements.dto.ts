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

export class ListAnnouncementsQuery extends PaginationQuery {
  @IsOptional() @IsString() districtId?: string;
  @IsOptional() @toBool() @IsBoolean() publishedOnly?: boolean;
  @IsOptional() @IsString() @MaxLength(120) search?: string;
}

export class CreateAnnouncementDto {
  @IsString() @Length(3, 200) title!: string;
  @IsString() @Length(3, 8000) body!: string;
  @IsOptional() @IsString() coverPath?: string;
  @IsOptional() @IsBoolean() isPinned?: boolean;
  /** null/bo'sh — butun viloyat bo'yicha. */
  @IsOptional() @IsString() districtId?: string;
  /** `true` — darhol nashr etiladi. */
  @IsOptional() @IsBoolean() publish?: boolean;
}

export class UpdateAnnouncementDto {
  @IsOptional() @IsString() @Length(3, 200) title?: string;
  @IsOptional() @IsString() @Length(3, 8000) body?: string;
  @IsOptional() @IsString() coverPath?: string;
  @IsOptional() @IsBoolean() isPinned?: boolean;
  @IsOptional() @IsString() districtId?: string;
  /** `true` — nashr etiladi, `false` — qoralamaga qaytariladi. */
  @IsOptional() @IsBoolean() publish?: boolean;
}
