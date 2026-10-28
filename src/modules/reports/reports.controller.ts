import { Controller, Get, Query } from "@nestjs/common";

import {
  CurrentUser,
  RequirePermissions,
  type RequestUser,
} from "../../common/decorators";
import type { ScopeContext } from "../../common/scope.util";
import { ReportsService } from "./reports.service";
import { DailyQuery, ReportQuery } from "./dto/reports.dto";

const toScope = (user: RequestUser): ScopeContext => ({
  userId: user.id,
  role: user.role,
  scopeKind: user.scopeKind,
  districtId: user.districtId,
});

@Controller("reports")
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get("overview")
  @RequirePermissions("reports.view")
  overview(@CurrentUser() user: RequestUser, @Query() query: ReportQuery) {
    return this.reports.overview(toScope(user), query);
  }

  @Get("territory")
  @RequirePermissions("reports.view")
  byTerritory(@CurrentUser() user: RequestUser, @Query() query: ReportQuery) {
    return this.reports.byTerritory(toScope(user), query);
  }

  @Get("categories")
  @RequirePermissions("reports.view")
  byCategory(@CurrentUser() user: RequestUser, @Query() query: ReportQuery) {
    return this.reports.byCategory(toScope(user), query);
  }

  @Get("signals")
  @RequirePermissions("reports.view")
  signals(@CurrentUser() user: RequestUser, @Query() query: ReportQuery) {
    return this.reports.signalMetrics(toScope(user), query);
  }

  /** Mini App (fuqaro murojaatlari) analitikasi. */
  @Get("mobile")
  @RequirePermissions("reports.view")
  mobile(@CurrentUser() user: RequestUser, @Query() query: ReportQuery) {
    return this.reports.mobileMetrics(toScope(user), query);
  }

  /** Xarita uchun — koordinatali murojaatlar (qamrovga bo'ysunadi). */
  @Get("map")
  @RequirePermissions("reports.view")
  map(@CurrentUser() user: RequestUser, @Query() query: ReportQuery) {
    return this.reports.mapPoints(toScope(user), query);
  }

  /**
   * TUMANLAR XARITASI — choropleth uchun bitta so'rovda uch oqim
   * (muammo, signal, xavfsizlik) tuman kesimida.
   */
  @Get("district-map")
  @RequirePermissions("reports.view")
  districtMap(@CurrentUser() user: RequestUser, @Query() query: ReportQuery) {
    return this.reports.byDistrictMap(toScope(user), query);
  }

  @Get("daily")
  @RequirePermissions("reports.view")
  daily(@CurrentUser() user: RequestUser, @Query() query: DailyQuery) {
    return this.reports.daily(toScope(user), query.days);
  }
}
