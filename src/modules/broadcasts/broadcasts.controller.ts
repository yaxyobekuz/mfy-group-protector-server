/**
 * TARQATMA ENDPOINT'LARI.
 *
 *   `/api/broadcasts/*`      →  PANEL (xodim tokeni + ruxsat)
 *   `/api/bot/admin/*`       →  BOT (X-Bot-Key + `User.telegramId`)
 *
 * ⚠️ IKKI CONTROLLER, BITTA XIZMAT: hudud tekshiruvi, manzil
 * to'plash, Telegram chegarasi va holat yozuvi — hammasi
 * `BroadcastsService` da. Bot yo'li uchun nusxa yozilsa, "paneldan
 * yuborilgani MFY siz guruhlarni chetlab o'tadi, botdan yuborilgani
 * esa yo'q" kabi ajralishlar paydo bo'lardi.
 *
 * ⚠️ FARQ FAQAT BITTA SAVOLDA: KIM so'rayapti. Panelda — JWT,
 * botda — `telegramId` bo'yicha topilgan xodim.
 */

import { Body, Controller, Get, HttpCode, Param, Post, Query } from "@nestjs/common";

import {
  BotOnly,
  CurrentUser,
  RequirePermissions,
  type RequestUser,
} from "../../common/decorators";
import { toScope } from "../../common/scope.util";
import { BotAdminService } from "./bot-admin.service";
import { BroadcastsService } from "./broadcasts.service";
import {
  BotAdminDto,
  BotAudienceQueryDto,
  BotBroadcastDto,
  BotBroadcastListDto,
  CreateBroadcastDto,
  ListBroadcastsQuery,
} from "./dto/broadcasts.dto";

@Controller("broadcasts")
export class BroadcastsController {
  constructor(private readonly broadcasts: BroadcastsService) {}

  @Get()
  @RequirePermissions("broadcast.send")
  list(@CurrentUser() user: RequestUser, @Query() query: ListBroadcastsQuery) {
    return this.broadcasts.list(toScope(user), query);
  }

  /**
   * ⚠️ `POST`, `GET` EMAS: auditoriya hajmini so'rash uchun hudud va
   * auditoriya tanasi kerak va ularni URL ga yozish filtrlarni
   * server loglariga tarqatardi.
   *
   * ⚠️ HECH NARSA YUBORMAYDI — faqat sanaydi.
   */
  @Post("preview")
  @HttpCode(200)
  @RequirePermissions("broadcast.send")
  preview(
    @Body() dto: CreateBroadcastDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.broadcasts.preview(dto, toScope(user));
  }

  @Post()
  @RequirePermissions("broadcast.send")
  create(@Body() dto: CreateBroadcastDto, @CurrentUser() user: RequestUser) {
    return this.broadcasts.create(dto, toScope(user), "panel");
  }

  /**
   * ⚠️ HOLAT SO'RALIB TURILADI: tarqatma fon'da ketadi va panel
   * "qancha yuborildi" degan savolga javobni shu yerdan oladi.
   */
  @Get(":id")
  @RequirePermissions("broadcast.send")
  findOne(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.broadcasts.findOne(id, toScope(user));
  }
}

/**
 * BOTDAGI ADMIN PANELI.
 *
 * ⚠️ HAMMA ENDPOINT `@BotOnly()`: bu yerda xodim JWT'si YO'Q va
 * bo'lmaydi — bot `X-Bot-Key` bilan kiradigan ishonchli XIZMAT
 * (`bot-citizens.controller.ts` izohi).
 *
 * ⚠️ `@RequirePermissions` QO'YILMAYDI: u `request.user` ni talab
 * qiladi, bot so'rovida esa u to'ldirilmaydi. Huquq
 * `BotAdminService.resolve` ichida, `telegramId` bo'yicha topilgan
 * xodimda tekshiriladi.
 */
@Controller("bot/admin")
export class BotAdminController {
  constructor(
    private readonly admins: BotAdminService,
    private readonly broadcasts: BroadcastsService,
  ) {}

  /**
   * "MEN KIMMAN" — botdagi panel shu javobga qarab ochiladi.
   *
   * ⚠️ 403 ODATIY JAVOB, XATO EMAS: `/admin` ni istalgan fuqaro
   * yozishi mumkin va bot o'shanda shunchaki "bu bo'lim siz uchun
   * emas" deydi.
   */
  @BotOnly()
  @Post("me")
  @HttpCode(200)
  async me(@Body() dto: BotAdminDto) {
    const admin = await this.admins.resolve(dto.telegramId);

    return {
      firstName: admin.firstName,
      lastName: admin.lastName,
      districtName: admin.districtName,
      provinceWide: admin.provinceWide,
    };
  }

  @BotOnly()
  @Post("territory")
  @HttpCode(200)
  async territory(@Body() dto: BotAdminDto) {
    const admin = await this.admins.resolve(dto.telegramId);
    return this.admins.territory(admin.scope);
  }

  @BotOnly()
  @Post("broadcasts/preview")
  @HttpCode(200)
  async preview(@Body() dto: BotAudienceQueryDto) {
    const admin = await this.admins.resolve(dto.telegramId);

    return this.broadcasts.preview(
      {
        audience: dto.audience,
        districtId: dto.districtId,
        mahallaId: dto.mahallaId,
      },
      admin.scope,
    );
  }

  @BotOnly()
  @Post("broadcasts")
  async create(@Body() dto: BotBroadcastDto) {
    const admin = await this.admins.resolve(dto.telegramId);

    return this.broadcasts.create(
      {
        audience: dto.audience,
        mode: dto.mode,
        message: dto.message,
        fromChatId: dto.fromChatId,
        sourceMessageId: dto.sourceMessageId,
        districtId: dto.districtId,
        mahallaId: dto.mahallaId,
      },
      admin.scope,
      "bot",
    );
  }

  @BotOnly()
  @Post("broadcasts/list")
  @HttpCode(200)
  async list(@Body() dto: BotBroadcastListDto) {
    const admin = await this.admins.resolve(dto.telegramId);

    return this.broadcasts.list(admin.scope, {
      page: 1,
      limit: dto.limit ?? 5,
      skip: 0,
    } as ListBroadcastsQuery);
  }

  /**
   * ⚠️ BITTA TARQATMA HOLATI: bot "yuborildi/yuborilmadi" sonini
   * ko'rsatish uchun so'raydi. Tarqatma fon'da ketadi, ya'ni darhol
   * javob bo'lmaydi.
   */
  @BotOnly()
  @Post("broadcasts/:id")
  @HttpCode(200)
  async findOne(@Param("id") id: string, @Body() dto: BotAdminDto) {
    const admin = await this.admins.resolve(dto.telegramId);
    return this.broadcasts.findOne(id, admin.scope);
  }
}
