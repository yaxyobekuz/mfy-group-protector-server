import { Body, Controller, Get, Param, Post, Query, Res } from "@nestjs/common";
import type { Response } from "express";

import {
  CurrentUser,
  RequirePermissions,
  type RequestUser,
} from "../../common/decorators";
import type { ScopeContext } from "../../common/scope.util";
import { ReportsService } from "./reports.service";
import { ReportsExportService } from "./reports-export.service";
import { ReportsAiService } from "./reports-ai.service";
import { AssistantBody, DailyQuery, ReportQuery } from "./dto/reports.dto";

const toScope = (user: RequestUser): ScopeContext => ({
  userId: user.id,
  role: user.role,
  scopeKind: user.scopeKind,
  districtId: user.districtId,
});

@Controller("reports")
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly exporter: ReportsExportService,
    private readonly assistant: ReportsAiService,
  ) {}

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

  /**
   * MFY KESIMI — ISSIQLIK XARITASI VA POLIGONLAR UCHUN.
   *
   * ⚠️ `map` DAN ALOHIDA: u faqat KOORDINATALI murojaatlarni
   * beradi (2000 ta bilan cheklangan), bu esa HAMMA murojaatni MFY
   * bo'yicha sanaydi — koordinatasizlarini ham.
   */
  @Get("mahalla-map")
  @RequirePermissions("reports.view")
  mahallaMap(@CurrentUser() user: RequestUser, @Query() query: ReportQuery) {
    return this.reports.mahallaMap(toScope(user), query);
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

  /**
   * TIZIMLI MUAMMOLAR — AYNI MFY, AYNI YO'NALISHDA QAYTA-QAYTA.
   *
   * ⚠️ UMUMIY KESIMDAN BOSHQA SAVOLGA JAVOB BERADI: "Kommunal
   * xizmatlar — 400 ta" degan qator hech narsa aytmaydi, "Turon MFY,
   * Ichimlik suvi — 3 oyda 14 marta" esa ANIQ ish buyurtmasi.
   */
  @Get("recurring")
  @RequirePermissions("reports.view")
  recurring(@CurrentUser() user: RequestUser, @Query() query: ReportQuery) {
    return this.reports.recurring(toScope(user), query);
  }

  /**
   * HISOBOTNI CSV QILIB YUKLAB OLISH.
   *
   * ⚠️ KESIM YO'LDA (`:kind`), QUERY DA EMAS: brauzer faylni URL
   * oxiridagi nomdan taxmin qiladi va `?kind=issues` bo'lsa fayl
   * `export` deb saqlanardi.
   *
   * ⚠️ QAMROV ODDIY HISOBOT BILAN AYNI: eksport `exportWhere` orqali
   * AYNI `where` ni ishlatadi. Alohida yozilsa, tuman xodimi
   * yuklab olgan faylda BOSHQA tumanlar ham chiqib ketardi — va
   * ekranda hammasi joyidek ko'rinardi.
   */
  @Get("export/:kind")
  @RequirePermissions("reports.view")
  async export(
    @CurrentUser() user: RequestUser,
    @Param("kind") kind: string,
    @Query() query: ReportQuery,
    @Res() response: Response,
  ): Promise<void> {
    const { filename, csv } = await this.exporter.export(kind, toScope(user), query);

    /**
     * ⚠️ `charset=utf-8` MAJBURIY: usiz brauzer faylni mahalliy
     * kodlashda saqlab, o'zbekcha matnni buzardi (BOM bilan birga
     * ikki qatlamli himoya).
     *
     * ⚠️ `attachment` — fayl SAQLANADI, brauzerda ochilmaydi: CSV
     * ni brauzer o'zi ko'rsatib qo'ysa, rahbariyat uni Excel'ga
     * ko'chirib o'tirardi.
     */
    response.setHeader("Content-Type", "text/csv; charset=utf-8");
    response.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    response.send(csv);
  }

  /**
   * HISOBOT YORDAMCHISI — KO'RSATKICH BO'YICHA SAVOL.
   *
   * ⚠️ `POST`, `GET` EMAS: savol 500 belgigacha bo'lishi mumkin va
   * uzun query satri proksi (nginx) chegarasiga urilardi — xato esa
   * 414 bo'lib, sababi tushunarsiz ko'rinardi.
   *
   * ⚠️ RUXSAT — `reports.view`: yordamchi YANGI ma'lumot
   * ko'rsatmaydi, u xodim allaqachon ko'ra oladigan raqamlarni
   * izohlaydi. Alohida ruxsat qo'shilsa, u hech kimga berilmay,
   * funksiya o'lik qolardi.
   */
  @Post("assistant")
  @RequirePermissions("reports.view")
  assistantAsk(@CurrentUser() user: RequestUser, @Body() body: AssistantBody) {
    return this.assistant.ask(body.question, toScope(user), body);
  }
}
