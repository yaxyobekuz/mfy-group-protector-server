import { Body, Controller, Get, Patch } from "@nestjs/common";

import {
  CurrentUser,
  RequirePermissions,
  type RequestUser,
} from "../../common/decorators";
import { SettingsService } from "./settings.service";
import { UpdateSettingsDto } from "./dto/settings.dto";

@Controller("settings")
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  /**
   * ⚠️ O'QISH UCHUN `settings.manage` TALAB QILINMAYDI: panel
   * `orgName` ni sarlavhada ko'rsatadi va u hamma uchun kerak.
   * Sezgir qiymat bu yerda yo'q — API kalitlari `.env` da.
   */
  @Get()
  get() {
    return this.settings.get();
  }

  @Patch()
  @RequirePermissions("settings.manage")
  update(@Body() dto: UpdateSettingsDto, @CurrentUser() user: RequestUser) {
    return this.settings.update(dto, user.id);
  }
}
