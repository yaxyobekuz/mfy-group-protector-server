/**
 * SANA FORMATI — YAGONA MANBA (server).
 *
 * ⚠️ BU FAYLDAN BOSHQA JOYDA SANA MATNI YIG'ILMAYDI. Panelda ham,
 * botda ham ayni format: aholi Telegramda "21.05.2025", panelda
 * "21-may, 2025" ko'rmasligi kerak.
 *
 *   kun         →  21-may, 2025
 *   kun + vaqt  →  21-may, 2025 14:30
 *   oy          →  Yanvar, 2026
 *   vaqt        →  14:30
 *   oraliq      →  21-may, 2025 — 30-iyun, 2025
 *
 * ── TAQIQLANGAN ───────────────────────────────────────────────────────
 *
 * ⚠️ `toLocaleDateString()`, `toLocaleString()`, `Intl.DateTimeFormat`
 * va qo'lda yig'ilgan `${day}.${month}.${year}` shablonlari
 * ISHLATILMAYDI. Natija kod YOZILGAN joyga emas, kod ISHLAYOTGAN
 * muhitga bog'liq: konteyner locale'i, Node ICU qurilishi, OS
 * sozlamasi. Shu sababli bitta jadvalda bir ustun "21-may, 2025",
 * ikkinchisi "21.05.2025" bo'lib qolishi mumkin edi.
 *
 * ── ISTISNO — ISO QIYMAT FORMAT EMAS ──────────────────────────────────
 *
 * `toISOString()` RUXSAT ETILGAN, lekin faqat MASHINA o'qiydigan
 * joyda: API javobidagi xom qiymat, so'rov parametri, fayl nomi.
 * Ekranga chiqadigan matn esa shu fayldan o'tadi.
 *
 * ── VAQT MINTAQASI ────────────────────────────────────────────────────
 *
 * ⚠️ Butun tizim Asia/Tashkent (+5, DST yo'q). Server UTC'da ishlashi
 * mumkin, shuning uchun devor-soati QO'LDA hisoblanadi: `getHours()`
 * serverning zonasini beradi va u Toshkent bo'lishi SHART EMAS.
 */

/** Oy nomlari — kun bilan birga kelganda KICHIK harf. */
const MONTHS_UZ = [
  "yanvar",
  "fevral",
  "mart",
  "aprel",
  "may",
  "iyun",
  "iyul",
  "avgust",
  // ⚠️ IMLO QAT'IY: "sentabr"/"oktabr" — "sentyabr"/"oktyabr" EMAS.
  "sentabr",
  "oktabr",
  "noyabr",
  "dekabr",
] as const;

/** Mustaqil yorliq bo'lganda — KATTA harf ("Yanvar, 2026"). */
const MONTHS_UZ_CAP = MONTHS_UZ.map(
  (month) => month.charAt(0).toUpperCase() + month.slice(1),
);

/** Bo'sh yoki yaroqsiz qiymat — `Invalid Date` yoki bo'sh satr EMAS. */
const EMPTY = "—";

/** Toshkent (+5), DST yo'q. */
const TASHKENT_OFFSET_MINUTES = 5 * 60;

/**
 * Qiymatni `Date` ga keltiradi; yaroqsiz bo'lsa `null`.
 *
 * ⚠️ `new Date(undefined)` → `Invalid Date` va u xato OTMAYDI: keyingi
 * `getDate()` `NaN` qaytarib, ekranda "NaN-undefined, NaN" paydo
 * bo'lardi. Shuning uchun tekshiruv shu yerda, bir marta.
 */
const toDate = (value: Date | string | number | null | undefined): Date | null => {
  if (value === null || value === undefined || value === "") return null;

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/**
 * TOSHKENT DEVOR-SOATI.
 *
 * ⚠️ `getHours()` ISHLATILMAYDI: u SERVERNING zonasini beradi.
 * Konteynerda bu deyarli har doim UTC, ya'ni 14:30 Toshkent vaqti
 * "09:30" bo'lib chiqardi. Shuning uchun UTC qiymatiga +5 qo'shib,
 * `getUTC*` bilan o'qiymiz — natija zonadan QAT'IY NAZAR to'g'ri.
 */
const toTashkent = (date: Date): Date =>
  new Date(date.getTime() + TASHKENT_OFFSET_MINUTES * 60_000);

const pad = (value: number): string => String(value).padStart(2, "0");

/** "21-may, 2025" */
export const formatDateUz = (
  value: Date | string | number | null | undefined,
): string => {
  const date = toDate(value);
  if (!date) return EMPTY;

  const tz = toTashkent(date);
  // ⚠️ Kun raqami NOLDAN BOSHLANMAYDI: "3-yanvar", "03-yanvar" emas.
  return `${tz.getUTCDate()}-${MONTHS_UZ[tz.getUTCMonth()]}, ${tz.getUTCFullYear()}`;
};

/** "14:30" */
export const formatTimeUz = (
  value: Date | string | number | null | undefined,
): string => {
  const date = toDate(value);
  if (!date) return EMPTY;

  const tz = toTashkent(date);
  return `${pad(tz.getUTCHours())}:${pad(tz.getUTCMinutes())}`;
};

/** "21-may, 2025 14:30" */
export const formatDateTimeUz = (
  value: Date | string | number | null | undefined,
): string => {
  const date = toDate(value);
  if (!date) return EMPTY;

  return `${formatDateUz(date)} ${formatTimeUz(date)}`;
};

/** "Yanvar, 2026" — oy kaliti (YYYYMM) yoki sanadan. */
export const formatMonthUz = (
  value: number | Date | string | null | undefined,
): string => {
  if (typeof value === "number" && value >= 100_000) {
    // YYYYMM kaliti: 202601 → Yanvar, 2026
    const year = Math.floor(value / 100);
    const month = (value % 100) - 1;
    if (month < 0 || month > 11) return EMPTY;
    return `${MONTHS_UZ_CAP[month]}, ${year}`;
  }

  const date = toDate(value as Date | string | null | undefined);
  if (!date) return EMPTY;

  const tz = toTashkent(date);
  return `${MONTHS_UZ_CAP[tz.getUTCMonth()]}, ${tz.getUTCFullYear()}`;
};

/** "21-may, 2025 — 30-iyun, 2025" */
export const formatDateRangeUz = (
  from: Date | string | null | undefined,
  to: Date | string | null | undefined,
): string => {
  const start = toDate(from);
  const end = toDate(to);

  if (!start && !end) return EMPTY;
  if (!end) return `${formatDateUz(start)} —`;
  if (!start) return `— ${formatDateUz(end)}`;

  return `${formatDateUz(start)} — ${formatDateUz(end)}`;
};

/**
 * TOSHKENT KUNINING BOSHI (UTC instant sifatida).
 *
 * Hisobotda "bugun" / "kecha" ni hisoblash uchun.
 *
 * ⚠️ `Date.now() - 86400000` ISHLATILMAYDI: u "24 soat oldin"ni
 * beradi, "kechagi kunning boshi"ni emas. Ertalab 02:00 da
 * chaqirilganda ikkisi BOSHQA kunga tushadi.
 *
 * @param dayOffset 0 = bugun, -1 = kecha
 */
export const tashkentDayStart = (dayOffset = 0): Date => {
  const tz = toTashkent(new Date());

  // Toshkent kalendari bo'yicha kun boshini topamiz...
  const y = tz.getUTCFullYear();
  const m = tz.getUTCMonth();
  const d = tz.getUTCDate() + dayOffset;

  // ...so'ng UTC instantiga qaytaramiz (-5 soat).
  return new Date(Date.UTC(y, m, d, 0, 0, 0) - TASHKENT_OFFSET_MINUTES * 60_000);
};

/** Oy kaliti (YYYYMM) — Toshkent kalendari bo'yicha. */
export const tashkentMonthKey = (value: Date = new Date()): number => {
  const tz = toTashkent(value);
  return tz.getUTCFullYear() * 100 + tz.getUTCMonth() + 1;
};
