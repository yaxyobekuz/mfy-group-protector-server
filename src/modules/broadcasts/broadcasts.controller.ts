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
  BotBroadcastIdDto,
  BotBroadcastListDto,
  CreateBroadcastDto,
  ListBroadcastsQuery,
  ListRecipientsQuery,
  PreviewBroadcastDto,
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
  preview(@Body() dto: PreviewBroadcastDto, @CurrentUser() user: RequestUser) {
    return this.broadcasts.preview(dto, toScope(user));
  }

  /**
   * SINOV XABARI — FAQAT YUBORUVCHIGA.
   *
   * ⚠️ `@Post("test")` `@Post(":id/...")` DAN OLDIN TURISHI SHART:
   * NestJS yo'llarni E'LON TARTIBIDA solishtiradi va pastda qolsa,
   * "test" so'zi `id` bo'lib o'qilardi (`export/unassigned-groups`
   * dagi ayni tuzoq).
   *
   * ⚠️ YOZUV YARATILMAYDI: sinov — tarqatma emas va u tarixga
   * tushsa, "nechta tarqatma yuborildi" degan son buzilardi.
   */
  @Post("test")
  @HttpCode(200)
  @RequirePermissions("broadcast.send")
  test(@Body() dto: CreateBroadcastDto, @CurrentUser() user: RequestUser) {
    return this.broadcasts.testSend(dto, user.id);
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

  /**
   * YETKAZISH JURNALI.
   *
   * ⚠️ AYNI RUXSAT (`broadcast.send`): jurnalda chat id'lari va
   * nomlari bor, ya'ni u tarqatma yuborgan odamning o'z ishi —
   * alohida ruxsat qo'shilsa, u hech kimga berilmay, funksiya
   * o'lik qolardi.
   */
  @Get(":id/recipients")
  @RequirePermissions("broadcast.send")
  recipients(
    @Param("id") id: string,
    @CurrentUser() user: RequestUser,
    @Query() query: ListRecipientsQuery,
  ) {
    return this.broadcasts.recipients(id, toScope(user), query);
  }

  /**
   * TO'XTATADI.
   *
   * ⚠️ YUBORILGANLARNI QAYTARIB BO'LMAYDI: to'xtatish faqat
   * QOLGANLARINI to'xtatadi va panel buni ochiq aytadi.
   */
  @Post(":id/cancel")
  @HttpCode(200)
  @RequirePermissions("broadcast.send")
  cancel(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.broadcasts.cancel(id, toScope(user));
  }

  /**
   * YETIB BORMAGANLARIGA QAYTA YUBORADI.
   *
   * ⚠️ YANGI TARQATMA YARATILADI: eskisi append-only dalil va
   * uning sonlarini o'zgartirish yozuvni soxtalashtirardi.
   */
  @Post(":id/retry")
  @HttpCode(200)
  @RequirePermissions("broadcast.send")
  retry(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.broadcasts.retry(id, toScope(user));
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
        activeDays: dto.activeDays,
      },
      admin.scope,
    );
  }

  @BotOnly()
  @Post("broadcasts")
  async create(@Body() dto: BotBroadcastDto) {
    const admin = await this.admins.resolve(dto.telegramId);

    /*
     * ⚠️ MAYDONLAR SANAB O'TILMAYDI: avval ular qo'lda
     * ko'chirilardi va tarqatmaga yangi imkoniyat (tugma, ovozsiz,
     * rejalashtirish) qo'shilganda botdan kelgani JIMGINA tushib
     * qolardi — bot "tugma qo'ydim" deb o'ylab, xabar tugmasiz
     * ketardi.
     *
     * ⚠️ `telegramId` CHIQARIB TASHLANADI: u faqat adminni topish
     * uchun edi (`resolve`) va tarqatma yozuviga tushishi kerak
     * emas — kim yuborgani `createdBy` da, xodim id'si bilan.
     */
    const { telegramId: _admin, ...content } = dto;

    return this.broadcasts.create(content, admin.scope, "bot");
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
  /**
   * ⚠️ `broadcasts/cancel` `broadcasts/:id` DAN OLDIN: NestJS
   * yo'llarni e'lon tartibida solishtiradi va pastda qolsa,
   * "cancel" so'zi `id` bo'lib o'qilardi.
   */
  @BotOnly()
  @Post("broadcasts/cancel")
  @HttpCode(200)
  async cancel(@Body() dto: BotBroadcastIdDto) {
    const admin = await this.admins.resolve(dto.telegramId);
    return this.broadcasts.cancel(dto.broadcastId, admin.scope);
  }

  @BotOnly()
  @Post("broadcasts/:id")
  @HttpCode(200)
  async findOne(@Param("id") id: string, @Body() dto: BotAdminDto) {
    const admin = await this.admins.resolve(dto.telegramId);
    return this.broadcasts.findOne(id, admin.scope);
  }
}
