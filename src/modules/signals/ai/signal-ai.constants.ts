/**
 * AI TAHLILINING O'ZGARMAS QIYMATLARI VA PROMPTI.
 *
 * ⚠️ MODEL NOMI KODDA, SOZLAMADA EMAS. Model almashtirish — kod
 * o'zgarishi: u xulosaning sifatiga, narxiga va javob shakliga ta'sir
 * qiladi, ya'ni review'dan o'tishi kerak. `.env` yoki panel
 * sozlamasiga chiqarilsa, kimdir uni tasodifan almashtirib, butun
 * tahlil jim buzilishi mumkin edi. `.env` dan faqat `OPENAI_API_KEY`
 * o'qiladi.
 *
 * ⚠️ NIMA UCHUN "NANO": bu ish kuniga ~48 marta va har safar o'nlab
 * xabar bilan ishlaydi. Vazifa esa og'ir emas — "bu gap shikoyatmi"
 * degan TASNIFLASH. Katta model bu yerda pulni bir necha o'n barobar
 * oshirib, aniqlikka deyarli qo'shmasdi.
 */

/** Tasnif modeli — arzon va tez. */
export const MODEL = "gpt-5.4-nano";

/**
 * ⚠️ `temperature` YUBORILMAYDI. 5.x oilasidagi modellar uni QABUL
 * QILMAYDI va so'rov 400 bilan rad etilardi — ya'ni tahlil butunlay
 * ishlamay qolardi. Buni faqat log'dan bilib olish mumkin.
 */
export const AI_TIMEOUT_MS = 60_000;
export const AI_MAX_RETRIES = 1;

/**
 * Bitta so'rovga ketadigan eng ko'p xabar.
 *
 * ⚠️ CHEGARA KERAK: faol MFY guruhida 30 daqiqada yuzlab xabar
 * yig'ilishi mumkin va hammasini bitta so'rovga tiqish kontekst
 * chegarasiga urardi. Ortig'i keyingi to'plamda ko'riladi — navbat
 * yo'qolmaydi.
 */
export const MAX_MESSAGES_PER_CALL = 60;

/** Modeldan so'raladigan eng ko'p signal — bitta to'plamdan. */
export const MAX_SIGNALS = 10;

/**
 * Kartada ko'rsatiladigan matnning eng uzun uzunligi.
 *
 * ⚠️ KESISH KERAK: uzun xabar butun ro'yxatni egallab, qolgan
 * signallarni pastga surib yuborardi. To'liq matn har doim "Xabarni
 * ochish" havolasida qoladi.
 */
export const MAX_SUMMARY = 300;

export const MAX_OUTPUT_TOKENS = 2000;

/**
 * TIZIM PROMPTI.
 *
 * ⚠️ MISOLLAR HAQIQIY HOLATLARDAN. Dastlabki variantda faqat umumiy
 * ta'rif ("shikoyat, norozilik") bor edi va model XODIM haqidagi
 * hamda TIZIM haqidagi shikoyatni o'tkazib yuborardi — ular "oddiy
 * suhbat"ga o'xshab ko'rinadi. TA'RIF EMAS, MISOL ishlaydi.
 *
 * ⚠️ "KAM BO'LSIN" DEYILMAYDI. Model ehtiyotkor bo'lsa haqiqiy
 * shikoyat yo'qoladi va ma'muriyat uni umuman ko'rmaydi. Ortiqcha
 * signalni odam bir bosishda "bu muammo emas" deb yopadi —
 * yo'qolgan shikoyatni esa hech kim qaytarib bera olmaydi. Shuning
 * uchun SHUBHADA — SIGNAL.
 *
 * ⚠️ MODEL MATN YOZMAYDI — faqat TANLAYDI va TOIFALAYDI. Panelda
 * ko'rinadigan matn XABARNING O'ZI; model o'ylab topgan gap u yerga
 * tusha olmaydi. Avval model qisqa sarlavha yozardi va u har safar
 * "...aytilgan" degan o'ramga aylanib, odamning o'z gapini
 * uzoqlashtirardi.
 */
export const SYSTEM_PROMPT = [
  "Sen viloyat shtabining yordamchisisan.",
  "Senga mahalla (MFY) ning rasmiy Telegram guruhidan kelgan xabarlar beriladi — aholi va MFY xodimlari yozadi.",
  "Vazifang — shtab KO'RISHI KERAK bo'lgan xabarlarni ajratish.",
  "",
  "AJRATILADIGAN TOIFALAR:",
  '- "complaint" — shikoyat, norozilik, e\'tiroz, nosozlik haqida xabar.',
  '- "suggestion" — taklif, yaxshilash istagi, "shunday qilish kerak" degan gap.',
  '- "question" — javobsiz qolgan savol.',
  "",
  "SHIKOYAT NIMA — MISOLLAR (hammasi signal bo'ladi):",
  '- KOMMUNAL: "suv yo\'q", "gaz kelmayapti", "svet o\'chib ketdi",',
  '  "issiq suv bermayapti", "kanalizatsiya toshib ketdi".',
  '- YO\'L VA INFRATUZILMA: "yo\'l buzilgan", "chiroq yoqilmayapti",',
  '  "quduq qopqog\'i yo\'q", "avtobus kelmayapti".',
  '- TOZALIK: "axlat olib ketilmayapti", "hovli iflos", "it ko\'paygan".',
  '- XODIM haqida: "raisimiz telefonni ko\'tarmaydi", "hech kim javob bermayapti",',
  '  "falonchi aka qo\'pol gapiryapti", "bu odamni almashtirish kerak".',
  '- IJTIMOIY: "nafaqa kelmadi", "yordam berilmayapti", "ro\'yxatga olinmadik".',
  '- XAVFSIZLIK: "daraxt yiqilib tushadi", "bolalar maydonchasi buzilgan",',
  '  "begona odamlar yuribdi", "it talayapti".',
  '- TIZIM/HUJJAT: "ma\'lumotnoma berilmayapti", "navbat juda uzun".',
  "",
  "MUHIM: shikoyat QISQA va BEPARVO yozilgan bo'lishi mumkin —",
  '"yo\'q", "kelmayapti", "qachon tuzatiladi" kabi. Rasmiy til va tafsilot',
  "talab QILMA: qisqa norozilik ham shikoyatdir. Kim yozganiga qarama —",
  "MFY xodimi yozgan tanqid ham signal bo'ladi.",
  "",
  "E'TIBORGA OLINMAYDI (bularni umuman qaytarma):",
  "- salomlashuv, minnatdorchilik, tabrik, xayrlashuv, duo;",
  '- faqat smaylik yoki "ha", "ok", "rahmat", "zo\'r" kabi qisqa roziliklar;',
  "- maqtov va ijobiy fikr;",
  "- MFY ning o'z e'lonlari, eslatmalari va tadbir xabarlari;",
  "- guruhda allaqachon javob berilgan savol;",
  "- oldi-sotdi e'lonlari, reklama, ish taklifi.",
  "",
  "QOIDALAR:",
  "- SHUBHA BO'LSA — SIGNAL QAYTAR. Ortiqcha signalni odam o'zi yopadi,",
  "  lekin o'tkazib yuborilgan shikoyat butunlay yo'qoladi.",
  "- Bir mavzudagi bir nechta xabarni BITTA signalga birlashtir.",
  "- Har xil mavzudagi shikoyatlarni ALOHIDA signal qil.",
  '- "messageId" — signal asos bo\'lgan xabarning raqami (ro\'yxatdagi "#" qiymati).',
  '- "severity": "high" — odamning sog\'lig\'i yoki xavfsizligi, bolalar,',
  "  kommunal to'liq uzilish, takrorlanayotgan javobsizlik yoki xodim ustidan",
  '  jiddiy ayblov; "normal" — oddiy shikoyat/taklif; "low" — mayda izoh.',
  `- Eng ko'pi ${MAX_SIGNALS} ta signal qaytar. Hech narsa topilmasa — bo'sh ro'yxat.`,
  "",
  "⚠️ MATN YOZMA. Sen faqat TANLAYSAN va TOIFALAYSAN: qaysi xabar",
  "signalga arzishini va uning turini aytasan. Xabarning o'z matni",
  "panelda o'zi ko'rsatiladi — qisqartirish, izohlash yoki qayta",
  "yozish KERAK EMAS.",
  "",
  "Javobni FAQAT shu JSON shaklida qaytar (boshqa hech narsa yozma):",
  '{"signals":[{"messageId":"123","kind":"complaint","severity":"normal"}]}',
].join("\n");
