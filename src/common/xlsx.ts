/**
 * XLSX YASASH — YAGONA MANBA.
 *
 * ── NIMA UCHUN CSV EMAS, XLSX ─────────────────────────────────────────
 *
 * ⚠️ CSV — MATN FAYLI, JADVAL EMAS. Unda shrift ham, rang ham,
 * ustun kengligi ham yo'q: rahbariyat faylni ochganda uzun matnlar
 * qo'shni ustunga oqib ketadi, sarlavha qatori oddiy qator bo'lib
 * ko'rinadi va pastga aylantirganda qaysi ustun nima ekanini
 * eslab bo'lmaydi.
 *
 * ⚠️ VA CSV NI EXCEL HAR MINTAQADA BOSHQACHA O'QIYDI: ajratgich
 * (`,` yoki `;`), kodlash (BOM bor-yo'qligi), uzun sonning ilmiy
 * shaklga aylanishi — bularning har biri "tizim buzuq" degan
 * xulosaga olib boradigan JIM xato edi. XLSX da bu savollarning
 * HECH BIRI yo'q: kodlash faylning ichida, tur esa har hujayra
 * uchun ALOHIDA yozilgan.
 *
 * ── NIMA UCHUN YANGI PAKET QO'SHILMADI ────────────────────────────────
 *
 * ⚠️ `exceljs` — o'nlab megabayt bog'liqlik (`archiver`, `jszip`,
 * `unzipper`) va panelning boshqa HECH QAYERIDA ishlatilmaydi.
 * Bizga kerak bo'lgani esa uning imkoniyatlarining atigi bir
 * bo'lagi: formulasiz, rasmsiz, bitta sarlavha qatorli varaq.
 *
 * ⚠️ KO'P VARAQ KEYIN QO'SHILDI va u ham paket talab qilmadi:
 * `workbook.xml` ga yana bitta qator, ZIP ga yana bitta fayl.
 * Sabab — qamrov hisoboti: "qaysi MFY ulangan" degan savol tuman
 * kesimidagi jadvalga SIG'MAYDI (yuzlab qator) va alohida fayl
 * qilinsa, rahbariyat ikki faylni yonma-yon ochib solishtirardi.
 *
 * ⚠️ XLSX — ICHIDA XML BO'LGAN ZIP, ya'ni Node'ning O'Z `zlib` i
 * bilan yasaladi. Shuning uchun bu fayl bog'liqliksiz turadi va
 * `npm install` internetsiz muhitda ham sinmaydi.
 *
 * ── NIMA UCHUN `inlineStr`, `sharedStrings` EMAS ──────────────────────
 *
 * ⚠️ `sharedStrings.xml` matnlarni ALOHIDA faylga yig'ib, hujayrada
 * ularning RAQAMINI saqlaydi. Takrorlanadigan matnda u fayl
 * hajmini qisqartiradi, lekin indeks bir joyda SURILSA butun
 * jadval boshqa matnlarni ko'rsatib ketardi — va buni faqat
 * faylni ochgan odam sezardi. `inlineStr` da matn hujayraning
 * O'ZIDA turadi: surilish degan holat mavjud emas.
 *
 * ── TUR HUJAYRADA ANIQLANADI ──────────────────────────────────────────
 *
 * ⚠️ SON SON BO'LIB, MATN MATN BO'LIB YOZILADI: aks holda
 * "Murojaat" ustunini Excel'da yig'ib ham, saralab ham
 * bo'lmasdi — rahbariyatga esa aynan shu kerak.
 *
 * ⚠️ LEKIN HAMMA RAQAM SON EMAS: `chatId` (`-1001234567890`) uzun
 * manfiy son va Excel uni ilmiy shaklga (`-1,00E+12`) aylantirib
 * qo'yadi, telefon (`+998901234567`) esa `+` ni yo'qotadi.
 * Shuning uchun son sifatida yozilishi kerak bo'lgan qiymat
 * `number` turida kelishi SHART — satr ko'rinishida kelgan raqam
 * ATAYLAB matn bo'lib qoladi (`xlsxText`).
 */

import { deflateRawSync } from "node:zlib";

/**
 * ⚠️ RANG — PANEL MAVZUSIDAN OLINGAN (`--primary: 152 58% 28%`):
 * hisobot fayli panelning davomi bo'lib ko'rinishi kerak, chunki
 * uni ochgan odam bir daqiqa oldin o'sha paneldan yuklab olgan.
 */
const HEADER_FILL = "1E714A";
const HEADER_TEXT = "FFFFFF";
const BORDER = "D9D9D9";

/** ⚠️ ARIAL — TALAB: hisobot rasmiy hujjatga ko'chiriladi. */
const FONT = "Arial";
const FONT_SIZE = 11;

/** Ustun kengligi — belgida. */
const MIN_WIDTH = 10;
const MAX_WIDTH = 60;

/**
 * MATN SIFATIDA YOZILISHI KERAK BO'LGAN QIYMAT.
 *
 * ⚠️ `chatId`, telefon, murojaat raqami — raqamdan tuzilgan,
 * lekin ARIFMETIK qiymat emas: ularni qo'shib ham, o'rtachasini
 * olib ham bo'lmaydi. Son bo'lib yozilsa Excel ularni "chiroyli"
 * qilib buzadi (ilmiy shakl, boshidagi nolning va `+` ning
 * yo'qolishi).
 */
export class XlsxText {
  constructor(readonly value: string) {}
}

export const xlsxText = (value: unknown): XlsxText =>
  new XlsxText(value === null || value === undefined ? "" : String(value));

export interface XlsxSheet {
  /** Varaq nomi — Excel pastdagi yorliqda ko'rsatadi. */
  name: string;
  headers: string[];
  rows: unknown[][];
}

// ════════════════════════════════════════════════════════════════
//  XML
// ════════════════════════════════════════════════════════════════

/**
 * ⚠️ XML QOCHIRISH MAJBURIY: murojaat matnida `&`, `<`, `"` bo'lishi
 * ODATIY hol va qochirilmagan bitta belgi butun faylni "buzilgan"
 * qilib qo'yadi — Excel esa uni umuman ochmaydi va sababini
 * aytmaydi.
 *
 * ⚠️ BOSHQARUV BELGILARI TASHLANADI: ular XML 1.0 da TAQIQLANGAN
 * (hatto qochirilgan holda ham) va fuqaro yuborgan matnga
 * nusxa-ko'chirish orqali tushib qolishi mumkin.
 */
const xml = (value: string): string =>
  value
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

/** `0` → `A`, `26` → `AA`. */
const columnName = (index: number): string => {
  let name = "";
  let n = index;

  do {
    name = String.fromCharCode(65 + (n % 26)) + name;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);

  return name;
};

const DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

/**
 * USLUBLAR.
 *
 * `s="0"` — oddiy hujayra, `s="1"` — sarlavha.
 *
 * ⚠️ IKKI USLUB YETARLI va bu ataylab: har ustunga alohida uslub
 * berilsa, uslublar ro'yxati jadval bilan birga o'sib ketardi va
 * bitta indeks xato bo'lganda Excel faylni ochishdan BOSH
 * TORTADI (u uslub indeksini tekshiradi).
 *
 * ⚠️ `applyFont` / `applyAlignment` MAJBURIY: usiz Excel uslubdagi
 * qiymatlarni YOZIB QO'YADI, lekin QO'LLAMAYDI — fayl ochiladi,
 * hamma narsa joyida ko'rinadi, faqat markazlash va shrift
 * ishlamaydi.
 */
const STYLES = `${DECL}
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2">
<font><sz val="${FONT_SIZE}"/><name val="${FONT}"/><family val="2"/></font>
<font><b/><sz val="${FONT_SIZE}"/><color rgb="FF${HEADER_TEXT}"/><name val="${FONT}"/><family val="2"/></font>
</fonts>
<fills count="3">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF${HEADER_FILL}"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border>
<left style="thin"><color rgb="FF${BORDER}"/></left>
<right style="thin"><color rgb="FF${BORDER}"/></right>
<top style="thin"><color rgb="FF${BORDER}"/></top>
<bottom style="thin"><color rgb="FF${BORDER}"/></bottom>
<diagonal/>
</border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="2">
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

const cell = (ref: string, value: unknown, style: 0 | 1): string => {
  const raw = value instanceof XlsxText ? value.value : value;

  if (raw === null || raw === undefined || raw === "") {
    return `<c r="${ref}" s="${style}"/>`;
  }

  // ⚠️ `Infinity` VA `NaN` — XLSX DA MAVJUD EMAS: yozilsa Excel
  // faylni buzilgan deb hisoblaydi. Ular matnga aylantiriladi.
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return `<c r="${ref}" s="${style}"><v>${raw}</v></c>`;
  }

  if (typeof raw === "boolean") {
    return `<c r="${ref}" s="${style}" t="inlineStr"><is><t>${raw ? "ha" : ""}</t></is></c>`;
  }

  // ⚠️ `xml:space="preserve"` — boshida yoki oxirida bo'sh joyi bor
  // matn (MFY nomlari reyestrda shunday keladi) qirqilmasligi
  // uchun.
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(String(raw))}</t></is></c>`;
};

const displayLength = (value: unknown): number => {
  const raw = value instanceof XlsxText ? value.value : value;
  if (raw === null || raw === undefined) return 0;
  return String(raw).length;
};

/**
 * USTUN KENGLIGI — MAZMUNDAN.
 *
 * ⚠️ STANDART KENGLIK (8,43 belgi) deyarli HAR ustunga kam: MFY
 * nomi ham, sana ham, "Muddati o'tgan" sarlavhasining o'zi ham
 * sig'maydi. Fayl ochilganda esa `#####` yoki qirqilgan matn
 * ko'rinadi va rahbariyat har ustunni QO'LDA kengaytirib
 * o'tirardi.
 *
 * ⚠️ YUQORI CHEGARA BOR (60): murojaat matni 300 belgi va u
 * ustunni ekrandan chiqarib yuborardi. Chegaradan uzun matn
 * `wrapText` bilan hujayra ichida o'raladi.
 */
const widths = (sheet: XlsxSheet): number[] =>
  sheet.headers.map((header, index) => {
    const longest = sheet.rows.reduce(
      (max, row) => Math.max(max, displayLength(row[index])),
      displayLength(header),
    );

    return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, longest + 4));
  });

const worksheet = (sheet: XlsxSheet, first: boolean): string => {
  const cols = widths(sheet)
    .map(
      (width, index) =>
        `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`,
    )
    .join("");

  const header = sheet.headers
    .map((value, index) => cell(`${columnName(index)}1`, value, 1))
    .join("");

  const body = sheet.rows
    .map((row, rowIndex) => {
      const number = rowIndex + 2;
      const cells = sheet.headers
        .map((_, index) => cell(`${columnName(index)}${number}`, row[index], 0))
        .join("");

      return `<row r="${number}">${cells}</row>`;
    })
    .join("");

  const lastColumn = columnName(Math.max(0, sheet.headers.length - 1));
  const lastRow = sheet.rows.length + 1;

  /**
   * ⚠️ SARLAVHA QATORI MUZLATILADI (`pane ySplit="1"`): hisobotda
   * yuzlab qator bo'ladi va pastga aylantirgan odam qaysi ustun
   * nima ekanini KO'RMAY qolardi.
   *
   * ⚠️ `autoFilter` — saralash va filtr tugmalari: rahbariyat
   * faylni ochib "eng ko'p murojaatli tumanni" o'zi topadi.
   *
   * ⚠️ `tabSelected` FAQAT BIRINCHI VARAQDA: hammasida qoldirilsa,
   * Excel kitobni HAMMA varag'i belgilangan holatda ochadi va o'sha
   * paytda yozilgan har qiymat BARCHA varaqqa tushadi — fayl ochgan
   * odam buni sezmaydi.
   */
  return `${DECL}
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<dimension ref="A1:${lastColumn}${lastRow}"/>
<sheetViews>
<sheetView workbookViewId="0"${first ? ' tabSelected="1"' : ""}>
<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>
</sheetView>
</sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
<cols>${cols}</cols>
<sheetData><row r="1" ht="28" customHeight="1">${header}</row>${body}</sheetData>
<autoFilter ref="A1:${lastColumn}${lastRow}"/>
</worksheet>`;
};

/**
 * VARAQ NOMI — EXCEL CHEKLOVLARI.
 *
 * ⚠️ TAQIQLANGAN BELGILAR (`: \ / ? * [ ]`) va 31 belgidan uzun
 * nom faylni OCHILMAYDIGAN qiladi — "Tizimli muammolar (3 oyda)"
 * kabi nom esa tabiiy ravishda yoziladi.
 */
const sheetName = (name: string): string => {
  const safe = name.replace(/[:\\/?*[\]]/g, " ").trim();
  return safe.slice(0, 31).trim() || "Hisobot";
};

/**
 * VARAQ NOMLARI — TAKRORLANMASLIGI SHART.
 *
 * ⚠️ EXCEL BIR XIL NOMLI IKKI VARAQNI QABUL QILMAYDI va faylni
 * umuman ochmaydi ("tiklab bo'lmaydigan xato" deydi, sababini
 * aytmaydi). Tuman nomlari o'zi takrorlanmaydi, lekin ular 31
 * belgida KESILADI — ya'ni uzun nomli ikki tuman kesilgandan keyin
 * bir xil bo'lib qolishi mumkin.
 *
 * ⚠️ RAQAM OXIRIGA QO'SHILADI, NOM ESA QAYTA KESILADI: aks holda
 * "...tumani 2" 33 belgi bo'lib, ayni xatoni qaytarardi.
 */
const uniqueNames = (sheets: XlsxSheet[]): string[] => {
  const used = new Set<string>();

  return sheets.map((sheet) => {
    const base = sheetName(sheet.name);
    let name = base;
    let suffix = 2;

    while (used.has(name.toLowerCase())) {
      const tail = ` ${suffix}`;
      name = `${base.slice(0, 31 - tail.length).trim()}${tail}`;
      suffix += 1;
    }

    used.add(name.toLowerCase());
    return name;
  });
};

// ════════════════════════════════════════════════════════════════
//  ZIP
// ════════════════════════════════════════════════════════════════

const CRC_TABLE = (() => {
  const table = new Int32Array(256);

  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c;
  }

  return table;
})();

const crc32 = (buffer: Buffer): number => {
  let crc = -1;

  for (let i = 0; i < buffer.length; i += 1) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buffer[i]) & 0xff];
  }

  return (crc ^ -1) >>> 0;
};

interface ZipEntry {
  path: string;
  data: Buffer;
}

/**
 * ZIP — QO'LDA YIG'ILADI.
 *
 * ⚠️ `deflateRawSync`, `deflateSync` EMAS: ZIP ichidagi oqim aynan
 * "raw deflate" (zlib sarlavhasi YO'Q). Noto'g'risi ishlatilsa
 * arxiv ochilmaydi va xato "fayl buzilgan" bo'lib ko'rinardi —
 * sababi esa XML da emas, o'ramda bo'lardi.
 *
 * ⚠️ SANA `1980-01-01` DEB YOZILADI: arxiv ichidagi vaqt muhrini
 * hech kim o'qimaydi, lekin u o'zgarib tursa AYNI ma'lumotdan
 * yasalgan ikki fayl boshqa-boshqa bo'lib chiqardi va ularni
 * solishtirib bo'lmasdi.
 */
const zip = (entries: ZipEntry[]): Buffer => {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.path, "utf8");
    const compressed = deflateRawSync(entry.data, { level: 9 });
    const crc = crc32(entry.data);

    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // kerakli versiya
    local.writeUInt16LE(0x0800, 6); // UTF-8 nomlar
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(0, 10); // vaqt
    local.writeUInt16LE(33, 12); // sana — 1980-01-01
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    name.copy(local, 30);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(33, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);

    locals.push(local, compressed);
    centrals.push(central);
    offset += local.length + compressed.length;
  }

  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...locals, directory, end]);
};

// ════════════════════════════════════════════════════════════════

/**
 * XLSX YASAYDI — BITTA VARAQ YOKI BIR NECHTASI.
 *
 * ⚠️ XOTIRADA YIG'ILADI, diskka yozilmaydi: hisobot HTTP javobi
 * bo'lib ketadi va vaqtinchalik fayl qoldirish faqat tozalash
 * muammosini qo'shardi (eksport chegarasi — 5000 qator, ya'ni
 * hajm bashorat qilinadigan).
 *
 * ⚠️ BITTA VARAQ HAM AYNI YO'LDAN O'TADI (massivga o'raladi):
 * "bitta" va "ko'p" uchun ikki tana yozilsa, uslub yoki ustun
 * kengligi bir joyda o'zgarib, ikkinchisi eskirardi — eksport esa
 * olti kesimda chaqiriladi.
 *
 * ⚠️ VARAQ TARTIBI SAQLANADI: Excel ularni aynan shu ketma-ketlikda
 * ko'rsatadi va qamrov hisobotida BIRINCHISI — umumiy jadval.
 * Tuman varaqlari undan keyin turadi, ya'ni faylni ochgan odam avval
 * yig'ma sonni ko'radi.
 */
export const buildXlsx = (input: XlsxSheet | XlsxSheet[]): Buffer => {
  const sheets = Array.isArray(input) ? input : [input];
  if (sheets.length === 0) throw new Error("XLSX: varaq berilmadi");

  const names = uniqueNames(sheets);

  /**
   * ⚠️ USLUB OXIRGI `rId` NI OLADI: avval u `rId2` edi, chunki
   * varaq bitta bo'lgan. Varaqlar soni o'zgaruvchi bo'lgach, qotib
   * qolgan `rId2` ikkinchi varaqniki bilan TO'QNASHARDI — va Excel
   * bunday faylni ochishdan bosh tortadi.
   */
  const stylesId = `rId${sheets.length + 1}`;

  const overrides = sheets
    .map(
      (_, index) =>
        `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    )
    .join("\n");

  const list = names
    .map(
      (name, index) =>
        `<sheet name="${xml(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`,
    )
    .join("");

  const links = sheets
    .map(
      (_, index) =>
        `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
    )
    .join("\n");

  return zip([
    {
      path: "[Content_Types].xml",
      data: Buffer.from(
        `${DECL}
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
${overrides}
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`,
        "utf8",
      ),
    },
    {
      path: "_rels/.rels",
      data: Buffer.from(
        `${DECL}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
        "utf8",
      ),
    },
    {
      path: "xl/workbook.xml",
      data: Buffer.from(
        `${DECL}
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${list}</sheets>
</workbook>`,
        "utf8",
      ),
    },
    {
      path: "xl/_rels/workbook.xml.rels",
      data: Buffer.from(
        `${DECL}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${links}
<Relationship Id="${stylesId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
        "utf8",
      ),
    },
    { path: "xl/styles.xml", data: Buffer.from(STYLES, "utf8") },
    ...sheets.map((sheet, index) => ({
      path: `xl/worksheets/sheet${index + 1}.xml`,
      data: Buffer.from(worksheet(sheet, index === 0), "utf8"),
    })),
  ]);
};

/** HTTP sarlavhasi uchun — XLSX ning MIME turi. */
export const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
