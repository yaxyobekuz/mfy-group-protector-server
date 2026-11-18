/**
 * BOT UCHUN FUQARO ENDPOINT'LARI — `/api/bot/citizens/*`.
 *
 * ── NIMA UCHUN ALOHIDA CONTROLLER ─────────────────────────────────────
 *
 * Fuqaro uchinchi yo'l bilan ham murojaat yuborishi mumkin: oddiy
 * Telegram boti orqali (mini-ilova ham, do'kon ilovasi ham shart emas).
 * Oqim esa MINI-ILOVANIKI BILAN AYNI bo'lishi kerak — aks holda bitta
 * tizimda ikki xil murojaat tushunchasi paydo bo'lardi.
 *
 * ⚠️ MANTIQ KO'CHIRILMAYDI: hamma amal `MobileService` ga uzatiladi.
 * Chegara (`mobileDailyLimit`), ball (`points.ts`), SLA, fayl va
 * AI imzosi — HAMMASI o'sha yagona joyda qoladi. Bu yerda faqat
 * KIM so'rayapti degan savolga javob beriladi.
 *
 * ── KIRISH BOSHQACHA, FUQARO AYNI ─────────────────────────────────────
 *
 * ⚠️ BOTDA FUQARO TOKENI YO'Q va bo'lmaydi. `@CitizenOnly()` Mini App
 * tokenini (`MOBILE_JWT_SECRET`) talab qiladi, bot esa `X-Bot-Key`
 * bilan kiradigan ishonchli XIZMAT. Shuning uchun bu yerda
 * `@BotOnly()` turadi va fuqaro `telegramId` BO'YICHA topiladi.
 *
 * ⚠️ `telegramId` — TELEGRAM TASDIQLAGAN qiymat, bot o'ylab topgani
 * emas: u `update.message.from.id` dan keladi. Bot aytgan `citizenId`
 * ga ishonilsa, kalit tarqalgan holatda istalgan fuqaro nomidan
 * murojaat yozish mumkin bo'lardi — shuning uchun id QABUL
 * QILINMAYDI.
 *
 * ⚠️ FUQARO SHU YERDA YARATILADI (upsert): botga yozgan odam
 * tizimda hali yo'q va uni "bog'lanmagansiz" deb qaytarish mini-ilova
 * bilan ziddiyat bo'lardi — u yerda ham fuqaro birinchi kirishda
 * o'zi paydo bo'ladi.
 */

import { Body, Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import { Type } from "class-transformer";
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { IssueStatus } from "@prisma/client";

import { BotOnly } from "../../common/decorators";
import { BotCitizensService } from "./bot-citizens.service";
import { MobileService } from "./mobile.service";
import { AnalyzeDto, CreateAppealDto, UpdateProfileDto } from "./dto/mobile.dto";

/**
 * ⚠️ HAR SO'ROVDA `telegramId` KELADI, sessiya YO'Q: bot stateless
 * xizmat va "kim kirgan" holatini server saqlamaydi. Bu `X-Bot-Key`
 * modeliga mos — token berilsa, uning muddati va bekor qilinishi
 * haqidagi savollar paydo bo'lardi.
 */
class BotCitizenDto {
  @IsString() @MaxLength(64) telegramId!: string;

  /**
   * ⚠️ TELEGRAM PROFILI HAR SO'ROVDA YANGILANADI (mini-ilovadagi
   * `upsertAndIssue` bilan ayni qoida): ism o'zgargan bo'lishi
   * mumkin va panelda eski nom turib qolmasligi kerak.
   */
  @IsOptional() @IsString() @MaxLength(128) firstName?: string;
  @IsOptional() @IsString() @MaxLength(128) lastName?: string;
  @IsOptional() @IsString() @MaxLength(64) username?: string;
  @IsOptional() @IsString() @MaxLength(8) languageCode?: string;
}

class BotCreateAppealDto extends BotCitizenDto {
  @ValidateNested() @Type(() => CreateAppealDto) appeal!: CreateAppealDto;
}

class BotAnalyzeDto extends BotCitizenDto {
  @ValidateNested() @Type(() => AnalyzeDto) analyze!: AnalyzeDto;
}

class BotUpdateProfileDto extends BotCitizenDto {
  @ValidateNested() @Type(() => UpdateProfileDto) profile!: UpdateProfileDto;
}

class BotAppealListDto extends BotCitizenDto {
  @IsOptional() @IsEnum(IssueStatus) status?: IssueStatus;
}

/**
 * ⚠️ ALOHIDA SINF, `BotCitizenDto & { scope?: string }` EMAS:
 * `ValidationPipe` `forbidNonWhitelisted: true` bilan ishlaydi va
 * DTO SINFIDA e'lon qilinmagan maydonni RAD ETADI. TypeScript
 * kesishmasi ish vaqtida mavjud emas — `scope` jim rad etilib,
 * so'rov 400 bilan qaytardi.
 */
class BotRatingDto extends BotCitizenDto {
  @IsOptional() @IsString() @MaxLength(32) scope?: string;
}

class BotNewsDto extends BotCitizenDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}

class BotCommentDto extends BotCitizenDto {
  @IsString() @Length(2, 2000) body!: string;
}

/**
 * ⚠️ FAYL BOTDA BOSHQACHA KELADI: mini-ilova baytlarni `multipart`
 * bilan yuboradi, bot esa Telegram'dagi `file_id` ni biladi. Faylni
 * SERVER yuklab oladi — bot uni o'zi yuklab, qayta yuborsa, bir xil
 * bayt tarmoqdan IKKI marta o'tardi va bot xotirasida 25 MB gacha
 * video turardi.
 */
class BotUploadDto extends BotCitizenDto {
  @IsString() @MaxLength(256) fileId!: string;
}

@Controller("bot/citizens")
export class BotCitizensController {
  constructor(
    private readonly citizens: BotCitizensService,
    private readonly mobile: MobileService,
  ) {}

  // ── KIRISH / PROFIL ───────────────────────────────────────────────

  /**
   * `/start` — fuqaroni topadi yoki YARATADI.
   *
   * ⚠️ "BOG'LANMAGANSIZ" DEGAN HOLAT YO'Q: botga yozgan odam
   * allaqachon Telegram'da tanilgan va undan boshqa hech narsa
   * talab qilinmaydi. Eski xodim oqimida bu holat bor edi va u
   * fuqaroni boshi berk ko'chaga olib borardi.
   */
  @BotOnly()
  @Post("start")
  @HttpCode(200)
  async start(@Body() dto: BotCitizenDto) {
    const citizen = await this.citizens.resolve(dto);
    return this.mobile.getProfile(citizen.id);
  }

  @BotOnly()
  @Post("profile")
  @HttpCode(200)
  async updateProfile(@Body() dto: BotUpdateProfileDto) {
    const citizen = await this.citizens.resolve(dto);
    return this.mobile.updateProfile(citizen.id, dto.profile);
  }

  // ── MA'LUMOTNOMALAR ───────────────────────────────────────────────
  //
  // ⚠️ BULAR FUQAROGA BOG'LIQ EMAS, lekin baribir `@BotOnly()`:
  // ro'yxat ochiq bo'lsa ham, uni tarqatish bizning ishimiz emas.

  @BotOnly()
  @Get("categories")
  categories() {
    return this.mobile.categories();
  }

  @BotOnly()
  @Get("territory")
  territory() {
    return this.mobile.territory();
  }

  // ── MUROJAATLAR ───────────────────────────────────────────────────

  @BotOnly()
  @Post("appeals")
  async create(@Body() dto: BotCreateAppealDto) {
    const citizen = await this.citizens.resolve(dto);

    // ⚠️ `MobileService.create` CHAQIRILADI: chegara, ball, SLA,
    // fayl va AI imzosi SHU YERDA emas, o'sha yagona joyda.
    return this.mobile.create({ id: citizen.id }, dto.appeal);
  }

  @BotOnly()
  @Post("appeals/list")
  @HttpCode(200)
  async list(@Body() dto: BotAppealListDto) {
    const citizen = await this.citizens.resolve(dto);
    return this.mobile.listAppeals(citizen.id, dto.status);
  }

  @BotOnly()
  @Post("appeals/analyze")
  @HttpCode(200)
  async analyze(@Body() dto: BotAnalyzeDto) {
    await this.citizens.resolve(dto);
    return this.mobile.analyze(dto.analyze);
  }

  /**
   * ⚠️ `POST`, `GET` EMAS: `telegramId` tanada keladi va uni URL ga
   * qo'yish Telegram id'sini server loglariga tarqatardi.
   */
  @BotOnly()
  @Post("appeals/:id")
  @HttpCode(200)
  async appeal(@Param("id") id: string, @Body() dto: BotCitizenDto) {
    const citizen = await this.citizens.resolve(dto);
    return this.mobile.getAppeal(citizen.id, id);
  }

  @BotOnly()
  @Post("appeals/:id/comments")
  @HttpCode(200)
  async comment(@Param("id") id: string, @Body() dto: BotCommentDto) {
    const citizen = await this.citizens.resolve(dto);
    return this.mobile.addComment(citizen.id, id, { body: dto.body });
  }

  // ── FAYL ──────────────────────────────────────────────────────────

  /**
   * TELEGRAM'DAGI FAYLNI SERVER YUKLAB OLADI.
   *
   * ⚠️ `file_id` GA ISHONILMAYDI: u faqat Telegram'dan yuklab olish
   * uchun ishlatiladi va natija baribir BAYTDAN tekshiriladi
   * (`uploads.service.ts#detect`). Telegram "bu surat" desa ham,
   * dalil fayl ichida.
   */
  @BotOnly()
  @Post("uploads")
  @HttpCode(200)
  async upload(@Body() dto: BotUploadDto) {
    await this.citizens.resolve(dto);
    return this.citizens.uploadFromTelegram(dto.fileId);
  }

  // ── REYTING / YANGILIK ────────────────────────────────────────────

  @BotOnly()
  @Post("rating")
  @HttpCode(200)
  async rating(@Body() dto: BotRatingDto) {
    const citizen = await this.citizens.resolve(dto);
    return this.mobile.rating(citizen.id, dto.scope);
  }

  @BotOnly()
  @Post("news")
  @HttpCode(200)
  async news(@Body() dto: BotNewsDto) {
    const citizen = await this.citizens.resolve(dto);
    return this.mobile.news(citizen.id, dto.limit);
  }
}
