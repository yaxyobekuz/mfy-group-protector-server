import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";

export class CreateDistrictDto {
  @IsString()
  @Length(2, 50, { message: "code 2-50 belgi" })
  code!: string;

  @IsString()
  @Length(2, 120, { message: "name 2-120 belgi" })
  name!: string;

  /**
   * TUMAN AHOLISI — NISBIY KO'RSATKICH UCHUN.
   *
   * ⚠️ MFY LAR YIG'INDISI YETARLI EMAS va shuning uchun bu ustun
   * ALOHIDA: MFY larning bir qismida aholi soni to'ldirilmagan
   * bo'lishi mumkin va o'shanda yig'indi tumanning HAQIQIY
   * aholisidan kam chiqadi. "1000 kishiga" ko'rsatkichi esa
   * sun'iy ravishda KATTA bo'lib, tuman eng yomon ko'rinardi.
   *
   * ⚠️ TO'LDIRILGAN BO'LSA U USTUN (`reports.service.ts#byTerritory`):
   * rasmiy statistika yig'indidan aniqroq.
   *
   * ⚠️ YUQORI CHEGARA — 10 MLN: viloyat aholisi ~3 mln va undan
   * katta son aniq xato (masalan respublika aholisi kiritilgan).
   */
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(10_000_000) population?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateDistrictDto {
  @IsOptional() @IsString() @Length(2, 50) code?: string;
  @IsOptional() @IsString() @Length(2, 120) name?: string;
  /** ⚠️ `CreateDistrictDto.population` izohi — ayni sabab. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(10_000_000) population?: number;
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

/**
 * MFY GEOMETRIYASINI IMPORT QILISH.
 *
 * ── NIMA UCHUN ALOHIDA ENDPOINT ───────────────────────────
 *
 * ⚠️ CHEGARALAR QO'LDA KIRITILMAYDI: bitta MFY poligoni yuzlab
 * koordinatadan iborat va uni panelda yozib bo'lmaydi. Ular RASMIY
 * MANBADAN (kadastr, OSM eksporti) GeoJSON fayl sifatida keladi.
 *
 * ⚠️ MFY NOM BO'YICHA TOPILADI, id bo'yicha emas: tashqi manbada
 * bizning id'larimiz yo'q. Tuman nomi ham beriladi, chunki viloyatda
 * BIR XIL NOMLI MFY lar bor — usiz import tasodifiy MFY ga tushardi.
 *
 * ⚠️ TOPILMAGANLARI JIM TASHLANMAYDI, SANAB QAYTARILADI: import
 * "muvaffaqiyatli" deb tugab, aslida yarmi tushmay qolishi mumkin va
 * buni xaritada sezish juda qiyin.
 */
export class ImportMahallaGeoDto {
  @IsArray()
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => MahallaGeoItemDto)
  items!: MahallaGeoItemDto[];
}

export class MahallaGeoItemDto {
  @IsString() @Length(2, 160) name!: string;

  /** ⚠️ Bir xil nomli MFY lar uchun MAJBURIY ajratuvchi. */
  @IsString() @Length(2, 160) districtName!: string;

  /**
   * GeoJSON geometriyasi (`Polygon` yoki `MultiPolygon`).
   *
   * ⚠️ `Feature` EMAS, GEOMETRIYANING O'ZI: xarita uni
   * to'g'ridan-to'g'ri chizadi va o'rash qatlami qo'shilsa, import
   * qilgan odam qaysi shaklni berishni bilmasdi.
   */
  @IsObject() geoJson!: Record<string, unknown>;

  /** Yorliq markazi — chegara bo'lmasa doira shu yerda chiziladi. */
  @IsOptional() @Type(() => Number) @IsLatitude() lat?: number;
  @IsOptional() @Type(() => Number) @IsLongitude() lng?: number;
}

/**
 * TUMAN CHEGARALARINI IMPORT QILISH.
 *
 * ⚠️ MFY NIKI BILAN AYNI SHAKL, LEKIN `districtName` SIZ: tuman
 * nomi viloyatda YAGONA, ya'ni ajratuvchi kerak emas. MFY da u
 * majburiy edi, chunki har tumanda "Turon", "Birlik" bor.
 *
 * ⚠️ ALOHIDA DTO, MFY NIKINI QAYTA ISHLATISH EMAS: `districtName`
 * ni ixtiyoriy qilib, ikkisini bitta shaklga tiqish "qaysi maydon
 * qachon kerak" degan savolni har chaqiruvda tug'dirardi.
 */
export class ImportDistrictGeoDto {
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => DistrictGeoItemDto)
  items!: DistrictGeoItemDto[];
}

export class DistrictGeoItemDto {
  @IsString() @Length(2, 160) name!: string;

  /** ⚠️ `Feature` EMAS, GEOMETRIYANING O'ZI — MFY dagi ayni qoida. */
  @IsObject() geoJson!: Record<string, unknown>;
}

/**
 * VILOYAT CHEGARASI — BITTA GEOMETRIYA.
 *
 * ⚠️ RO'YXAT EMAS: tizim bitta viloyat uchun ishlaydi va chegara
 * `Settings` da saqlanadi (`schema.prisma` izohi).
 */
export class SetProvinceGeoDto {
  @IsObject() geoJson!: Record<string, unknown>;
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
