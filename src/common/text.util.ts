/**
 * MATN KESISH — UTF-16 JUFTLIGINI BUZMASDAN.
 *
 * ── NIMA UCHUN ALOHIDA FAYL ───────────────────────────────────────────
 *
 * ⚠️ `String.prototype.slice` EMOJINI YARMIDAN BO'LADI va bu TIRIK
 * NOSOZLIKKA olib kelgan (2026-11-24 → 11-25, 52 marta):
 *
 *   AI chaqiruvi muvaffaqiyatsiz: 400 Invalid JSON payload:
 *   no low surrogate in string: line 1 column 7503
 *
 * Sabab: emoji JavaScript'da IKKI `charCode` (surrogat juftligi) —
 * 💐 = `U+D83D U+DC90`. `slice(0, 120)` aynan ikkisining O'RTASIGA
 * tushsa, satr oxirida YOLG'IZ `U+D83D` qoladi. `JSON.stringify` uni
 * `\ud83d` deb yozadi, shlyuz esa bunday JSON'ni RAD ETADI.
 *
 * ⚠️ NATIJA JIM VA OG'IR BO'LGAN: bitta MFY guruhi
 * (`-1001481429000`) HAR aylanishda yiqilib, 24-noyabrdan beri
 * UMUMAN tahlil qilinmagan — 87 xabari navbatda qotib qolgan.
 * Panelda bu "guruhda muammo yo'q" bo'lib ko'rinardi. Faqat
 * `failedGroups` sanoqchisi va log ogohlantirardi, lekin xato
 * matni ("no low surrogate") sababni aytmaydi.
 *
 * ⚠️ NAVBAT TIQILIB QOLISHI — ASOSIY XAVF: xabarlar
 * `orderBy: sentAt asc` bilan olinadi, ya'ni qotgan ENG ESKI
 * xabarlar har aylanishda QAYTA tanlanadi va
 * `aiMaxMessagesPerRun` budjetini yeb, BOSHQA guruhlarni ham
 * tahlilsiz qoldira boradi. `sweep()` esa faqat tahlil
 * qilinganini o'chiradi — ya'ni o'zi tozalanmaydi.
 *
 * ── NIMA UCHUN KOD, "UZUNROQ KESAMIZ" EMAS ────────────────────────────
 *
 * ⚠️ CHEGARANI O'ZGARTIRISH YECHIM EMAS: 120 ni 121 qilsak, bu
 * xabar o'tadi va keyingisi (boshqa joyda emoji bo'lgani) yiqiladi.
 * Xato CHEGARADA emas, KESISH USULIDA.
 */

/**
 * Yolg'iz (juftsiz) surrogatlarni olib tashlaydi.
 *
 * ⚠️ TUZATISH EMAS, OXIRGI HIMOYA. `truncate` to'g'ri ishlaganda bu
 * funksiya hech narsa o'zgartirmaydi. Lekin yolg'iz surrogat
 * BIZNING kesishimizdan emas, MANBADAN ham kelishi mumkin:
 * Telegram buzilgan matn uzatsa yoki bot tomonida kesilgan bo'lsa.
 * O'sha holatda butun guruh yana jimgina to'xtab qolardi —
 * shuning uchun shlyuzga ketadigan matn OXIRIDA bir marta
 * tozalanadi ("prompt / sxema / kod" doktrinasidagi ayni mantiq:
 * ishonchli nuqta — kod).
 */
export function stripLoneSurrogates(text: string): string {
  return text.replace(
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,
    "",
  );
}

/**
 * Matnni `max` belgidan uzun bo'lsa kesadi — JUFTLIKNI BUZMASDAN.
 *
 * ⚠️ KESISH NUQTASI BIR BELGI ORQAGA SURILADI, agar u surrogat
 * juftligining O'RTASIGA tushsa. Ya'ni natija `max` dan bir belgi
 * qisqa bo'lishi mumkin — bu ATAYLAB: emojini yarmini saqlashdan
 * ko'ra, uni butunlay tashlash to'g'ri.
 *
 * @param suffix Kesilgani ko'rinib turishi uchun qo'shiladigan
 *   belgi. Bo'sh satr berilsa hech narsa qo'shilmaydi.
 */
export function truncate(text: string, max: number, suffix = "…"): string {
  if (text.length <= max) return text;

  let end = max;

  // ⚠️ YUQORI SURROGAT OXIRIDA QOLSA — BIR BELGI ORQAGA. `0xD800
  // ≤ kod ≤ 0xDBFF` — juftlikning BIRINCHI yarmi, ya'ni undan
  // keyin albatta ikkinchisi kelishi kerak edi.
  const code = text.charCodeAt(end - 1);
  if (code >= 0xd800 && code <= 0xdbff) end -= 1;

  return `${text.slice(0, end)}${suffix}`;
}
