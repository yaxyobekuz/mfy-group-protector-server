/**
 * MINI APP AI TAKLIFINING O'ZGARMAS QIYMATLARI.
 *
 * ⚠️ MODEL NOMI KODDA, SOZLAMADA EMAS — `signal-ai.constants.ts` bilan
 * AYNI qoida. `.env` dan faqat `OPENAI_API_KEY`.
 *
 * ⚠️ AI FAQAT TOIFANI TANLAYDI, matn YOZMAYDI. "Mobil AI — taklif,
 * qaror emas" doktrinasi: model fuqaro yozgan matnga qarab eng mos
 * `issue_categories` ni va ishonch foizini qaytaradi, xolos. Taklifni
 * fuqaroning o'zi 5-qadamda tasdiqlaydi.
 */

/** Tasnif modeli — `signal-ai` bilan AYNI model. */
export const MODEL = "gpt-5-nano";

export const AI_TIMEOUT_MS = 30_000;
export const AI_MAX_RETRIES = 1;

/**
 * ⚠️ KAMAYTIRMANG. 5.x "nano" javobdan oldin ichki o'ylashga token
 * sarflaydi (oddiy so'rovda ham ~1000 ta) va u shu limitdan yeyiladi.
 * Past qiymat JSON javobini yarmida kesib, taklif umuman chiqmasdi
 * (`signal-ai.constants.ts` dagi batafsil izoh).
 */
export const MAX_OUTPUT_TOKENS = 4000;

/**
 * TIZIM PROMPTI.
 *
 * ⚠️ MATN YOZISH TAQIQLANADI: model faqat berilgan toifalardan BIRINI
 * tanlaydi. `categoryId` ro'yxatdan bo'lishi SHART — begona id
 * (model o'ylab topgan) rad etiladi.
 *
 * ⚠️ TOIFALAR RO'YXAT SIFATIDA UZATILADI (user xabarida), promptda
 * emas: toifalar panelda o'zgaradi va ularni promptga muhrlab qo'yish
 * ikkisini ajratib yuborardi.
 */
export const SYSTEM_PROMPT = [
  "Siz O'zbekistondagi mahalla (MFY) fuqaro murojaatlarini tasniflaysiz.",
  "Sizga fuqaro yozgan murojaat matni va mavjud YO'NALISHLAR ro'yxati beriladi.",
  "Vazifangiz — murojaatga eng mos keladigan BITTA yo'nalishni tanlash.",
  "",
  "QOIDALAR:",
  "- `categoryId` FAQAT berilgan ro'yxatdagi id bo'lishi mumkin. O'zingiz id o'ylab topmang.",
  "- `confidence` — 0 dan 100 gacha butun son (qanchalik ishonchingiz).",
  "- `priority` — `low`, `normal`, `high` yoki `urgent` dan biri. Hayot/xavfsizlikka tahdid bo'lsa `urgent`.",
  "- Matn yozmang, izoh bermang, murojaat matnini qaytarmang.",
  "- Mos yo'nalish topilmasa, ro'yxatdagi eng umumiy yo'nalishni past `confidence` bilan tanlang.",
  "",
  "Javobni FAQAT shu JSON shaklida qaytar (boshqa hech narsa yozma):",
  '{"categoryId":"<id>","confidence":85,"priority":"normal"}',
].join("\n");
