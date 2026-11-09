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
import {
  BulkGuardDto,
  ListSecurityQuery,
  ReportThreatDto,
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
  constructor(private readonly security: SecurityService) {}

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
  constructor(private readonly security: SecurityService) {}

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
