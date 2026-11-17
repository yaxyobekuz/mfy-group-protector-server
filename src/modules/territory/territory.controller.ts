/**
 * HUDUD ENDPOINT'LARI.
 *
 * ⚠️ O'CHIRISH (`DELETE`) ENDPOINT'I YO'Q va bu ataylab: tumanga
 * biriktirilgan tarix (guruhlar, signallar, muammolar) qoladi.
 * Arxivlash `PATCH .../archive` orqali.
 */

import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";

import {
  CurrentUser,
  RequirePermissions,
  type RequestUser,
} from "../../common/decorators";
import { toScope, type ScopeContext } from "../../common/scope.util";
import { TerritoryService } from "./territory.service";
import {
  ArchiveDto,
  CreateDistrictDto,
  CreateMahallaDto,
  ListDistrictQuery,
  ListMahallaQuery,
  UpdateDistrictDto,
  ImportDistrictGeoDto,
  ImportMahallaGeoDto,
  SetProvinceGeoDto,
  UpdateMahallaDto,
} from "./dto/territory.dto";

/** `RequestUser` → `ScopeContext`. Shakl bir xil, nom boshqa. */

@Controller("territory")
export class TerritoryController {
  constructor(private readonly territory: TerritoryService) {}

  // ── TUMANLAR ─────────────────────────────────────────────────────

  @Get("districts")
  @RequirePermissions("territory.view")
  listDistricts(@CurrentUser() user: RequestUser, @Query() query: ListDistrictQuery) {
    return this.territory.listDistricts(toScope(user), {
      includeArchived: query.includeArchived,
    });
  }

  @Post("districts")
  @RequirePermissions("territory.manage")
  createDistrict(@CurrentUser() user: RequestUser, @Body() dto: CreateDistrictDto) {
    return this.territory.createDistrict(dto, toScope(user));
  }

  @Patch("districts/:id")
  @RequirePermissions("territory.manage")
  updateDistrict(
    @Param("id") id: string,
    @Body() dto: UpdateDistrictDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.territory.updateDistrict(id, dto, toScope(user));
  }

  @Patch("districts/:id/archive")
  @RequirePermissions("territory.manage")
  archiveDistrict(
    @Param("id") id: string,
    @Body() dto: ArchiveDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.territory.archiveDistrict(id, dto.archived, toScope(user));
  }

  // ── MFY ──────────────────────────────────────────────────────────

  @Get("mahallas")
  @RequirePermissions("territory.view")
  listMahallas(@CurrentUser() user: RequestUser, @Query() query: ListMahallaQuery) {
    return this.territory.listMahallas(toScope(user), query);
  }

  /**
   * MFY CHEGARALARI (GeoJSON) — OMMAVIY IMPORT.
   *
   * ⚠️ `mahallas/:id` DAN OLDIN TURADI: NestJS yo'llarni E'LON
   * TARTIBIDA solishtiradi va pastda qo'yilsa, `/territory/mahallas/geo`
   * so'rovi `updateMahalla("geo")` ga tushib ketardi.
   *
   * ⚠️ `territory.manage` RUXSATI: chegara — hududiy kesimning
   * asosi va noto'g'ri import butun xaritani buzadi.
   */
  /**
   * XARITA CHEGARALARI — O'QISH.
   *
   * ⚠️ `reports.view` RUXSATI: chegara xaritaning tayanchi va
   * xaritani hisobot uchun kirgan odam ham ko'radi.
   */
  @Get("boundaries")
  @RequirePermissions("reports.view")
  boundaries() {
    return this.territory.boundaries();
  }

  /**
   * TUMAN CHEGARALARI (GeoJSON) — OMMAVIY IMPORT.
   *
   * ⚠️ `districts/:id` DAN OLDIN TURADI — MFY dagi ayni tuzoq:
   * NestJS yo'llarni E'LON TARTIBIDA solishtiradi va pastda
   * qo'yilsa, `/territory/districts/geo` so'rovi
   * `updateDistrict("geo")` ga tushib ketardi.
   */
  @Post("districts/geo")
  @RequirePermissions("territory.manage")
  importDistrictGeo(
    @Body() dto: ImportDistrictGeoDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.territory.importDistrictGeo(dto, toScope(user));
  }

  @Post("province/geo")
  @RequirePermissions("territory.manage")
  setProvinceGeo(
    @Body() dto: SetProvinceGeoDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.territory.setProvinceGeo(dto, toScope(user));
  }

  @Post("mahallas/geo")
  @RequirePermissions("territory.manage")
  importGeo(@Body() dto: ImportMahallaGeoDto, @CurrentUser() user: RequestUser) {
    return this.territory.importMahallaGeo(dto, toScope(user));
  }

  @Post("mahallas")
  @RequirePermissions("territory.manage")
  createMahalla(@CurrentUser() user: RequestUser, @Body() dto: CreateMahallaDto) {
    return this.territory.createMahalla(dto, toScope(user));
  }

  @Patch("mahallas/:id")
  @RequirePermissions("territory.manage")
  updateMahalla(
    @Param("id") id: string,
    @Body() dto: UpdateMahallaDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.territory.updateMahalla(id, dto, toScope(user));
  }

  @Patch("mahallas/:id/archive")
  @RequirePermissions("territory.manage")
  archiveMahalla(
    @Param("id") id: string,
    @Body() dto: ArchiveDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.territory.archiveMahalla(id, dto.archived, toScope(user));
  }
}
