/**
 * XAVFSIZLIK ENDPOINT'LARI — IKKI AUDITORIYA.
 *
 *   `/bot/security/*`   → bot (`X-Bot-Key`), `@BotOnly()`
 *   `/security/*`       → panel (JWT + ruxsat)
 *
 * ⚠️ IKKI YO'L ATAYLAB AJRATILGAN (`groups.controller.ts` bilan ayni
 * sabab): bitta endpoint'da ikkala autentifikatsiyani qabul qilish
 * "bu so'rovni kim yubordi" degan savolni har handler ichida qayta
 * hal qilishga majbur qilardi.
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
} from "@nestjs/common";

import {
  BotOnly,
  ClientIp,
  CurrentUser,
  RequirePermissions,
  type RequestUser,
} from "../../common/decorators";
import type { ScopeContext } from "../../common/scope.util";
import { SecurityService } from "./security.service";
import { ThreatFeedsService } from "./threat-feeds.service";
import {
  AllowEventDto,
  BulkGuardDto,
  ListSecurityQuery,
  ReportThreatDto,
  SetFeedEnabledDto,
  SetGuardDto,
} from "./dto/security.dto";

const toScope = (user: RequestUser): ScopeContext => ({
  userId: user.id,
  role: user.role,
  scopeKind: user.scopeKind,
  districtId: user.districtId,
});

// ═══════════════════════════════════════════════════════════════════
//  BOT
// ═══════════════════════════════════════════════════════════════════

@Controller("bot/security")
export class BotSecurityController {
  constructor(
    private readonly security: SecurityService,
    private readonly feeds: ThreatFeedsService,
  ) {}

  /**
   * TASHQI QORA RO'YXAT — BOT XOTIRASIGA.
   *
   * ⚠️ `guardConfig` GA QO'SHILMAYDI va bu ataylab: u HAR GURUH
   * uchun, har 2 daqiqada so'raladi. 50 000 hostni har safar tashish
   * tarmoqni bekorga band qilardi — bu ro'yxat esa soatda bir marta
   * kerak.
   *
   * ⚠️ `since` — BOTDAGI VERSIYA: o'zgarmagan bo'lsa javob BO'SH
   * keladi (`changed: false`) va bot eski ro'yxatini saqlab qoladi.
   */
  @BotOnly()
  @Get("blocklist")
  blocklist(@Query("since") since?: string) {
    return this.feeds.blocklist(since);
  }

  /**
   * QALQON SOZLAMASI — bot har guruh uchun so'raydi va keshlaydi.
   *
   * ⚠️ QORA RO'YXAT SHU YERDAN KELADI: botda uning nusxasi
   * saqlanmaydi (botda Prisma yo'q) va panelda domen qo'shilgach
   * bot uni keyingi so'rovda oladi.
   */
  @BotOnly()
  @Get("config/:chatId")
  config(@Param("chatId") chatId: string) {
    return this.security.guardConfig(chatId);
  }

  /** Tahdid aniqlandi / o'chirildi — jurnalga. */
  @BotOnly()
  @Post("events")
  @HttpCode(201)
  report(@Body() dto: ReportThreatDto) {
    return this.security.report(dto);
  }
}

// ═══════════════════════════════════════════════════════════════════
//  PANEL
// ═══════════════════════════════════════════════════════════════════

@Controller("security")
export class SecurityController {
  constructor(
    private readonly security: SecurityService,
    private readonly feeds: ThreatFeedsService,
  ) {}

  // ── TASHQI TAHDID RO'YXATLARI ─────────────────────────
  //
  // ⚠️ KO'RISH — `security.view`, O'ZGARTIRISH — `security.guard`:
  // ro'yxatni o'chirish himoyaning bir qismini o'chirish degani va u
  // qalqonni o'chirish bilan AYNI darajadagi amal.

  @Get("feeds")
  @RequirePermissions("security.view")
  listFeeds() {
    return this.feeds.list();
  }

  @Post("feeds/:id/refresh")
  @HttpCode(200)
  @RequirePermissions("security.guard")
  refreshFeed(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.feeds.refresh(id, user.id);
  }

  @Patch("feeds/:id")
  @RequirePermissions("security.guard")
  setFeedEnabled(
    @Param("id") id: string,
    @Body() dto: SetFeedEnabledDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.feeds.setEnabled(id, dto.isEnabled, user.id);
  }

  @Get("events")
  @RequirePermissions("security.view")
  list(@CurrentUser() user: RequestUser, @Query() query: ListSecurityQuery) {
    return this.security.list(query, toScope(user));
  }

  @Get("stats")
  @RequirePermissions("security.view")
  stats(@CurrentUser() user: RequestUser) {
    return this.security.stats(toScope(user));
  }

  /**
   * NOTO'G'RI O'CHIRILGAN HAVOLANI TIKLASH.
   *
   * ⚠️ RUXSAT — `security.guard`, `security.view` EMAS: bu amal oq
   * ro'yxatga host QO'SHADI, ya'ni himoyaning bir qismini
   * o'chiradi. Hisobot uchun kirgan odam buni qila olmasligi
   * kerak (qalqonni yoqish bilan AYNI daraja).
   *
   * ⚠️ `POST`, `PATCH` EMAS: hodisa yozuvi append-only va bu amal
   * uni TAHRIRLAMAYDI — u yangi qaror qo'shadi (belgi + oq
   * ro'yxat). `PATCH` "yozuvni o'zgartirdik" degan ma'no berardi.
   */
  @Post("events/:id/allow")
  @HttpCode(200)
  @RequirePermissions("security.guard")
  allowEvent(
    @Param("id") id: string,
    @Body() _dto: AllowEventDto,
    @CurrentUser() user: RequestUser,
    @ClientIp() ip: string | null,
  ) {
    return this.security.allowEvent(id, toScope(user), user.id, ip ?? undefined);
  }

  /**
   * OMMAVIY QALQON — filtrdan o'tgan barcha guruh uchun.
   *
   * ⚠️ BU MARSHRUT `groups/:chatId/guard` DAN OLDIN TURISHI SHART.
   * Ikkalasi ham uch bo'lakli va Nest BIRINCHI mos kelganini
   * oladi: pastda tursa, `/security/groups/bulk/guard` so'rovi
   * `chatId = "bulk"` bo'lib yakka handler'ga tushardi va
   * "Guruh topilmadi" degan chalg'ituvchi xato berardi.
   */
  @Patch("groups/bulk/guard")
  @RequirePermissions("security.guard")
  bulkSetGuard(
    @Body() dto: BulkGuardDto,
    @CurrentUser() user: RequestUser,
    @ClientIp() ip: string | null,
  ) {
    return this.security.bulkSetGuard(dto, toScope(user), user.id, ip ?? undefined);
  }

  /**
   * ⚠️ ALOHIDA RUXSAT (`security.guard`): qalqonni yoqish — botga
   * aholining xabarini O'CHIRISH huquqini berish va buni hisobot
   * uchun kirgan odam qilib qo'yishi mumkin emas.
   */
  @Patch("groups/:chatId/guard")
  @RequirePermissions("security.guard")
  setGuard(
    @Param("chatId") chatId: string,
    @Body() dto: SetGuardDto,
    @CurrentUser() user: RequestUser,
    @ClientIp() ip: string | null,
  ) {
    return this.security.setGuard(
      chatId,
      dto,
      toScope(user),
      user.id,
      ip ?? undefined,
    );
  }
}
