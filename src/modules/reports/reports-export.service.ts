/**
 * HISOBOTNI YUKLAB OLISH — RAHBARIYAT UCHUN.
 *
 * ── NIMA UCHUN XLSX, PDF EMAS ─────────────────────────────────────────
 *
 * ⚠️ RAHBARIYAT RAQAMNI QAYTA ISHLAYDI: hisobot ko'pincha boshqa
 * jadvalga ko'chiriladi, yig'iladi, taqdimotga qo'yiladi. PDF buni
 * BUTUNLAY to'sadi — undan raqamni qo'lda ko'chirish kerak bo'lardi.
 *
 * ── NIMA UCHUN CSV EMAS ───────────────────────────────────────────────
 *
 * ⚠️ CSV ESA JADVAL EMAS, MATN FAYLI: unda shrift ham, rang ham,
 * ustun kengligi ham yo'q va Excel uni HAR mintaqada boshqacha
 * o'qiydi (ajratgich, kodlash, uzun sonning ilmiy shaklga
 * aylanishi). Shuning uchun eksport XLSX ga ko'chirildi va butun
 * yasash mantiqi BITTA joyda — `common/xlsx.ts`.
 *
 * ⚠️ SHRIFT, RANG VA MARKAZLASH — O'SHA YAGONA MANBADA: har
 * kesimda qaytarilsa, bittasi albatta eskirardi va hisobotlar
 * boshqa-boshqa ko'rinishda chiqardi.
 *
 * ── RAQAM BO'LGANI SON BO'LIB YOZILADI ────────────────────────────────
 *
 * ⚠️ `count`, `population`, `per1000` — `number` turida uzatiladi,
 * `String()` ga o'ralmaydi: shundagina Excel'da ustunni yig'ish va
 * saralash ishlaydi. Qiymat yo'q bo'lsa `—` (matn) qoladi — `0`
 * yozilsa "muammo yo'q" degan NOTO'G'RI xulosa chiqardi
 * (`population` doktrinasi).
 *
 * ⚠️ `chatId`, telefon va murojaat raqami esa ATAYLAB matn
 * (`xlsxText`): ular raqamdan tuzilgan, lekin arifmetik qiymat
 * emas — son bo'lib yozilsa Excel ularni "chiroyli" qilib buzadi.
 */

import { BadRequestException, Injectable } from "@nestjs/common";

import type { ScopeContext } from "../../common/scope.util";
import { chatTypeLabel, guardApplies } from "../../common/chat-type";
import { formatDateTimeUz } from "../../common/date.util";
import { buildXlsx, xlsxText } from "../../common/xlsx";
import { PrismaService } from "../../prisma/prisma.service";
import { ReportsService } from "./reports.service";
import { ReportsCoverageService } from "./reports-coverage.service";
import type { ReportQuery } from "./dto/reports.dto";

/** Qiymat yo'q — `0` EMAS, chiziqcha. */
const DASH = "—";

/**
 * QALQON HOLATI — MFY KESIMIDAGI YORLIQLAR.
 *
 * ⚠️ `null` ("qalqon tegishli emas") CHIZIQCHA BO'LIB QOLADI:
 * kanalda ham, bot umuman yo'q MFY da ham o'chiriladigan begona
 * xabar yo'q (`common/chat-type.ts`). "Ishlamayapti" deb yozilsa,
 * xodim TUZATIB BO'LMAYDIGAN vazifa olardi va haqiqiy nosozlik
 * o'sha qatorlar orasida ko'rinmay ketardi.
 *
 * ⚠️ MATN PANELDAGI YORLIQLAR BILAN AYNI MA'NODA: fayl va ekran
 * bir xil holatni boshqacha atasa, xodim ularni ikki boshqa narsa
 * deb o'qirdi.
 */
const COVERAGE_GUARD: Record<string, string> = {
  ok: "Ishlaydi",
  "not-admin": "Admin emas",
  "no-delete": "O'chirish huquqi yo'q",
  none: DASH,
};

export interface ExportResult {
  filename: string;
  /** Tayyor XLSX — HTTP javobi bo'lib ketadi. */
  file: Buffer;
}

@Injectable()
export class ReportsExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: ReportsService,
    private readonly coverageService: ReportsCoverageService,
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
      case "categories":
        return this.categories(scope, query);
      case "issues":
        return this.issues(scope, query);
      case "coverage":
        return this.coverage(scope);
      case "unassigned-groups":
        return this.unassignedGroups();
      /**
       * ⚠️ AVVAL `default` UMUMIY KO'RINISHNI QAYTARARDI. "Hisobotlar"
       * sahifasi olib tashlangach (2026-11-25) umumiy ko'rinish,
       * hudud va takrorlanish kesimlari ham yo'q qilindi — jim
       * zaxiraga tushish esa XATO bo'lardi: noto'g'ri yozilgan kesim
       * nomi uchun odam BOSHQA hisobotni yuklab olib, buni
       * sezmasdi.
       */
      default:
        throw new BadRequestException("Bunday hisobot kesimi yo'q");
    }
  }

  // ═══════════════════════════════════════════════════════════════

  private stamp(): string {
    // ⚠️ FAYL NOMIDA SANA: rahbariyat bir necha hisobotni yonma-yon
    // saqlaydi va `hisobot.xlsx` ularning hammasini ustma-ust
    // yozardi.
    const now = new Date();
    return now.toISOString().slice(0, 10);
  }

  /**
   * ⚠️ FAYL NOMI VA VARAQ NOMI BIR JOYDA YASALADI: varaq nomsiz
   * qolsa Excel uni `Sheet1` deb ko'rsatadi va bir necha hisobotni
   * bitta kitobga ko'chirgan odam qaysi varaq nima ekanini
   * bilmasdi.
   */
  private sheet(
    slug: string,
    sheetName: string,
    headers: string[],
    rows: unknown[][],
  ): ExportResult {
    return {
      filename: `hisobot-${slug}-${this.stamp()}.xlsx`,
      file: buildXlsx({ name: sheetName, headers, rows }),
    };
  }

  private async categories(scope: ScopeContext, query: ReportQuery): Promise<ExportResult> {
    const data = await this.reports.byCategory(scope, query);

    const rows = data.map((item) => [
      // ⚠️ OTA YO'NALISH ALOHIDA USTUNDA, nom ichida emas:
      // Excel'da ustun bo'yicha guruhlash va saralash mumkin
      // bo'lishi kerak ("Kommunal xizmatlar → Suv" bitta satr
      // bo'lsa, buni qilib bo'lmasdi).
      item.parentName ?? DASH,
      item.name,
      item.count,
      item.overdue,
    ]);

    return this.sheet(
      "yonalishlar",
      "Yo'nalishlar",
      ["Asosiy yo'nalish", "Yo'nalish", "Murojaat", "Muddati o'tgan"],
      rows,
    );
  }

  /**
   * MUROJAATLAR RO'YXATI — XOM MA'LUMOT.
   *
   * ⚠️ CHEGARA BOR (5000): butun jadvalni bitta faylga aylantirish
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
      // ⚠️ MUROJAAT RAQAMI — MATN: u raqamdan tuzilgan bo'lsa ham
      // identifikator va Excel uni son deb o'qisa, boshidagi nol
      // yo'qolardi.
      xlsxText(issue.publicNo),
      issue.mahalla?.district.name ?? DASH,
      issue.mahalla?.name ?? DASH,
      issue.category.parent
        ? `${issue.category.parent.name} → ${issue.category.name}`
        : issue.category.name,
      issue.status,
      issue.priority,
      issue.source,
      issue.assignee
        ? `${issue.assignee.firstName} ${issue.assignee.lastName}`.trim()
        : DASH,
      issue.citizen
        ? `${issue.citizen.firstName} ${issue.citizen.lastName ?? ""}`.trim()
        : DASH,
      // ⚠️ TELEFON — MATN: son bo'lib yozilsa `+` yo'qolardi va
      // xodim raqamni qo'lda tiklab o'tirardi.
      xlsxText(issue.citizen?.phone ?? DASH),
      formatDateTimeUz(issue.createdAt),
      issue.dueAt ? formatDateTimeUz(issue.dueAt) : DASH,
      issue.reviewedAt ? formatDateTimeUz(issue.reviewedAt) : DASH,
      issue.duplicateOfId ? "ha" : "",
      issue.isSuspicious ? "ha" : "",
      issue.body.slice(0, 300),
    ]);

    return this.sheet(
      "murojaatlar",
      "Murojaatlar",
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
    );
  }

  // ════════════════════════════════════════════════════════════
  //  QAMROV
  // ════════════════════════════════════════════════════════════

  /**
   * TUMANLAR BO'YICHA QAMROV.
   *
   * ⚠️ FILTR OLINMAYDI (`ReportQuery` yo'q): qamrov — HOZIRGI
   * holat, davr kesimi emas. "O'tgan oyda bot nechta MFY da bor
   * edi" degan savol ma'nosiz: bugun nima qilish kerakligini
   * bilish uchun bugungi holat kerak.
   */
  private async coverage(scope: ScopeContext): Promise<ExportResult> {
    const [data, byMahalla] = await Promise.all([
      this.coverageService.coverage(scope),
      this.coverageService.mahallaCoverage(scope),
    ]);

    const rows: unknown[][] = data.districts.map((row) => [
      row.districtName,
      row.mahallaTotal,
      row.covered,
      row.notAttached,
      /**
       * {W} "FAQAT KANAL" USTUNI QALQON USTUNLARIDAN OLDIN TURADI:
       * u ikkisining MAXRAJINI tushuntiradi. Kanalda o'chiriladigan
       * begona xabar yo'q (`common/chat-type.ts`), ya'ni o'sha MFY
       * lar "admin emas" va "o'chirish huquqi yo'q" sonlariga
       * UMUMAN kirmaydi — ustun bo'lmasa, sonlar qo'shilmay
       * qolgani fayl ochgan odamga xato bo'lib ko'rinardi.
       */
      row.channelOnly,
      row.notAdmin,
      row.adminNoDelete,
      row.coverageRate ?? DASH,
    ]);

    /**
     * ⚠️ JAMI QATOR FAYLGA QO'SHILADI: rahbariyat faylni ochib,
     * ustunni o'zi yig'ib o'tirmasligi kerak — va qo'lda
     * yig'ilganda xato bo'lishi mumkin (arxivlangan MFY lar
     * hisobga olinmaydi, buni faqat server biladi).
     */
    rows.push([
      "JAMI",
      data.totals.mahallaTotal,
      data.totals.covered,
      data.totals.notAttached,
      data.totals.channelOnly,
      data.totals.notAdmin,
      data.totals.adminNoDelete,
      data.totals.coverageRate ?? DASH,
    ]);

    /**
     * HAR TUMAN — ALOHIDA VARAQ.
     *
     * ⚠️ "NECHTASI" VA "QAYSI BIRI" — IKKI BOSHQA SAVOL: birinchi
     * varaq rahbariyat uchun ("qaysi tumanga odam yuborish kerak"),
     * qolganlari esa ISHLASH uchun — xodim o'z tumanining varag'ini
     * ochib, bot kirmagan mahallalar RO'YXATINI oladi va raisga
     * qo'ng'iroq qiladi. Yakka jadvalda bu son bo'lib qolardi va
     * nomlar hech qayerda ko'rinmasdi.
     *
     * ⚠️ BIR FAYLDA, IKKITA EMAS: alohida yuklab olinsa, rahbariyat
     * ikki faylni yonma-yon ochib, qaysi qator qaysi varaqqa
     * tegishliligini o'zi izlab o'tirardi.
     *
     * ⚠️ MFY SI YO'Q TUMANGA VARAQ YASALMAYDI: bo'sh varaq faylni
     * shishirardi va uni ochgan odam "ma'lumot yo'qolibdi" deb
     * o'ylardi. Tuman birinchi varaqda "MFY jami — 0" bo'lib
     * baribir ko'rinadi.
     */
    const sheets = [
      {
        name: "Tumanlar",
        headers: [
          "Tuman",
          "MFY jami",
          "Bot bor",
          "Bot yo'q",
          "Faqat kanal",
          "Admin emas",
          "O'chirish huquqi yo'q",
          "Qamrov (%)",
        ],
        rows,
      },
      ...byMahalla
        .filter((district) => district.rows.length > 0)
        .map((district) => ({
          name: district.districtName,
          headers: ["MFY", "Holat", "Chatlar", "Qalqon"],
          rows: district.rows.map((row) => [
            row.mahallaName,
            /**
             * ⚠️ SO'Z BILAN, `ha`/`yo'q` BILAN EMAS: fayl rasmiy
             * hujjatga ko'chiriladi va "ulangan"/"ulanmagan" o'sha
             * yerda o'qiladigan matn bo'lib qoladi.
             */
            row.connected ? "Ulangan" : "Ulanmagan",
            /**
             * ⚠️ CHAT NOMLARI "ULANMAGAN" QATORDA HAM TURADI: o'sha
             * yerda ular ENG kerakli — guruh reyestrda bor, lekin
             * bot undan chiqarib yuborilgan degan holatni faqat shu
             * ustun ko'rsatadi (chora ham boshqa: guruh ochish emas,
             * botni qaytarish).
             */
            row.chats.join(", ") || DASH,
            COVERAGE_GUARD[row.guard ?? "none"],
          ]),
        })),
    ];

    return {
      filename: `hisobot-qamrov-${this.stamp()}.xlsx`,
      file: buildXlsx(sheets),
    };
  }

  /**
   * MFY BIRIKTIRILMAGAN GURUHLAR — ISHLASH UCHUN RO'YXAT.
   *
   * ⚠️ BU FAYL O'QISH UCHUN EMAS, ISHLASH UCHUN: xodim uni ochib,
   * har guruhni qaysi MFY ga tegishliligini aniqlaydi va panelda
   * biriktiradi. Shuning uchun `username` va a'zolar soni ham bor
   * — "Mahalla", "Guruh", "Yoshlar" kabi nomlar o'nlab va yakka
   * nom bo'yicha guruhni tanib bo'lmaydi.
   *
   * ⚠️ HAVOLA USTUNI ALOHIDA: `t.me/...` ni bosib, xodim guruhni
   * DARHOL ochib ko'radi. Usiz u `username` ni qo'lda ko'chirib,
   * brauzerga yozishi kerak bo'lardi — 50 ta guruh uchun bu
   * yarim kunlik ish.
   */
  private async unassignedGroups(): Promise<ExportResult> {
    const groups = await this.coverageService.unassignedGroups();

    const rows = groups.map((group) => [
      group.title,
      // {W} XOM `supergroup` EMAS, O'QILADIGAN NOM
      // (`common/chat-type.ts`): Telegram oddiy guruhni a'zo soni
      // oshganda jimgina supergroup'ga aylantiradi va jadvalda
      // ikki qiymat ikki boshqa narsadek ko'rinardi.
      chatTypeLabel(group.type),
      group.username ? `@${group.username}` : DASH,
      // ⚠️ HAVOLA FAQAT OMMAVIY GURUHDA bor: yopiq guruhda
      // `username` yo'q va u faqat taklif havolasi bilan ochiladi
      // (uni bot bermaydi).
      group.username ? `https://t.me/${group.username}` : DASH,
      group.memberCount ?? DASH,
      group.status,
      group.status === "administrator" ? "ha" : "",
      /**
       * {W} KANAL QATORIDA QALQON USTUNLARI `—`: u yerda qalqon
       * umuman ishga tushmaydi (`common/chat-type.ts`). "yo'q"
       * (bo'sh hujayra) deb yozilsa, xodim uni TUZATILADIGAN
       * bo'shliq deb o'qib, kanalga bekorga o'chirish huquqi
       * so'rab yurardi — va huquq berilgandan keyin ham hech
       * narsa o'zgarmasdi.
       */
      guardApplies(group.type) ? (group.canDeleteMessages ? "ha" : "") : DASH,
      group.isOfficial ? "ha" : "",
      guardApplies(group.type) ? (group.guardEnabled ? "ha" : "") : DASH,
      formatDateTimeUz(group.joinedAt),
      // ⚠️ `chatId` OXIRGI USTUNDA VA MATN SIFATIDA: u uzun manfiy
      // son va son bo'lib yozilsa Excel uni ilmiy shaklga
      // (`-1,00E+12`) aylantirib qo'yadi — xodim esa o'sha id ni
      // panelga ko'chirishi kerak.
      xlsxText(group.chatId),
    ]);

    return this.sheet(
      "biriktirilmagan-chatlar",
      "Biriktirilmagan guruh va kanallar",
      [
        // {W} "GURUH" EMAS, "CHAT": ro'yxatda kanal ham bor va
        // sarlavha uni chetlab o'tgandek ko'rinardi.
        "Nomi",
        "Turi",
        "Username",
        "Havola",
        "A'zolar",
        "Bot holati",
        "Admin",
        "O'chirish huquqi",
        "Kuzatuvda",
        "Qalqon",
        "Qo'shilgan",
        "Chat ID",
      ],
      rows,
    );
  }
}
