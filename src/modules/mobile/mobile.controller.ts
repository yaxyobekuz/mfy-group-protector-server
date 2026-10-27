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

import {
  CitizenOnly,
  CurrentCitizen,
  Public,
  type RequestCitizen,
} from "../../common/decorators";
import { MAX_FILE_SIZE } from "../uploads/uploads.constants";
import { MobileAuthService } from "./mobile-auth.service";
import { MobileService } from "./mobile.service";
import {
  AddAppealCommentDto,
  AnalyzeDto,
  AppealListQuery,
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
  @Public()
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
  @Post("auth/google")
  @HttpCode(200)
  authGoogle(@Body() dto: GoogleAuthDto) {
    return this.auth.loginWithGoogle(dto.idToken);
  }

  @Public()
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

  @CitizenOnly()
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

  @CitizenOnly()
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
  @CitizenOnly()
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
