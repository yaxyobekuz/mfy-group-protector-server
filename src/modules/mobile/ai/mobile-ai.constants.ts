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
  // ⚠️ IKKI DARAJALI RO'YXAT: har yo'nalish ichida kichik
  // yo'nalishlar bor ("Kommunal xizmatlar → Ichimlik suvi") va
  // ro'yxatda ular "ASOSIY → Kichik" ko'rinishida beriladi. Model
  // ENG ANIQ yo'nalishni tanlamasa, butun bo'linishning ma'nosi
  // yo'qolardi — hamma murojaat yana "Kommunal xizmatlar"ga
  // tushardi.
  "- Ro'yxatda `ASOSIY → Kichik` ko'rinishidagi yozuvlar bor. ENG ANIQ",
  "  mos keladiganini tanlang: kichik yo'nalish mos kelsa, uning id'sini",
  "  bering, asosiysining id'sini EMAS.",
  "- Faqat hech bir kichik yo'nalish mos kelmasa, asosiy yo'nalishni tanlang.",
  // ⚠️ SHOSHILINCHLIK — KATEGORIYA, SOAT EMAS. Modeldan "necha
  // soat" deb so'ralsa, u o'ylab topilgan raqam qaytarardi (shlyuzda
  // `confidence: 0` tuzog'i bilan ayni xavf) va o'sha raqam
  // murojaatning MUDDATI bo'lib qolardi. Daraja esa SANALGAN
  // to'plam: uni soatga aylantirish KODDA, bitta jadval orqali.
  "- `urgency` — murojaat matnidan kelib chiqqan shoshilinchlik DARAJASI:",
  "  `emergency` — hayot yoki xavfsizlikka bevosita tahdid (gaz hidi,",
  "    uzilgan elektr simi, qulash xavfi, suv bosishi);",
  "  `urgent` — kundalik hayot to'xtagan (suv yo'q, isitish yo'q,",
  "    kanalizatsiya toshgan, elektr uzilgan);",
  "  `soon` — noqulaylik, lekin hayot davom etadi (chiroq yonmaydi,",
  "    yo'lda o'ra, chiqindi olinmagan);",
  "  `routine` — ariza, ma'lumot, taklif — shoshilinch emas.",
  "- Matn yozmang, izoh bermang, murojaat matnini qaytarmang.",
  // ⚠️ "PAST" ANIQ RAQAM BILAN: yuqoridagi "`0` yozma" qoidasi bilan
  // ziddiyat qolmasligi uchun. "Past" o'zi noaniq va model uni yana
  // `0` deb tushunishi mumkin edi.
  "- Mos yo'nalish topilmasa, ro'yxatdagi eng umumiy yo'nalishni",
  "  20-40 oralig'idagi `confidence` bilan tanlang.",
  "",
  "Javobni FAQAT shu JSON shaklida qaytar (boshqa hech narsa yozma):",
  '{"categoryId":"<id>","confidence":85,"priority":"normal","urgency":"soon"}',
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
    /**
     * ⚠️ `enum` SHU YERDA O'RINLI (`categoryId` dan farqli):
     * darajalar SANALGAN va ular panelda o'zgarmaydi. Model erkin
     * matn qaytarsa, sxema uni RAD ETADI — va bu to'g'ri, chunki
     * "juda shoshilinch" kabi qiymatni soatga aylantirib
     * bo'lmasdi.
     */
    urgency: {
      type: "string",
      enum: ["routine", "soon", "urgent", "emergency"],
    },
  },
  required: ["categoryId", "confidence", "priority", "urgency"],
  additionalProperties: false,
} as const;

/**
 * SHOSHILINCHLIK DARAJASI → TAVSIYA ETILGAN MUDDAT (soat).
 *
 * ── NIMA UCHUN JADVAL, MODELNING RAQAMI EMAS ───────────────
 *
 * ⚠️ MODELDAN "NECHA SOAT" DEB SO'RALMAYDI. Shlyuzda tirik
 * tekshirilgan tuzoq (`confidence: 0`) aynan shuni ko'rsatdi: sxema
 * buzilmagan, qiymat esa ma'nosiz — va hech narsa rad etmaydi. "6
 * soat" deb qaytarilgan raqam murojaatning MUDDATI bo'lib qolardi va
 * uning qayerdan kelgani hech qayerda ko'rinmasdi.
 *
 * ⚠️ JADVAL KODDA, SOZLAMADA EMAS: "gaz hidi — 4 soat" degan
 * qaror tashkiliy va u o'zgarganda kod bilan birga ko'rib chiqilishi
 * kerak. Sozlamaga chiqarilsa, kimdir uni tasodifan 720 soatga
 * qo'yib, barcha shoshilinch murojaatlar jimgina sekinlashardi.
 *
 * ⚠️ BU QIYMAT MUDDATNI O'ZI QO'YMAYDI — TAVSIYA. Muddatni
 * yo'nalish SLA'si yoki MFY qoidasi belgilaydi; AI tavsiyasi panelda
 * ALOHIDA ko'rsatiladi va uni XODIM bir bosishda qo'llaydi
 * (CLAUDE.md — "mobil AI: taklif, qaror emas").
 */
export const URGENCY_HOURS: Record<string, number> = {
  emergency: 4,
  urgent: 24,
  soon: 72,
  routine: 168,
};

/** Fuqaroga va panelga ko'rinadigan nom. */
export const URGENCY_LABELS: Record<string, string> = {
  emergency: "Favqulodda",
  urgent: "Shoshilinch",
  soon: "Tez orada",
  routine: "Oddiy",
};
