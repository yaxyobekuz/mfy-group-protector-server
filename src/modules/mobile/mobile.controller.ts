/**
 * MINI APP CONTROLLER — `/api/mobile/*`.
 *
 * ⚠️ KIRISHDAN TASHQARI HAMMA ENDPOINT `@CitizenOnly()`: ular
 * `request.citizen` ni talab qiladi va `@RequirePermissions` ni EMAS.
 * Tasodifan ruxsat qo'yilsa, `PermissionsGuard` `request.user` ni
 * topolmay darhol 403 beradi — jim o'tib ketmaydi (`decorators` izohi).
 *
 * ⚠️ `auth/*` — `@Public()`: token hali yo'q. Ichida `initData` imzosi
 * yoki dev tekshiruvi ishlaydi.
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Throttle } from "@nestjs/throttler";

import {
  CitizenOnly,
  ClientIp,
  CurrentCitizen,
  Public,
  type RequestCitizen,
} from "../../common/decorators";
import { THROTTLE } from "../../common/throttle";
import { MAX_FILE_SIZE } from "../uploads/uploads.constants";
import { MobileAuthService } from "./mobile-auth.service";
import { MobileService } from "./mobile.service";
import {
  AddAppealCommentDto,
  AnalyzeDto,
  AppealListQuery,
  AppleAuthDto,
  CreateAppealDto,
  DevAuthDto,
  GoogleAuthDto,
  MapQuery,
  NewsQuery,
  RatingQuery,
  TelegramAuthDto,
  UpdateProfileDto,
} from "./dto/mobile.dto";

@Controller("mobile")
export class MobileController {
  constructor(
    private readonly mobile: MobileService,
    private readonly auth: MobileAuthService,
  ) {}

  // ── KIRISH ────────────────────────────────────────────────────────
  /**
   * ⚠️ KIRISH CHEGARASI (`THROTTLE.AUTH`) — IP bo'yicha, daqiqada 10.
   * Token hali yo'q, ya'ni sanash FAQAT IP bo'yicha bo'lishi mumkin
   * (`throttler.guard.ts`) — va himoya qilinadigan narsa ham aynan
   * "token olishga urinish". Qiymat `common/throttle.ts` da.
   */
  @Public()
  @Throttle({ [THROTTLE.AUTH]: {} })
  @Post("auth/telegram")
  @HttpCode(200)
  authTelegram(@Body() dto: TelegramAuthDto) {
    return this.auth.loginWithInitData(dto.initData);
  }

  /**
   * GOOGLE — MOBIL ILOVA (Flutter) UCHUN.
   *
   * ⚠️ MINI-ILOVA BU YO'LNI ISHLATMAYDI va aksincha ham: mini-ilova
   * `auth/telegram` (yuqorida), mobil ilova faqat shu. Ikkalasi
   * BIR-BIRIGA ZAXIRA EMAS — har ilova o'z muhitida mavjud bo'lgan
   * yagona kirish yo'liga ega.
   */
  @Public()
  @Throttle({ [THROTTLE.AUTH]: {} })
  @Post("auth/google")
  @HttpCode(200)
  authGoogle(@Body() dto: GoogleAuthDto) {
    return this.auth.loginWithGoogle(dto.idToken);
  }

  /**
   * APPLE — MOBIL ILOVA (Flutter), FAQAT iOS.
   *
   * ⚠️ APP STORE QOIDASI 4.8 UCHUN: iOS'da Google yonida maxfiylikni
   * himoya qiluvchi muqobil kirish shart. Android ishlatmaydi. Google
   * (`auth/google`) bilan ayni ro'yxatda — har ilova o'z muhitida
   * mavjud kirish yo'liga ega, ikkisi bir-biriga zaxira emas.
   */
  @Public()
  @Throttle({ [THROTTLE.AUTH]: {} })
  @Post("auth/apple")
  @HttpCode(200)
  authApple(@Body() dto: AppleAuthDto) {
    // ⚠️ `authorizationCode` IXTIYORIY: eski ilova versiyasi uni
    // yubormaydi va kirish BARIBIR ishlaydi — faqat hisob
    // o'chirilganda Apple ruxsati bekor qilinmay qoladi
    // (`apple-token.service.ts`).
    return this.auth.loginWithApple(dto.identityToken, dto.authorizationCode);
  }

  @Public()
  @Throttle({ [THROTTLE.AUTH]: {} })
  @Post("auth/dev")
  @HttpCode(200)
  authDev(@Body() dto: DevAuthDto) {
    return this.auth.devLogin(dto.telegramId, dto.firstName);
  }

  // ── PROFIL ──────────────────────────────────────────────────────────
  @CitizenOnly()
  @Get("me")
  me(@CurrentCitizen() citizen: RequestCitizen) {
    return this.mobile.getProfile(citizen.id);
  }

  @CitizenOnly()
  @Patch("me")
  updateMe(@CurrentCitizen() citizen: RequestCitizen, @Body() dto: UpdateProfileDto) {
    return this.mobile.updateProfile(citizen.id, dto);
  }

  /**
   * HISOBNI O'CHIRISH — FUQARONING O'ZI.
   *
   * ⚠️ DO'KON TALABI (App Store 5.1.1(v), Google Play): ilova ichida
   * hisob yaratilsa, ilova ICHIDA uni o'chirish yo'li ham bo'lishi
   * SHART — usiz ilova RAD ETILADI.
   *
   * ⚠️ `204` (bo'sh javob): o'chirilgandan keyin qaytaradigan profil
   * YO'Q. `200` + `{ok:true}` bo'lsa, ilova javobni profil deb o'qib
   * urinishi mumkin edi.
   *
   * ⚠️ FUQARO FAQAT O'ZINI O'CHIRADI: id SO'ROVDAN OLINMAYDI, tokendan
   * (`@CurrentCitizen`). `DELETE /mobile/:id` shaklida bo'lsa, boshqa
   * fuqaroning id'sini yuborib ko'rish yo'li paydo bo'lardi.
   *
   * ⚠️ TASDIQ ILOVADA SO'RALADI (`profile_screen.dart`), serverda
   * emas: "rostdanmi?" degan savolni API darajasida qo'yish
   * (`?confirm=true`) hech narsadan himoya qilmaydi — tugmani bosgan
   * odam parametrni ham yuboradi.
   */
  @CitizenOnly()
  @Delete("me")
  @HttpCode(204)
  async deleteMe(
    @CurrentCitizen() citizen: RequestCitizen,
    @ClientIp() ip: string | null,
  ): Promise<void> {
    await this.mobile.deleteMe(citizen.id, ip);
  }

  // ── MA'LUMOTNOMALAR ─────────────────────────────────────────────────
  @CitizenOnly()
  @Get("categories")
  categories() {
    return this.mobile.categories();
  }

  @CitizenOnly()
  @Get("territory")
  territory() {
    return this.mobile.territory();
  }

  @CitizenOnly()
  @Get("stats")
  stats() {
    return this.mobile.homeStats();
  }

  // ── MUROJAATLAR ─────────────────────────────────────────────────────
  @CitizenOnly()
  @Get("appeals")
  appeals(@CurrentCitizen() citizen: RequestCitizen, @Query() query: AppealListQuery) {
    return this.mobile.listAppeals(citizen.id, query.status);
  }

  // ⚠️ `map` `:id` DAN OLDIN: aks holda "/appeals/map" `:id="map"`
  // bo'lib o'qilardi.
  @CitizenOnly()
  @Get("appeals/map")
  map(@CurrentCitizen() citizen: RequestCitizen, @Query() query: MapQuery) {
    return this.mobile.mapPoints(citizen.id, query);
  }

  /**
   * ⚠️ AI CHEGARASI (`THROTTLE.AI`) — ENG QATTIQ: chaqiruv endi bepul
   * (o'zimizning shlyuz), lekin shlyuz BIR DONA va uni to'ldirish
   * boshqa fuqarolarni kuttirardi (`throttle.ts` dagi batafsil
   * izoh). Fuqaro bo'yicha sanaladi
   * (`throttler.guard.ts`): NAT ortidagi qo'shnilar bir-birini
   * bloklamasligi uchun.
   */
  @CitizenOnly()
  @Throttle({ [THROTTLE.AI]: {} })
  @Post("appeals/analyze")
  @HttpCode(200)
  analyze(@Body() dto: AnalyzeDto) {
    return this.mobile.analyze(dto);
  }

  @CitizenOnly()
  @Get("appeals/:id")
  appeal(@CurrentCitizen() citizen: RequestCitizen, @Param("id") id: string) {
    return this.mobile.getAppeal(citizen.id, id);
  }

  /**
   * ⚠️ `THROTTLE.APPEAL` — KUNLIK CHEGARA O'RNINI BOSMAYDI
   * (`Settings.mobileDailyLimit`): u "kunda nechta" degan MA'MURIY
   * qoida, bu esa "daqiqada nechta" degan texnik himoya. Ikkisi
   * birga ishlaydi.
   */
  @CitizenOnly()
  @Throttle({ [THROTTLE.APPEAL]: {} })
  @Post("appeals")
  create(@CurrentCitizen() citizen: RequestCitizen, @Body() dto: CreateAppealDto) {
    return this.mobile.create(citizen, dto);
  }

  @CitizenOnly()
  @Post("appeals/:id/comments")
  @HttpCode(200)
  comment(
    @CurrentCitizen() citizen: RequestCitizen,
    @Param("id") id: string,
    @Body() dto: AddAppealCommentDto,
  ) {
    return this.mobile.addComment(citizen.id, id, dto);
  }

  // ── FAYL ────────────────────────────────────────────────────────────
  /**
   * ⚠️ `THROTTLE.UPLOAD` — diskni to'ldirishga qarshi. Hajm chegarasi
   * (`MAX_FILE_SIZE`) BITTA faylni cheklaydi, bu esa SONINI: 25 MB × 
   * cheksiz so'rov baribir diskni yeb qo'yardi.
   */
  @CitizenOnly()
  @Throttle({ [THROTTLE.UPLOAD]: {} })
  @Post("uploads")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: MAX_FILE_SIZE },
    }),
  )
  upload(@UploadedFile() file: Express.Multer.File) {
    return this.mobile.upload(file);
  }

  // ── YANGILIK VA REYTING ─────────────────────────────────────────────
  @CitizenOnly()
  @Get("news")
  news(@CurrentCitizen() citizen: RequestCitizen, @Query() query: NewsQuery) {
    return this.mobile.news(citizen.id, query.limit);
  }

  @CitizenOnly()
  @Post("news/:id/view")
  @HttpCode(200)
  viewNews(@Param("id") id: string) {
    return this.mobile.markNewsViewed(id);
  }

  @CitizenOnly()
  @Get("rating")
  rating(@CurrentCitizen() citizen: RequestCitizen, @Query() query: RatingQuery) {
    return this.mobile.rating(citizen.id, query.scope);
  }
}
