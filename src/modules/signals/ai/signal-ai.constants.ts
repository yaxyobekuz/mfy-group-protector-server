/**
 * AI TAHLILINING O'ZGARMAS QIYMATLARI VA PROMPTI.
 *
 * ⚠️ MODEL NOMI KODDA, SOZLAMADA EMAS. Model almashtirish — kod
 * o'zgarishi: u xulosaning sifatiga va javob shakliga ta'sir qiladi,
 * ya'ni review'dan o'tishi kerak. `.env` yoki panel sozlamasiga
 * chiqarilsa, kimdir uni tasodifan almashtirib, butun tahlil jim
 * buzilishi mumkin edi. `.env` dan faqat `AI_API_KEY` va shlyuz
 * manzili (`AI_BASE_URL`) o'qiladi.
 *
 * ⚠️ SHLYUZDA BITTA MODEL BOR. `GET /models` bitta yozuv qaytaradi
 * (`qwen3.5:122b`) — ya'ni "arzon model tanlash" masalasi endi YO'Q
 * va "nano" mulohazasi ham kuchini yo'qotdi: tanlov yo'q. Model
 * O'ZIMIZNING serverda ishlaydi, chaqiruv PUL YECHMAYDI.
 *
 * ⚠️ TEZLIK CHEGARASI ESA O'RNIDA QOLADI (`throttle.ts`): pul
 * sarflanmasa ham shlyuz BIR DONA va uni skript bilan to'ldirish
 * butun tahlilni (va mobil taklifni) sekinlashtirardi.
 */

import { SignalKind, SignalSeverity } from "@prisma/client";

/**
 * Tasnif modeli — shlyuzdagi YAGONA model (ko'rish/matn ikkisi ham).
 *
 * ⚠️ `AI-SERVER-CHEATSHEET.md` bo'yicha tekshirilgan.
 */
export const MODEL = "qwen3.5:122b";

/**
 * ⚠️ `temperature` YUBORILMAYDI. Avvalgi sabab (5.x modellari uni
 * qabul qilmaydi) endi tegishli emas, lekin yuborMASLIK qarori
 * ATAYLAB saqlanadi: bu TASNIFLASH ishi va tasodifiylik bu yerda
 * foyda bermaydi — bir xil xabar har aylanishda bir xil toifaga
 * tushishi kerak. Shlyuzning standart qiymati bizning ishimizga
 * mos.
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

/**
 * ⚠️ KAMAYTIRMANG — sabab O'ZGARDI, lekin chegara O'SHA QOLADI.
 *
 * Avvalgi sabab: 5.x "nano" javobdan OLDIN ichki o'ylashga token
 * sarflardi va u shu limitdan yeyilardi. `qwen3.5` da bu xatti-harakat
 * KAFOLATLANMAGAN — ya'ni "endi o'ylash yo'q, demak kamaytirsak
 * bo'ladi" deb xulosa qilish MUMKIN EMAS: qwen oilasi ham javobdan
 * oldin `<think>` bloki chiqarishi mumkin va u ham shu limitdan
 * yeyiladi.
 *
 * Qiymat saqlanadigan ASOSIY sabab esa modeldan mustaqil: 60 tagacha
 * xabarli to'plamda 10 tagacha signal + zaxira kerak. Past qiymat
 * JSON javobini YARMIDA kesib (`finish_reason: "length"`), guruhni har
 * aylanishda "tahlil qilinmadi" holatida qoldirardi va navbat o'sib
 * borardi.
 *
 * ⚠️ KONTEKST OYNASI TEKSHIRILMAGAN (`AI-SERVER-CHEATSHEET.md` →
 * "Not verified"): shlyuz bu qiymatni rad etsa, xato logga chiqadi
 * va to'plam navbatda qoladi — jim yo'qolmaydi.
 */
export const MAX_OUTPUT_TOKENS = 8000;

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
 *
 * ⚠️ `qwen3.5` KO'RSATMANI TAXMINAN BAJARADI (cheat sheet, §3: "reply
 * with one word: working" so'roviga "Yes" deb javob bergan). Ya'ni
 * prompt — KAFOLAT EMAS: javobning shakli `signal-ai.service.ts`
 * dagi `normalizeSignal` da QAYTA tekshiriladi (begona `kind`,
 * o'ylab topilgan `messageId` tashlanadi). Promptni kuchaytirish
 * o'sha tekshiruvning o'rnini BOSMAYDI — ikkisi birga ishlaydi.
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
  // ⚠️ "FAQAT RAQAM" ALOHIDA AYTILADI: avval "ro'yxatdagi # qiymati"
  // deyilgan edi va model raqamni `"#102"` deb, # belgisi BILAN
  // qaytarardi (shlyuzda tekshirilgan). Kodda ham tozalanadi
  // (`normalizeSignal`) — ikkisi birga ishlaydi.
  '- "messageId" — signal asos bo\'lgan xabarning raqami: FAQAT RAQAM,',
  '  "#" belgisisiz. Masalan "#102" xabari uchun "102" deb yoz.',
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

/**
 * JAVOB SXEMASI — `response_format: json_schema` uchun.
 *
 * ⚠️ NIMA UCHUN SXEMA, `json_object` EMAS: shlyuzda TEKSHIRILGANI —
 * `json_schema` (`AI-SERVER-CHEATSHEET.md`, §6). `json_object` rejimi
 * tekshirilmagan va shlyuz uni rad etsa tahlil BUTUNLAY ishlamay
 * qolardi.
 *
 * ⚠️ SXEMA SHAKLNI BERADI, QIYMATNI EMAS. Cheat sheet §6 da aniq
 * yozilgan: probe'da model sxemaga mos JSON qaytargan, lekin `enum`
 * dan TASHQARI erkin matn bergan. Shuning uchun `kind` va `severity`
 * ro'yxati bu yerda HAM, promptda HAM, `normalizeSignal` da HAM
 * bor — uchtasi bir-birining o'rnini bosmaydi:
 *
 *   prompt  → modelga nima kerakligini AYTADI
 *   sxema   → javob SHAKLINI (maydonlar, turlar) kafolatlaydi
 *   kod     → QIYMATNI tekshiradi (yagona ISHONCHLI nuqta)
 *
 * ⚠️ `enum` RO'YXATI `SignalKind` / `SignalSeverity` DAN OLINADI —
 * qo'lda yozilsa, Prisma'da yangi toifa qo'shilganda ikkisi jimgina
 * ajralib ketardi.
 */
export const SIGNALS_SCHEMA = {
  type: "object",
  properties: {
    signals: {
      type: "array",
      maxItems: MAX_SIGNALS,
      items: {
        type: "object",
        properties: {
          messageId: { type: "string" },
          kind: { type: "string", enum: Object.values(SignalKind) },
          severity: { type: "string", enum: Object.values(SignalSeverity) },
        },
        required: ["messageId", "kind", "severity"],
        additionalProperties: false,
      },
    },
  },
  required: ["signals"],
  additionalProperties: false,
} as const;
