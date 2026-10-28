import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from "@nestjs/common";

import {
  CurrentUser,
  RequirePermissions,
  type RequestUser,
} from "../../common/decorators";
import type { ScopeContext } from "../../common/scope.util";
import { CitizensService } from "./citizens.service";
import {
  BlockCitizenDto,
  BroadcastDto,
  ListCitizensQuery,
  RatingQuery,
} from "./dto/citizens.dto";

const toScope = (user: RequestUser): ScopeContext => ({
  userId: user.id,
  role: user.role,
  scopeKind: user.scopeKind,
  districtId: user.districtId,
});

@Controller("citizens")
export class CitizensController {
  constructor(private readonly citizens: CitizensService) {}

  @Get()
  @RequirePermissions("citizens.view")
  list(@Query() query: ListCitizensQuery) {
    return this.citizens.list(query);
  }

  /**
   * ⚠️ `:id` DAN OLDIN TURISHI SHART: Nest marshrutlarni YOZILGAN
   * TARTIBDA tekshiradi va pastda qolsa `GET /citizens/rating`
   * "rating" ni id deb olib, 404 qaytarardi.
   */
  @Get("rating")
  @RequirePermissions("citizens.view")
  rating(@CurrentUser() user: RequestUser, @Query() query: RatingQuery) {
    return this.citizens.rating(query, toScope(user));
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

  @Post("broadcast")
  @HttpCode(200)
  @RequirePermissions("citizens.manage")
  broadcast(@Body() dto: BroadcastDto, @CurrentUser() user: RequestUser) {
    return this.citizens.broadcast(dto, user.id);
  }
}
