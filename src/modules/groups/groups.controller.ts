/**
 * GURUH ENDPOINT'LARI — IKKI AUDITORIYA.
 *
 *   `/bot/groups/*`   → bot (`X-Bot-Key`), `@BotOnly()`
 *   `/groups/*`       → panel (JWT + ruxsat)
 *
 * ⚠️ IKKI YO'L ATAYLAB AJRATILGAN. Bitta endpoint'da ikkala
 * autentifikatsiyani qabul qilish "bu so'rovni kim yubordi" degan
 * savolni har handler ichida qayta hal qilishga majbur qilardi — va
 * bir joyda u tushib qolishi kerak edi.
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
  CurrentUser,
  RequirePermissions,
  type RequestUser,
} from "../../common/decorators";
import { toScope } from "../../common/scope.util";
import { GroupsService } from "./groups.service";
import {
  AssignMahallaDto,
  BulkOfficialDto,
  CaptureMessageDto,
  ListGroupsQuery,
  MembershipDto,
  SetOfficialDto,
  TouchGroupDto,
} from "./dto/groups.dto";

// ═══════════════════════════════════════════════════════════════════
//  BOT
// ═══════════════════════════════════════════════════════════════════

@Controller("bot/groups")
export class BotGroupsController {
  constructor(private readonly groups: GroupsService) {}

  /** `my_chat_member` — ro'yxatning asosiy manbasi. */
  @BotOnly()
  @Post("membership")
  @HttpCode(200)
  membership(@Body() dto: MembershipDto) {
    return this.groups.recordMembership(dto);
  }

  /**
   * Guruhdan xabar keldi — reyestrni yangilaydi va "rasmiymi" deb
   * javob beradi.
   *
   * ⚠️ JAVOBDA `isOfficial` BOR: bot shundan "xabarni yuborishim
   * kerakmi" deb biladi va har xabarda ikkinchi so'rov qilmaydi.
   */
  @BotOnly()
  @Post("touch")
  @HttpCode(200)
  touch(@Body() dto: TouchGroupDto) {
    return this.groups.touchFromMessage(dto);
  }

  /** Rasmiy guruhdagi xabarni tahlil navbatiga qo'yadi. */
  @BotOnly()
  @Post("messages")
  @HttpCode(202)
  capture(@Body() dto: CaptureMessageDto) {
    return this.groups.captureMessage(dto);
  }
}

// ═══════════════════════════════════════════════════════════════════
//  PANEL
// ═══════════════════════════════════════════════════════════════════

@Controller("groups")
export class GroupsController {
  constructor(private readonly groups: GroupsService) {}

  @Get()
  @RequirePermissions("groups.view")
  list(@CurrentUser() user: RequestUser, @Query() query: ListGroupsQuery) {
    return this.groups.list(toScope(user), query);
  }

  @Get("stats")
  @RequirePermissions("groups.view")
  stats(@CurrentUser() user: RequestUser) {
    return this.groups.getStats(toScope(user));
  }

  /**
   * OMMAVIY KUZATUV — filtrdan o'tgan barcha guruh uchun.
   *
   * ⚠️ BU MARSHRUT `:chatId/official` DAN OLDIN TURISHI SHART.
   * Ikkalasi ham ikki bo'lakli va Nest BIRINCHI mos kelganini
   * oladi: pastda tursa, `/groups/bulk/official` so'rovi
   * `chatId = "bulk"` bo'lib yakka handler'ga tushardi va
   * "Guruh topilmadi" degan chalg'ituvchi xato berardi.
   */
  @Patch("bulk/official")
  @RequirePermissions("groups.official")
  bulkSetOfficial(@Body() dto: BulkOfficialDto, @CurrentUser() user: RequestUser) {
    return this.groups.bulkSetOfficial(dto, toScope(user));
  }

  /**
   * ⚠️ ALOHIDA RUXSAT (`groups.official`): bu belgi — guruh
   * yozishmasini o'qishga ROZILIK va uni hisobot uchun kirgan odam
   * qo'yib yuborishi mumkin emas.
   */
  @Patch(":chatId/official")
  @RequirePermissions("groups.official")
  setOfficial(
    @Param("chatId") chatId: string,
    @Body() dto: SetOfficialDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.groups.setOfficial(chatId, dto, toScope(user));
  }

  @Patch(":chatId/mahalla")
  @RequirePermissions("groups.assign")
  assignMahalla(
    @Param("chatId") chatId: string,
    @Body() dto: AssignMahallaDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.groups.assignMahalla(chatId, dto, toScope(user));
  }
}
