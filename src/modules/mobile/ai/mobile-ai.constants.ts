/**
 * MINI APP AI TAKLIFINING O'ZGARMAS QIYMATLARI.
 *
 * ⚠️ MODEL NOMI KODDA, SOZLAMADA EMAS — `signal-ai.constants.ts` bilan
 * AYNI qoida. `.env` dan faqat `AI_API_KEY` va `AI_BASE_URL`.
 *
 * ⚠️ AI FAQAT TOIFANI TANLAYDI, matn YOZMAYDI. "Mobil AI — taklif,
 * qaror emas" doktrinasi: model fuqaro yozgan matnga qarab eng mos
 * `issue_categories` ni va ishonch foizini qaytaradi, xolos. Taklifni
 * fuqaroning o'zi 5-qadamda tasdiqlaydi.
 */

/**
 * Tasnif modeli — `signal-ai` bilan AYNI model.
 *
 * ⚠️ TANLOV YO'Q: shlyuzda bitta model bor (`AI-SERVER-CHEATSHEET.md`
 * → `GET /models` bitta yozuv qaytaradi). Ikkisi "tasodifan bir xil"
 * emas, shunday BO'LISHI SHART edi ham: ikki joyda boshqa model
 * ishlatilsa, bir xil matn guruh oqimida va mobil oqimda boshqa-boshqa
 * toifaga tushardi.
 */
export const MODEL = "qwen3.5:122b";

export const AI_TIMEOUT_MS = 30_000;
export const AI_MAX_RETRIES = 1;

/**
 * ⚠️ KAMAYTIRMANG — sabab o'zgardi, chegara qoldi
 * (`signal-ai.constants.ts` dagi batafsil izoh). `qwen3.5` ham
 * javobdan oldin ichki o'ylash bloki chiqarishi MUMKIN va u shu
 * limitdan yeyiladi. Past qiymat JSON javobini yarmida kesib, taklif
 * umuman chiqmasdi.
 *
 * ⚠️ `signal-ai` dan KICHIK bo'lishi ATAYLAB: bu yerda javob bitta
 * obyekt (bitta toifa), u yerda 10 tagacha signal ro'yxati.
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
  // ⚠️ DARAJALAR ANIQ AYTILADI. Avval faqat "0 dan 100 gacha butun son
  // (qanchalik ishonchingiz)" deyilgan edi va `qwen3.5` TO'G'RI
  // yo'nalishni tanlab, `confidence` ni `0` deb qaytarardi (shlyuzda
  // 2/2 takrorlangan). `0` sxemada HAQIQIY qiymat, ya'ni kod uni rad
  // etmaydi — fuqaroga esa "Tizim bu murojaat ... mos deb hisoblaydi
  // (0%)" deb ko'rsatilardi: TO'G'RI taklif ustida 0% yozuvi uni
  // rad etishga undardi. Oraliqlar berilgandan keyin javob 95-98 ga
  // ko'tarildi.
  "- `confidence` — 0 dan 100 gacha BUTUN SON va u sizning ishonch",
  "  DARAJANGIZ: to'liq mos bo'lsa 90-100, o'rtacha bo'lsa 50-80,",
  "  zo'rg'a taxmin qilsangiz 20-40.",
  '- `0` YOZMA — u "umuman mos emas" degani.',
  "- `priority` — `low`, `normal`, `high` yoki `urgent` dan biri. Hayot/xavfsizlikka tahdid bo'lsa `urgent`.",
  "- Matn yozmang, izoh bermang, murojaat matnini qaytarmang.",
  // ⚠️ "PAST" ANIQ RAQAM BILAN: yuqoridagi "`0` yozma" qoidasi bilan
  // ziddiyat qolmasligi uchun. "Past" o'zi noaniq va model uni yana
  // `0` deb tushunishi mumkin edi.
  "- Mos yo'nalish topilmasa, ro'yxatdagi eng umumiy yo'nalishni",
  "  20-40 oralig'idagi `confidence` bilan tanlang.",
  "",
  "Javobni FAQAT shu JSON shaklida qaytar (boshqa hech narsa yozma):",
  '{"categoryId":"<id>","confidence":85,"priority":"normal"}',
].join("\n");

/**
 * JAVOB SXEMASI — `response_format: json_schema` uchun.
 *
 * ⚠️ `json_object` EMAS: shlyuzda tekshirilgani — `json_schema`
 * (`AI-SERVER-CHEATSHEET.md`, §6). `signal-ai` bilan AYNI sabab.
 *
 * ⚠️ `categoryId` ga `enum` QO'YILMAYDI (`kind` dan farqli): toifalar
 * ro'yxati PANELDAN keladi va har so'rovda boshqacha bo'ladi — ya'ni
 * uni muhrlab qo'yish "Yo'nalishlar ilovaga alohida ochilmaydi"
 * qoidasini buzardi. Ro'yxat user xabarida uzatiladi va id
 * `mobile-ai.service.ts` da `valid` to'plamiga solib TEKSHIRILADI
 * (begona id rad etiladi) — sxema bu tekshiruvning o'rnini
 * BOSMAYDI.
 */
export const SUGGESTION_SCHEMA = {
  type: "object",
  properties: {
    categoryId: { type: "string" },
    confidence: { type: "integer", minimum: 0, maximum: 100 },
    priority: { type: "string", enum: ["low", "normal", "high", "urgent"] },
  },
  required: ["categoryId", "confidence", "priority"],
  additionalProperties: false,
} as const;
