/**
 * TELEFON RAQAMI — YAGONA MANBA.
 *
 * ── NIMA UCHUN NORMALLASHTIRISH KERAK ─────────────────────────────────
 *
 * ⚠️ BIR ODAM RAQAMINI BESH XIL YOZADI: `+998 90 123-45-67`,
 * `998901234567`, `901234567`, `(90) 1234567`. Telegram esa
 * `contact.phone_number` ni `998901234567` ko'rinishida beradi —
 * ya'ni qo'lda yozilgan va ulashilgan raqam BIR XIL odamniki bo'lsa
 * ham, bazada IKKI XIL satr bo'lib yotardi. Keyin "shu raqam bilan
 * yana kim murojaat qilgan" degan savolga javob topib bo'lmasdi.
 *
 * ⚠️ SHUNING UCHUN BITTA SHAKL SAQLANADI: `+998901234567`. Panelda
 * ham, botda ham, ilovada ham AYNI ko'rinadi.
 *
 * ── NIMA UCHUN TEKSHIRUV SERVERDA ─────────────────────────────────────
 *
 * ⚠️ MIJOZDAGI MASKA — QULAYLIK, HIMOYA EMAS. Botga `qwerty` deb
 * yozish bir soniyalik ish va o'sha satr "aloqa telefoni" bo'lib
 * panelga tushardi — xodim qo'ng'iroq qilmoqchi bo'lib, raqam
 * yo'qligini bilardi. Tekshiruv SHU YERDA, oxirgi chegarada.
 *
 * ⚠️ XALQARO RAQAM HAM QABUL QILINADI (`+7…`, `+90…`): viloyatdagi
 * odamning qarindoshi chet elda bo'lishi mumkin va "faqat 998" degan
 * qoida uni murojaat yuborishdan butunlay to'sib qo'yardi.
 */

/** `Citizen.phone` ustuni va DTO chegarasi bilan AYNI. */
export const PHONE_MAX = 32;

/** O'zbekiston kod'i — milliy raqam 9 xonali. */
const UZ_CODE = "998";
const UZ_NATIONAL_LENGTH = 9;

/**
 * ⚠️ ENG QISQA XALQARO RAQAM — 8 xona (masalan, Solomon orollari).
 * Pastroq chegara "123" kabi tasodifiy terilgan raqamni o'tkazib
 * yuborardi.
 */
const MIN_DIGITS = 8;
const MAX_DIGITS = 15; // E.164 chegarasi

/**
 * Raqamni yagona shaklga keltiradi: `+998901234567`.
 *
 * ⚠️ `null` — RAQAM YAROQSIZ. Chaqiruvchi uni 400 bilan rad etadi;
 * jim `null` yozib qo'yish "saqladim" deb aldash bo'lardi.
 */
export const normalizePhone = (raw: string | null | undefined): string | null => {
  if (!raw) return null;

  const trimmed = raw.trim();
  if (!trimmed) return null;

  /**
   * ⚠️ `+` BOSHIDA BO'LSA ESLAB QOLINADI: `00998…` va `+998…` bir xil
   * ma'noda, lekin `0` lar raqam sifatida sanalib, uzunlik tekshiruvini
   * buzardi.
   */
  const hadPlus = trimmed.startsWith("+") || trimmed.startsWith("00");

  let digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;

  if (trimmed.startsWith("00")) digits = digits.replace(/^00/, "");

  // ── O'ZBEKISTON ───────────────────────────────────────────────────
  //
  // ⚠️ UCH HOLAT BIR XIL ODAMNI BILDIRADI:
  //   901234567      — milliy (odam shunday yozadi)
  //   998901234567   — Telegram shunday beradi
  //   8901234567     — eski ichki format (0 o'rniga 8)
  if (digits.length === UZ_NATIONAL_LENGTH && !hadPlus) {
    return `+${UZ_CODE}${digits}`;
  }

  if (digits.startsWith(UZ_CODE) && digits.length === UZ_CODE.length + UZ_NATIONAL_LENGTH) {
    return `+${digits}`;
  }

  if (
    !hadPlus &&
    digits.length === UZ_NATIONAL_LENGTH + 1 &&
    digits.startsWith("8")
  ) {
    return `+${UZ_CODE}${digits.slice(1)}`;
  }

  // ── XALQARO ───────────────────────────────────────────────────────
  if (digits.length < MIN_DIGITS || digits.length > MAX_DIGITS) return null;

  return `+${digits}`;
};

/**
 * ⚠️ KO'RSATISH UCHUN — SAQLASH UCHUN EMAS. Bazada har doim
 * `+998901234567` turadi; bu funksiya uni odam o'qiydigan shaklga
 * keltiradi (`+998 90 123 45 67`).
 */
export const formatPhone = (value: string | null | undefined): string | null => {
  if (!value) return null;

  const match = /^\+998(\d{2})(\d{3})(\d{2})(\d{2})$/.exec(value);
  if (!match) return value;

  return `+998 ${match[1]} ${match[2]} ${match[3]} ${match[4]}`;
};
