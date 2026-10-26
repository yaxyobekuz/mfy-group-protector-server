import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";

import {
  CurrentUser,
  RequirePermissions,
  type RequestUser,
} from "../../common/decorators";
import { AnnouncementsService } from "./announcements.service";
import {
  CreateAnnouncementDto,
  ListAnnouncementsQuery,
  UpdateAnnouncementDto,
} from "./dto/announcements.dto";

@Controller("announcements")
export class AnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

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
