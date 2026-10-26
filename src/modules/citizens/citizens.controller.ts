import { Body, Controller, Get, Param, Patch, Query } from "@nestjs/common";

import {
  CurrentUser,
  RequirePermissions,
  type RequestUser,
} from "../../common/decorators";
import { CitizensService } from "./citizens.service";
import { BlockCitizenDto, ListCitizensQuery } from "./dto/citizens.dto";

@Controller("citizens")
export class CitizensController {
  constructor(private readonly citizens: CitizensService) {}

  @Get()
  @RequirePermissions("citizens.view")
  list(@Query() query: ListCitizensQuery) {
    return this.citizens.list(query);
  }

  @Get(":id")
  @RequirePermissions("citizens.view")
  findOne(@Param("id") id: string) {
    return this.citizens.findOne(id);
  }

  @Patch(":id/block")
  @RequirePermissions("citizens.manage")
  setBlocked(
    @Param("id") id: string,
    @Body() dto: BlockCitizenDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.citizens.setBlocked(id, dto, user.id);
  }
}
