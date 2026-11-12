/**
 * HISOBOTNI YUKLAB OLISH — RAHBARIYAT UCHUN.
 *
 * ── NIMA UCHUN CSV, PDF EMAS ──────────────────────────────────────────
 *
 * ⚠️ RAHBARIYAT RAQAMNI QAYTA ISHLAYDI: hisobot ko'pincha boshqa
 * jadvalga ko'chiriladi, yig'iladi, taqdimotga qo'yiladi. PDF buni
 * BUTUNLAY to'sadi — undan raqamni qo'lda ko'chirish kerak bo'lardi.
 * CSV esa Excel'da ham, Google Sheets'da ham to'g'ridan-to'g'ri
 * ochiladi.
 *
 * ⚠️ YANGI PAKET QO'SHILMADI (`exceljs`, `pdfkit`): CSV yasash 40
 * qatorga sig'adi va bu kutubxonalar o'nlab megabayt bog'liqlik
 * keltirardi — panelning boshqa joyida ular umuman ishlatilmaydi.
 *
 * ── UTF-8 BOM MAJBURIY ────────────────────────────────────────────────
 *
 * ⚠️ BOM'SIZ EXCEL (Windows) FAYLNI CP1251 deb o'qiydi va o'zbekcha
 * matn "Ð¢Ð¾Ð·Ð°Ð»Ð¸Ðº" bo'lib chiqadi. Buni ko'rgan odam "tizim
 * buzuq" deb xulosa qiladi — holbuki ma'lumot joyida.
 *
 * ⚠️ AJRATGICH — NUQTALI VERGUL, VERGUL EMAS: Excel'ning ruscha/
 * o'zbekcha mintaqaviy sozlamasida o'nlik ajratgich VERGUL va
 * vergulli CSV bitta ustunga yopishib qoladi.
 */

import { Injectable } from "@nestjs/common";

import type { ScopeContext } from "../../common/scope.util";
import { formatDateTimeUz } from "../../common/date.util";
import { PrismaService } from "../../prisma/prisma.service";
import { ReportsService } from "./reports.service";
import type { ReportQuery } from "./dto/reports.dto";

/** Excel (Windows) uchun — fayl boshidagi BOM. */
const BOM = "﻿";
const SEPARATOR = ";";

/**
 * ⚠️ QIYMAT QOCHIRILADI: MFY nomida ham, murojaat matnida ham
 * nuqtali vergul va qator uzilishi bo'lishi mumkin va ularsiz butun
 * jadval SURILIB ketardi.
 */
const cell = (value: unknown): string => {
  if (value === null || value === undefined) return "";

  const text = String(value);
  if (!/[";\n\r]/.test(text)) return text;

  return `"${text.replace(/"/g, '""')}"`;
};

const toCsv = (headers: string[], rows: unknown[][]): string =>
  BOM +
  [headers, ...rows]
    .map((row) => row.map(cell).join(SEPARATOR))
    .join("\r\n");

export interface ExportResult {
  filename: string;
  csv: string;
}

@Injectable()
export class ReportsExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: ReportsService,
  ) {}

  /**
   * ⚠️ KESIM NOMI BILAN TANLANADI, har kesim uchun alohida endpoint
   * EMAS: ular bitta tugmaning ortida turadi va yangi kesim
   * qo'shilganda controller'ga tegmaslik kerak.
   */
  async export(
    kind: string,
    scope: ScopeContext,
    query: ReportQuery,
  ): Promise<ExportResult> {
    switch (kind) {
      case "territory":
        return this.territory(scope, query);
      case "categories":
        return this.categories(scope, query);
      case "recurring":
        return this.recurring(scope, query);
      case "issues":
        return this.issues(scope, query);
      default:
        return this.overview(scope, query);
    }
  }

  // ═══════════════════════════════════════════════════════════════

  private stamp(): string {
    // ⚠️ FAYL NOMIDA SANA: rahbariyat bir necha hisobotni yonma-yon
    // saqlaydi va `hisobot.csv` ularning hammasini ustma-ust yozardi.
    const now = new Date();
    return now.toISOString().slice(0, 10);
  }

  private async overview(scope: ScopeContext, query: ReportQuery): Promise<ExportResult> {
    const data = await this.reports.overview(scope, query);

    /**
     * ⚠️ UMUMIY KESIM — \"KO'RSATKICH / QIYMAT\" USTUNLARIDA: unda har
     * xil turdagi raqamlar bor (son, foiz, soat) va ularni bitta
     * gorizontal qatorga tiqish Excel'da o'qib bo'lmaydigan jadval
     * berardi.
     */
    const rows: unknown[][] = [
      ["Jami murojaat", data.total],
      ["Yangi", data.status?.new ?? 0],
      ["Jarayonda", data.status?.in_progress ?? 0],
      ["Hal qilingan", data.status?.resolved ?? 0],
      ["Rad etilgan", data.status?.rejected ?? 0],
      ["Muddati o'tgan", data.overdue],
      ["Hal qilish ulushi (%)", data.resolutionRate ?? "—"],
      ["O'rtacha hal qilish (soat)", data.avgResolutionHours ?? "—"],
    ];

    return {
      filename: `hisobot-umumiy-${this.stamp()}.csv`,
      csv: toCsv(["Ko'rsatkich", "Qiymat"], rows),
    };
  }

  private async territory(scope: ScopeContext, query: ReportQuery): Promise<ExportResult> {
    const data = await this.reports.byTerritory(scope, query);

    /**
     * ⚠️ NISBIY KO'RSATKICH HAM USTUNDA: aynan u rahbariyatga
     * kerak — \"Asakada 450, Ulug'norda 50\" degan mutlaq son
     * tumanlarni solishtirishga yaramaydi.
     */
    const rows = data.districts.map((district) => [
      district.name,
      district.count,
      district.population ?? "—",
      district.per1000 ?? "—",
    ]);

    return {
      filename: `hisobot-tumanlar-${this.stamp()}.csv`,
      csv: toCsv(
        ["Tuman", "Murojaat", "Aholi", "1000 kishiga"],
        rows,
      ),
    };
  }

  private async categories(scope: ScopeContext, query: ReportQuery): Promise<ExportResult> {
    const data = await this.reports.byCategory(scope, query);

    const rows = data.map((item) => [
      // ⚠️ OTA YO'NALISH ALOHIDA USTUNDA, nom ichida emas:
      // Excel'da ustun bo'yicha guruhlash va saralash mumkin
      // bo'lishi kerak ("Kommunal xizmatlar → Suv" bitta satr
      // bo'lsa, buni qilib bo'lmasdi).
      item.parentName ?? "—",
      item.name,
      item.count,
      item.overdue,
    ]);

    return {
      filename: `hisobot-yonalishlar-${this.stamp()}.csv`,
      csv: toCsv(
        ["Asosiy yo'nalish", "Yo'nalish", "Murojaat", "Muddati o'tgan"],
        rows,
      ),
    };
  }

  private async recurring(scope: ScopeContext, query: ReportQuery): Promise<ExportResult> {
    const data = await this.reports.recurring(scope, query);

    const rows = data.items.map((item) => [
      item.district?.name ?? "—",
      item.mahallaName,
      item.parentName ? `${item.parentName} → ${item.categoryName}` : item.categoryName,
      item.total,
      item.incidents,
      item.duplicates,
      item.perMonth,
      item.firstAt ? formatDateTimeUz(item.firstAt) : "—",
      item.lastAt ? formatDateTimeUz(item.lastAt) : "—",
    ]);

    return {
      filename: `hisobot-tizimli-muammolar-${this.stamp()}.csv`,
      csv: toCsv(
        [
          "Tuman",
          "MFY",
          "Yo'nalish",
          "Jami",
          "Hodisa",
          "Takroriy",
          "Oyiga",
          "Birinchi",
          "Oxirgi",
        ],
        rows,
      ),
    };
  }

  /**
   * MUROJAATLAR RO'YXATI — XOM MA'LUMOT.
   *
   * ⚠️ CHEGARA BOR (5000): butun jadvalni CSV ga aylantirish
   * serverning xotirasini yeb qo'yardi va Excel ham uni ochmasdi.
   * Rahbariyatga kerak bo'lgani — kesim, xom ma'lumot esa tekshirish
   * uchun.
   *
   * ⚠️ MATN KESILADI (300 belgi): murojaat matni 2000 belgigacha
   * bo'lishi mumkin va u jadvalni o'qib bo'lmaydigan qilardi.
   */
  private async issues(scope: ScopeContext, query: ReportQuery): Promise<ExportResult> {
    const issues = await this.prisma.issue.findMany({
      where: this.reports.exportWhere(scope, query),
      orderBy: { createdAt: "desc" },
      take: 5000,
      select: {
        publicNo: true,
        title: true,
        body: true,
        status: true,
        priority: true,
        source: true,
        createdAt: true,
        dueAt: true,
        reviewedAt: true,
        isSuspicious: true,
        duplicateOfId: true,
        category: { select: { name: true, parent: { select: { name: true } } } },
        mahalla: { select: { name: true, district: { select: { name: true } } } },
        assignee: { select: { firstName: true, lastName: true } },
        citizen: { select: { firstName: true, lastName: true, phone: true } },
      },
    });

    const rows = issues.map((issue) => [
      issue.publicNo,
      issue.mahalla?.district.name ?? "—",
      issue.mahalla?.name ?? "—",
      issue.category.parent
        ? `${issue.category.parent.name} → ${issue.category.name}`
        : issue.category.name,
      issue.status,
      issue.priority,
      issue.source,
      issue.assignee
        ? `${issue.assignee.firstName} ${issue.assignee.lastName}`.trim()
        : "—",
      issue.citizen
        ? `${issue.citizen.firstName} ${issue.citizen.lastName ?? ""}`.trim()
        : "—",
      issue.citizen?.phone ?? "—",
      formatDateTimeUz(issue.createdAt),
      issue.dueAt ? formatDateTimeUz(issue.dueAt) : "—",
      issue.reviewedAt ? formatDateTimeUz(issue.reviewedAt) : "—",
      issue.duplicateOfId ? "ha" : "",
      issue.isSuspicious ? "ha" : "",
      issue.body.slice(0, 300),
    ]);

    return {
      filename: `hisobot-murojaatlar-${this.stamp()}.csv`,
      csv: toCsv(
        [
          "Raqam",
          "Tuman",
          "MFY",
          "Yo'nalish",
          "Holat",
          "Ustuvorlik",
          "Manba",
          "Ijrochi",
          "Yuborgan",
          "Telefon",
          "Kelgan",
          "Muddat",
          "Yopilgan",
          "Takroriy",
          "Shubhali",
          "Matn",
        ],
        rows,
      ),
    };
  }
}
