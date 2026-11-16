import { Body, Controller, Get, Param, Post, Query, Res } from "@nestjs/common";
import type { Response } from "express";

import {
  CurrentUser,
  RequirePermissions,
  type RequestUser,
} from "../../common/decorators";
import type { ScopeContext } from "../../common/scope.util";
import { XLSX_MIME } from "../../common/xlsx";
import { ReportsService } from "./reports.service";
import { ReportsExportService } from "./reports-export.service";
import { ReportsAiService } from "./reports-ai.service";
import { ReportsCoverageService } from "./reports-coverage.service";
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
    private readonly coverage: ReportsCoverageService,
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
  /**
   * QAMROV — BOT QAYSI MFY LARGA KIRGAN.
   *
   * ⚠️ RUXSAT — `reports.view`: bu YIG'MA son va aynan
   * rahbariyatga kerak ("qaysi tumanda qamrov past"). `groups.view`
   * qo'yilsa, hisobot uchun kirgan rahbar eng muhim bo'shliqni
   * ko'rmasdi — holbuki uni tuzatish buyrug'i o'shandan chiqadi.
   *
   * ⚠️ XOM RO'YXAT ESA `groups.view` BILAN (`export/unassigned-groups`):
   * unda guruh nomlari va havolalari bor, ya'ni u reyestr ishi —
   * hisobot emas.
   *
   * ⚠️ FILTR OLMAYDI: qamrov — HOZIRGI holat, davr kesimi
   * emas. "O'tgan oyda bot nechta MFY da bor edi" degan savol
   * ma'nosiz.
   */
  @Get("coverage")
  @RequirePermissions("reports.view")
  coverageReport(@CurrentUser() user: RequestUser) {
    return this.coverage.coverage(toScope(user));
  }

  @Get("recurring")
  @RequirePermissions("reports.view")
  recurring(@CurrentUser() user: RequestUser, @Query() query: ReportQuery) {
    return this.reports.recurring(toScope(user), query);
  }

  /**
   * HISOBOTNI XLSX QILIB YUKLAB OLISH.
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
  /**
   * MFY BIRIKTIRILMAGAN GURUHLAR RO'YXATI — XLSX.
   *
   * ⚠️ BU MARSHRUT `export/:kind` DAN OLDIN TURISHI SHART.
   * Ikkalasi ham ikki bo'lakli va Nest BIRINCHI mos kelganini
   * oladi: pastda tursa, so'rov `kind = "unassigned-groups"` bo'lib
   * UMUMIY handler'ga tushardi — va u `reports.view` bilan
   * himoyalangan, ya'ni guruh nomlari va havolalari hisobot uchun
   * kirgan odamga ham ochilib ketardi
   * (`security.controller.ts#bulkSetGuard` dagi ayni tuzoq).
   *
   * ⚠️ RUXSAT — `groups.view`: ro'yxatda guruh nomlari,
   * username va havolalar bor. Bu reyestr ishi — faylni ochgan
   * odam har guruhni MFY ga biriktirishi kerak.
   */
  @Get("export/unassigned-groups")
  @RequirePermissions("groups.view")
  async exportUnassignedGroups(
    @CurrentUser() user: RequestUser,
    @Query() query: ReportQuery,
    @Res() response: Response,
  ): Promise<void> {
    const { filename, file } = await this.exporter.export(
      "unassigned-groups",
      toScope(user),
      query,
    );

    this.sendFile(response, filename, file);
  }

  @Get("export/:kind")
  @RequirePermissions("reports.view")
  async export(
    @CurrentUser() user: RequestUser,
    @Param("kind") kind: string,
    @Query() query: ReportQuery,
    @Res() response: Response,
  ): Promise<void> {
    const { filename, file } = await this.exporter.export(kind, toScope(user), query);

    this.sendFile(response, filename, file);
  }

  /**
   * TAYYOR FAYLNI JAVOBGA QO'YADI — IKKI MARSHRUT UCHUN BITTA JOY.
   *
   * ⚠️ `Content-Type` — XLSX NING O'ZI (`XLSX_MIME`), `text/csv`
   * EMAS: noto'g'ri tur bilan Windows faylni Notepad'da ochishga
   * urinardi va rahbariyat "fayl buzilgan" degan xulosaga kelardi.
   *
   * ⚠️ `charset` QO'SHILMAYDI: XLSX — IKKILIK fayl (ichida ZIP) va
   * kodlash uning ichida yozilgan. Matn kodlashini e'lon qilish
   * ba'zi proksi-serverlarni faylni "tuzatishga" undaydi — natijada
   * baytlar buzilardi.
   *
   * ⚠️ `attachment` — fayl SAQLANADI, brauzerda ochilmaydi.
   *
   * ⚠️ `Content-Length` ATAYLAB QO'YILADI: brauzer yuklash
   * jarayonini foiz bilan ko'rsatishi uchun (5000 qatorli
   * murojaatlar fayli bir necha megabayt bo'lishi mumkin).
   */
  private sendFile(response: Response, filename: string, file: Buffer): void {
    response.setHeader("Content-Type", XLSX_MIME);
    response.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    response.setHeader("Content-Length", file.length);
    response.end(file);
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
