import { Transform } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsISO8601,
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

  /**
   * FAQAT REJALASHTIRILGANLAR.
   *
   * ⚠️ ALOHIDA FILTR: rejalashtirilgan e'lon qoralama bo'lib
   * turadi va umumiy ro'yxatda oddiy qoralamadan FARQ QILMASDI.
   * Xodim "men ertalabga qo'ygan e'lon qoldimi" degan savolga
   * javob topa olmasdi — va o'sha e'lon chiqmasa ham sezmasdi.
   */
  @IsOptional() @toBool() @IsBoolean() scheduledOnly?: boolean;
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

  /**
   * QO'SHILADIGAN MEDIA — SURAT/VIDEO.
   *
   * ⚠️ `coverPath` DAN ALOHIDA va u O'RNINI BOSMAYDI: muqova —
   * ro'yxatdagi BITTA surat, media esa e'lon ICHIDAGI galereya.
   * Bittasini ikkinchisiga aylantirsak, eski e'lonlarning
   * ro'yxatdagi ko'rinishi buzilardi.
   *
   * ⚠️ SONI CHEKLANGAN (10): e'lon mobil ilovada ochiladi va 30
   * ta surat uni sekin tarmoqda butunlay ochilmaydigan qilardi.
   *
   * ⚠️ IMZOLANGAN TOKENLAR, FAYL YO'LI EMAS (`mobile.dto.ts`
   * dagi `attachments` bilan AYNI shakl): mijoz aytgan yo'lga
   * ishonilsa, u diskdagi istalgan faylni e'longa biriktirib,
   * uni butun aholiga ko'rsata olardi.
   *
   * ⚠️ RO'YXAT ALMASHTIRILMAYDI, QO'SHILADI va bu ataylab:
   * MAVJUD fayllarda token YO'Q (imzo faqat yuklash paytida
   * beriladi va 6 soatdan keyin eskiradi). "To'liq ro'yxat"
   * ma'nosi berilsa, sarlavhani tahrirlagan xodim eski
   * suratlarni ham o'chirib yuborardi — va buni faqat
   * fuqaro ilovada sezardi. O'chirish ALOHIDA va ANIQ
   * (`removeMedia`).
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10, { message: "Eng ko'pi 10 ta fayl" })
  @IsString({ each: true })
  media?: string[];

  /**
   * REJALASHTIRILGAN NASHR VAQTI.
   *
   * ⚠️ `publishedAt` DAN ALOHIDA USTUN va bu ataylab: biri
   * O'TMISH ("qachon chiqdi"), ikkinchisi KELAJAK ("qachon
   * chiqadi"). Bitta ustunga sig'dirilsa, "nashr etilganmi yoki
   * kutayaptimi" degan savolni har so'rovda sana bilan
   * solishtirib hal qilish kerak bo'lardi — va bir joyda bu
   * albatta unutilardi (fuqaroga nashr etilmagan e'lon
   * ko'rinib ketardi).
   *
   * ⚠️ `publish: true` BILAN BIRGA BERILMAYDI (server rad etadi):
   * ikkisi QARAMA-QARSHI buyruq va qaysi biri ustun ekani
   * tushunarsiz bo'lardi.
   */
  @IsOptional() @IsISO8601() scheduledAt?: string;
}

export class UpdateAnnouncementDto {
  @IsOptional() @IsString() @Length(3, 200) title?: string;
  @IsOptional() @IsString() @Length(3, 8000) body?: string;
  @IsOptional() @IsString() coverPath?: string;
  @IsOptional() @IsBoolean() isPinned?: boolean;
  @IsOptional() @IsString() districtId?: string;
  /** `true` — nashr etiladi, `false` — qoralamaga qaytariladi. */
  @IsOptional() @IsBoolean() publish?: boolean;

  /**
   * QO'SHILADIGAN MEDIA — SURAT/VIDEO.
   *
   * ⚠️ `coverPath` DAN ALOHIDA va u O'RNINI BOSMAYDI: muqova —
   * ro'yxatdagi BITTA surat, media esa e'lon ICHIDAGI galereya.
   * Bittasini ikkinchisiga aylantirsak, eski e'lonlarning
   * ro'yxatdagi ko'rinishi buzilardi.
   *
   * ⚠️ SONI CHEKLANGAN (10): e'lon mobil ilovada ochiladi va 30
   * ta surat uni sekin tarmoqda butunlay ochilmaydigan qilardi.
   *
   * ⚠️ IMZOLANGAN TOKENLAR, FAYL YO'LI EMAS (`mobile.dto.ts`
   * dagi `attachments` bilan AYNI shakl): mijoz aytgan yo'lga
   * ishonilsa, u diskdagi istalgan faylni e'longa biriktirib,
   * uni butun aholiga ko'rsata olardi.
   *
   * ⚠️ RO'YXAT ALMASHTIRILMAYDI, QO'SHILADI va bu ataylab:
   * MAVJUD fayllarda token YO'Q (imzo faqat yuklash paytida
   * beriladi va 6 soatdan keyin eskiradi). "To'liq ro'yxat"
   * ma'nosi berilsa, sarlavhani tahrirlagan xodim eski
   * suratlarni ham o'chirib yuborardi — va buni faqat
   * fuqaro ilovada sezardi. O'chirish ALOHIDA va ANIQ
   * (`removeMedia`).
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10, { message: "Eng ko'pi 10 ta fayl" })
  @IsString({ each: true })
  media?: string[];

  /**
   * REJALASHTIRILGAN NASHR VAQTI.
   *
   * ⚠️ `publishedAt` DAN ALOHIDA USTUN va bu ataylab: biri
   * O'TMISH ("qachon chiqdi"), ikkinchisi KELAJAK ("qachon
   * chiqadi"). Bitta ustunga sig'dirilsa, "nashr etilganmi yoki
   * kutayaptimi" degan savolni har so'rovda sana bilan
   * solishtirib hal qilish kerak bo'lardi — va bir joyda bu
   * albatta unutilardi (fuqaroga nashr etilmagan e'lon
   * ko'rinib ketardi).
   *
   * ⚠️ `publish: true` BILAN BIRGA BERILMAYDI (server rad etadi):
   * ikkisi QARAMA-QARSHI buyruq va qaysi biri ustun ekani
   * tushunarsiz bo'lardi.
   */
  @IsOptional() @IsISO8601() scheduledAt?: string;

  /**
   * ⚠️ REJANI BEKOR QILISH — ALOHIDA BAYROQ, `scheduledAt: null`
   * EMAS: DTO da `null` bilan "berilmadi" ni ajratib bo'lmaydi
   * (`updateProfile` dagi tirik xato bilan AYNI sabab) va xodim
   * e'lonning sarlavhasini tahrirlaganda reja jimgina
   * o'chib ketardi.
   */
  @IsOptional() @IsBoolean() cancelSchedule?: boolean;

  /**
   * O'CHIRILADIGAN MEDIA — ID BO'YICHA.
   *
   * {W} ID BILAN, "qolganlari" RO'YXATI BILAN EMAS: xodim bitta
   * suratni o'chirsa, niyati AYNAN O'SHA surat. "Qolganlari"
   * ro'yxati yuborilsa, ikki xodim bir vaqtda tahrirlaganda
   * biri qo'shgan surat ikkinchisining ro'yxatida bo'lmagani
   * uchun jimgina o'chib ketardi.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  removeMedia?: string[];
}
