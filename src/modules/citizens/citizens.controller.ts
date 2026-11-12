import { Body, Controller, Get, Param, Patch, Query } from "@nestjs/common";

import {
  CurrentUser,
  RequirePermissions,
  type RequestUser,
} from "../../common/decorators";
import type { ScopeContext } from "../../common/scope.util";
import { CitizensService } from "./citizens.service";
import {
  BlockCitizenDto,
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

  /**
   * ⚠️ `POST /citizens/broadcast` OLIB TASHLANDI — o'rnida
   * `POST /broadcasts` (`modules/broadcasts/`). Eski endpoint faqat
   * FUQAROLARGA va faqat MATN yubora olardi; yangisida tuman/MFY
   * kesimi, MFY guruhlari va botdan uzatilgan xabar ham bor.
   *
   * ⚠️ RUXSAT HAM O'ZGARDI: `citizens.manage` emas,
   * `broadcast.send`. Ikkisi boshqa-boshqa amal — bloklash fuqaroni
   * yopadi, tarqatma esa minglab odamga xabar yuboradi.
   */
}
