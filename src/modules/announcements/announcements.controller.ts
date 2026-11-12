import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";

import {
  CurrentUser,
  RequirePermissions,
  type RequestUser,
} from "../../common/decorators";
import { MAX_FILE_SIZE } from "../uploads/uploads.constants";
import { UploadsService } from "../uploads/uploads.service";
import { AnnouncementsService } from "./announcements.service";
import {
  CreateAnnouncementDto,
  ListAnnouncementsQuery,
  UpdateAnnouncementDto,
} from "./dto/announcements.dto";

@Controller("announcements")
export class AnnouncementsController {
  constructor(
    private readonly announcements: AnnouncementsService,
    private readonly uploads: UploadsService,
  ) {}

  /**
   * E'LON UCHUN FAYL YUKLASH — XODIM TOMONI.
   *
   * ⚠️ FUQARO ENDPOINT'IDAN ALOHIDA (`/mobile/uploads`) va bu
   * ataylab: u `@CitizenOnly()` bilan himoyalangan, ya'ni xodim
   * tokeni bilan umuman ishlamaydi. Bitta endpoint'da ikki
   * autentifikatsiyani qabul qilish "bu so'rovni kim yubordi"
   * degan savolni har handler ichida qayta hal qilishga majbur
   * qilardi (`security.controller.ts` dagi ayni sabab).
   *
   * ⚠️ CHEGARA `THROTTLE` BILAN QO'YILMAYDI: bu endpoint
   * `announcements.manage` ruxsatini talab qiladi, ya'ni uni
   * ochish uchun avval xodim bo'lish kerak. Fuqaro yo'lidagi
   * chegara anonim yuklashga qarshi edi.
   *
   * ⚠️ JAVOB — IMZOLANGAN TOKEN, yo'l emas: `media` ga aynan shu
   * token yuboriladi (`announcements.service.ts#resolveMedia`).
   */
  @Post("uploads")
  @RequirePermissions("announcements.manage")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: MAX_FILE_SIZE },
    }),
  )
  upload(@UploadedFile() file: Express.Multer.File) {
    return this.uploads.save(file);
  }

  @Get()
  @RequirePermissions("announcements.manage")
  list(@Query() query: ListAnnouncementsQuery) {
    return this.announcements.list(query);
  }

  @Post()
  @RequirePermissions("announcements.manage")
  create(@Body() dto: CreateAnnouncementDto, @CurrentUser() user: RequestUser) {
    return this.announcements.create(dto, user.id);
  }

  @Patch(":id")
  @RequirePermissions("announcements.manage")
  update(
    @Param("id") id: string,
    @Body() dto: UpdateAnnouncementDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.announcements.update(id, dto, user.id);
  }

  @Delete(":id")
  @RequirePermissions("announcements.manage")
  remove(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.announcements.remove(id, user.id);
  }
}
