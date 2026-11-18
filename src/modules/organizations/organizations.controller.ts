/**
 * TASHKILOTLAR — PANEL VA BOT ENDPOINT'LARI.
 *
 * ⚠️ `organizations.manage` — PANELGA KIRISH HISOBI YARATADIGAN
 * HUQUQ va u yo'naltirish qoidasini ham boshqaradi. Noto'g'ri qoida
 * butun bir yo'nalishning murojaatlarini begona tashkilotga
 * yuborardi, shuning uchun u operatorga BERILMAYDI
 * (`common/permissions.ts`).
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
} from "@nestjs/common";
import { IsString, Length } from "class-validator";

import {
  BotOnly,
  CurrentUser,
  RequirePermissions,
  type RequestUser,
} from "../../common/decorators";
import { toScope } from "../../common/scope.util";
import {
  ArchiveOrganizationDto,
  CreateOrgLoginDto,
  CreateOrganizationDto,
  ListOrgRoutesQuery,
  ListOrganizationsQuery,
  SaveOrgRouteDto,
  UpdateOrganizationDto,
} from "./dto/organizations.dto";
import { OrganizationsService } from "./organizations.service";

@Controller("organizations")
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Get()
  @RequirePermissions("organizations.view")
  list(@CurrentUser() user: RequestUser, @Query() query: ListOrganizationsQuery) {
    return this.organizations.list(toScope(user), query);
  }

  /**
   * ⚠️ `routes` MARSHRUTI `:id` DAN OLDIN TURISHI SHART: ikkalasi
   * ham bitta bo'lak va Nest BIRINCHI MOS KELGANINI oladi. Pastda
   * tursa, `GET /organizations/routes` so'rovi `:id` handler'iga
   * tushib, "Tashkilot topilmadi" qaytarardi
   * (`reports.controller.ts#export/unassigned-groups` dagi ayni
   * tuzoq).
   */
  @Get("routes")
  @RequirePermissions("organizations.view")
  listRoutes(@CurrentUser() user: RequestUser, @Query() query: ListOrgRoutesQuery) {
    return this.organizations.listRoutes(toScope(user), query);
  }

  @Post("routes")
  @RequirePermissions("organizations.manage")
  saveRoute(@Body() dto: SaveOrgRouteDto, @CurrentUser() user: RequestUser) {
    return this.organizations.saveRoute(dto, toScope(user));
  }

  @Delete("routes/:id")
  @RequirePermissions("organizations.manage")
  removeRoute(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.organizations.removeRoute(id, toScope(user));
  }

  @Post()
  @RequirePermissions("organizations.manage")
  create(@Body() dto: CreateOrganizationDto, @CurrentUser() user: RequestUser) {
    return this.organizations.create(dto, toScope(user));
  }

  @Patch(":id")
  @RequirePermissions("organizations.manage")
  update(
    @Param("id") id: string,
    @Body() dto: UpdateOrganizationDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.organizations.update(id, dto, toScope(user));
  }

  @Patch(":id/archive")
  @RequirePermissions("organizations.manage")
  archive(
    @Param("id") id: string,
    @Body() dto: ArchiveOrganizationDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.organizations.archive(id, dto, toScope(user));
  }

  @Get(":id/users")
  @RequirePermissions("organizations.manage")
  listUsers(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.organizations.listUsers(id, toScope(user));
  }

  /**
   * ⚠️ PAROL JAVOBDA BIR MARTA QAYTARILADI va qayta so'rab
   * bo'lmaydi — faqat tiklash (`:userId/reset`).
   */
  @Post(":id/users")
  @RequirePermissions("organizations.manage")
  createLogin(
    @Param("id") id: string,
    @Body() dto: CreateOrgLoginDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.organizations.createLogin(id, dto, toScope(user));
  }

  @Post(":id/users/:userId/reset")
  @RequirePermissions("organizations.manage")
  resetLogin(
    @Param("id") id: string,
    @Param("userId") userId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.organizations.resetLogin(id, userId, toScope(user));
  }

  @Post(":id/link-code")
  @RequirePermissions("organizations.manage")
  linkCode(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.organizations.issueLinkCode(id, toScope(user));
  }
}

/**
 * BOT ULANISHI — `/api/bot/organizations/link`.
 *
 * ⚠️ `telegramId` BOTDAN KELADI, LEKIN U TELEGRAM TASDIQLAGAN qiymat
 * (`message.from.id`). `organizationId` esa QABUL QILINMAYDI: kalit
 * tarqalgan holatda u begona tashkilotning xabarnomalarini o'z
 * chatiga burish yo'li bo'lardi (`bot-citizens.controller.ts` dagi
 * ayni qoida).
 */
class LinkOrgDto {
  @IsString() @Length(3, 32) telegramId!: string;
  @IsString() @Length(4, 16) code!: string;
}

@Controller("bot/organizations")
export class BotOrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Post("link")
  @BotOnly()
  @HttpCode(200)
  link(@Body() dto: LinkOrgDto) {
    return this.organizations.linkTelegram({
      telegramId: dto.telegramId,
      code: dto.code,
    });
  }
}
