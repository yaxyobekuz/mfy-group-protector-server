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
 * ⚠️ SHLYUZDA ENDI IKKI MODEL BOR — "tanlov yo'q" degan avvalgi izoh
 * ESKIRGAN. `GET /models` 2026-11-18 da ikki yozuv qaytardi:
 * `qwen3.5:122b` (biz ishlatayotganimiz) va `foundation-sec:8b`.
 * Ya'ni tanlov BOR, lekin u shu yerda — koddan — qilinadi va
 * almashtirish review'dan o'tadi: `foundation-sec:8b` boshqa
 * maqsadga qurilgan ancha kichik model va BU tasniflash ishida
 * TEKSHIRILMAGAN. Sinamasdan almashtirish tahlilni jim buzardi.
 * Batafsil: `AI-SERVER-CHEATSHEET.md`, §2.
 *
 * ⚠️ TANLOV NARXGA QARAB QILINMAYDI: model O'ZIMIZNING serverda
 * ishlaydi, chaqiruv PUL YECHMAYDI — ya'ni "arzonrog'ini tanlash"
 * masalasi yo'q va "nano" mulohazasi kuchini yo'qotgan. Qaraladigan
 * yagona narsa — xulosaning SIFATI.
 *
 * ⚠️ TEZLIK CHEGARASI ESA O'RNIDA QOLADI (`throttle.ts`): pul
 * sarflanmasa ham shlyuz BIR DONA va uni skript bilan to'ldirish
 * butun tahlilni (va mobil taklifni) sekinlashtirardi.
 */

import { SignalKind, SignalSeverity } from "@prisma/client";

/**
 * Tasnif modeli — shlyuzdagi IKKI modeldan ATAYLAB tanlangani.
 *
 * ⚠️ TIRIK TEKSHIRILGAN (2026-11-18): `json_schema` bilan 15
 * xabarlik to'plam 5/5 muvaffaqiyatli, o'rtacha ~1.4s,
 * `finish_reason: "stop"` — javob kesilmaydi va `messageId` to'g'ri
 * xabarlarga bog'landi.
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
 *
 * ⚠️ 60 DAN 15 GA TUSHIRILDI — TIRIK NOSOZLIKDAN KEYIN
 * (2026-11-17). Panelda "0 signal" turardi, navbatda esa 300 xabar:
 * HAR guruh, HAR aylanishda `Request timed out` bilan tushardi va
 * 24 guruhning birortasi ham tahlil qilinmasdi.
 *
 * ⚠️ XATO BIZNING CHEGARAMIZDAN KELMAGAN: `AI_TIMEOUT_MS` — 60
 * soniya, xato esa ~21 soniyada qaytardi, ya'ni so'rovni SHLYUZNING
 * O'ZI uzyapti. Bizning tomonda qilsa bo'ladigani — so'rovni
 * YENGILLASHTIRISH: 122B model uchun 60 ta xabarni bitta javobda
 * tasniflash og'ir ish.
 *
 * ⚠️ BU — CHETLAB O'TISH, TUZATISH EMAS: shlyuz butunlay to'xtagan
 * bo'lsa yordam bermaydi. Shuning uchun nosozlik logda ko'rinib
 * turadi va `failedGroups` sanoqchisi o'rnida qoladi.
 *
 * ⚠️ NAVBAT YO'QOLMAYDI, FAQAT SEKINLASHADI: bitta aylanishda
 * guruhdan 15 ta xabar olinadi, qolgani keyingisida. Job har
 * daqiqada uriladi, ya'ni 300 xabarlik navbat ham tez kamayadi.
 */
export const MAX_MESSAGES_PER_CALL = 15;

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
 * TAKRORNI BIRLASHTIRISH OYNASI — SOATDA.
 *
 * ⚠️ NIMA UCHUN KERAK: eng katta shovqin manbai — AYNI VOQEANI
 * qayta-qayta qaytarish. 2026-11-25 kesimida (4611 signal) bitta
 * svet uzilishi bir guruhda o'nlab signal bergan: "Сиветга нима
 * болди", "Свет хамада учдми", "Svet xammada o'chdimi", "Гулшанда
 * свет учди"... Hammasining ob'ekti BOR, ya'ni shovqin filtridan
 * O'TADI, matnlari esa boshqa-boshqa.
 *
 * Promptdagi "bitta signalga birlashtir" qoidasi bu yerda OJIZ:
 * guruhdan bir aylanishda 15 xabar olinadi va
 * model O'ZINING avvalgi xulosasini ko'rmaydi. Shuning uchun
 * birlashtirish KODDA qilinadi (`signals.service.ts#runAnalysis`).
 *
 * ⚠️ 6 SOAT — TIRIK MA'LUMOTDA TEKSHIRILGAN. 4611 signallik kesimda
 * 3 / 6 / 12 soatlik oynalar sinaldi va 6 soatda natija: 999 shovqin
 * + 935 takror olib tashlanadi, MUAMMOGA AYLANGAN 16 signaldan esa
 * BIRORTASI HAM butunlay yo'qolmaydi — 5 holatda o'rnida o'sha
 * guruhning o'sha mavzudagi boshqa signali qoladi.
 *
 * ⚠️ UZAYTIRISH XAVFLI: oyna qancha uzun bo'lsa, HAQIQIY yangi
 * shikoyat ("boshqa ko'chada ham suv o'chdi") avvalgisiga qo'shilib
 * ketish ehtimoli ortadi. 12 soatda qo'shimcha 108 signal
 * birlashgan, lekin foyda kam — shovqin asosan 6 soat ichida
 * yig'iladi.
 *
 * ⚠️ `high` JIDDIYLIK BU QOIDADAN OZOD (`runAnalysis`): xavfsizlik
 * va sog'liq masalasini "takror" deb yopish eng yomon natija
 * bo'lardi.
 */
export const DUPLICATE_WINDOW_HOURS = 6;

/**
 * PROMPTGA QO'SHILADIGAN "ALLAQACHON QAYD ETILGAN" YOZUVLARI SONI.
 *
 * ⚠️ CHEGARA KERAK: faol guruhda oynada o'nlab ochiq signal
 * yig'ilishi mumkin va hammasini promptga tiqish ASOSIY ishni
 * (xabarlarni o'qish) ko'mib tashlardi — ustiga
 * `MAX_OUTPUT_TOKENS` emas, KIRISH konteksti to'lib ketardi.
 *
 * ⚠️ ENG YANGILARI OLINADI: eski signal allaqachon ko'rilgan yoki
 * yopilgan bo'lishi mumkin, yangisi esa aynan HOZIR takrorlanayotgan
 * masala.
 */
export const MAX_RECENT_IN_PROMPT = 10;

/** "Allaqachon qayd etilgan" ro'yxatidagi bitta yozuvning uzunligi. */
export const MAX_RECENT_SUMMARY = 120;

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
 * AI ISHLAB CHIQARA OLADIGAN TOIFALAR — `SignalKind` NING QISMI.
 *
 * ⚠️ `SignalKind.question` ATAYLAB YO'Q. Prisma enum'ida u QOLADI
 * (eski yozuvlar va o'qish tomoni buzilmasligi uchun), lekin AI
 * endi uni QAYTARMAYDI.
 *
 * SABAB — TIRIK SHIKOYAT (2026-11-25): "birov savol bersa ham
 * signal sifatida saqlab olmoqda". "MFY qachon ishlaydi?",
 * "ma'lumotnoma uchun nima kerak?" degan ODDIY MA'LUMOT SO'RASH
 * navbatni to'ldirardi — holbuki shtab ko'rishi kerak bo'lgan narsa
 * MUAMMO, savol emas.
 *
 * ⚠️ SAVOL ORTIDAGI MUAMMO YO'QOLMAYDI: "suv qachon keladi?" —
 * shaklan savol, mazmunan SUV YO'Q degani va u `complaint` bo'lib
 * tushadi. Ya'ni toifa olib tashlandi, MAZMUN emas. Shuning uchun
 * promptda savolning ikki xili AJRATIB ko'rsatilgan.
 *
 * ⚠️ RO'YXAT QO'LDA YOZILADI, `Object.values(SignalKind)` EMAS —
 * aynan shu farq uchun. Prisma'ga yangi toifa qo'shilsa u bu yerga
 * O'ZI kelmaydi: AI nima qaytarishi — ALOHIDA qaror va u review'dan
 * o'tishi kerak.
 */
export const PRODUCIBLE_KINDS: readonly SignalKind[] = [
  SignalKind.complaint,
  SignalKind.suggestion,
];

/**
 * TAKLIF UCHUN ENG KAM JIDDIYLIK.
 *
 * ⚠️ TAKLIF FAQAT `high` BO'LSA OLINADI — sozlama qarori
 * (2026-11-25). Past va o'rta darajadagi taklif shtabga
 * ko'rsatilmaydi: u "hal qilinishi kerak bo'lgan muammo" emas,
 * balki fikr — va navbatni to'ldiradi.
 *
 * ⚠️ O'LCHANGAN: shu qoida kiritilgan paytda bazada 243 taklif
 * bor edi — 23 past, 211 o'rta, 9 yuqori. Ya'ni qoida 234 tasini
 * (96%) olib tashlaydi. Qolgan 9 tasi esa haqiqatan jiddiy
 * ("isitish pechidan dudburonsiz foydalanish gazdan
 * zaharlanishga va o'limga olib keladi", "shu zadvijkani
 * ko'chirish kerak") — ya'ni toifa BO'SH QOLMAYDI va butunlay
 * olib tashlash (`question` kabi) to'g'ri bo'lmasdi.
 *
 * ⚠️ `PRODUCIBLE_KINDS` DAN OLIB TASHLANMADI, ATAYLAB: taklif
 * hali ishlab chiqariladi, faqat jiddiyligi bo'yicha filtrlanadi.
 * Ro'yxatdan chiqarilsa, yuqoridagi 9 ta kabi xabarlar
 * `complaint` bo'lib yoki umuman yo'qolib ketardi.
 *
 * ⚠️ IKKI JOYDA QO'LLANADI va ikkisi bir-birining o'rnini
 * BOSMAYDI: promptda (model bekorga ishlamasligi uchun) va
 * `normalizeSignal` da (ishonchli nuqta — `kind` tekshiruvidagi
 * ayni mantiq, chunki sxema QIYMATNI majburlamaydi).
 */
export const SUGGESTION_MIN_SEVERITY: SignalSeverity = SignalSeverity.high;

/**
 * TIZIM PROMPTI.
 *
 * ⚠️ MISOLLAR HAQIQIY HOLATLARDAN. Dastlabki variantda faqat umumiy
 * ta'rif ("shikoyat, norozilik") bor edi va model XODIM haqidagi
 * hamda TIZIM haqidagi shikoyatni o'tkazib yuborardi — ular "oddiy
 * suhbat"ga o'xshab ko'rinadi. TA'RIF EMAS, MISOL ishlaydi.
 *
 * ⚠️ DOKTRINA TESKARI AYLANTIRILDI (2026-11-25) — TIRIK
 * SHIKOYATDAN KEYIN. Avval bu yerda "SHUBHADA — SIGNAL" turardi va
 * sabab shunday yozilgan edi: "ortiqcha signalni odam bir bosishda
 * yopadi, yo'qolgan shikoyatni esa hech kim qaytarib bera olmaydi".
 *
 * MULOHAZA O'ZI TO'G'RI, LEKIN AMALDA TESKARI ISHLADI: navbat
 * salomlashuv, oddiy savol va bir qatorli izohlar bilan to'lib
 * ketdi. "Bir bosish" arzon ko'rinadi, lekin u HAR signalga
 * ko'paytiriladi — va to'lib ketgan ro'yxatda operator hammasini
 * ko'rishni to'xtatadi. Ya'ni "ortiqcha signal" haqiqiy shikoyatni
 * YO'QOTMAYDI deb o'ylangan edi, aslida uni KO'MIB tashlaydi.
 *
 * ENDI: SHUBHADA — QAYTARMA. O'rnini `MUAMMO TESTI` bosadi — "kam
 * bo'lsin" degan umumiy ehtiyotkorlik EMAS (u haqiqiy shikoyatni
 * ham qirqardi), balki UCHTA ANIQ shart. Model "bu arziydimi?" deb
 * emas, "uchta shart bajarildimi?" deb qaraydi.
 *
 * ⚠️ NIMA YO'QOTILDI — OCHIQ AYTILADI: chegaraga yaqin, juda
 * qisqa va kontekstsiz shikoyat ("yana boshlandi") endi o'tmay
 * qolishi mumkin. Buning o'rnini `messageCount` qamrovi va
 * `replyToText` bosadi (xabar javob bo'lsa konteksti ko'rinadi),
 * lekin kafolat emas. O'lchov — `attachRate` (`reports.service.ts`):
 * u tushib ketsa test juda qattiq, 100% ga yopishsa juda yumshoq.
 *
 * ⚠️ PROMPT YOLG'IZ YETMADI — 2026-11-25, O'SHA KUNNING O'ZIDA
 * O'LCHANDI. Yuqoridagi qattiqlashtirish 11:01 da ishga tushdi va
 * keyingi aylanishlarda SHU FAYLDAGI misollarning O'ZI signal bo'lib
 * yozildi: "Ёнди" (A bandi), "Suv murojaat qilindi" (A bandi),
 * "Qayerda tosyapti" (C bandi), yalang'och facebook havolasi (D
 * bandi). 28 signaldan 14 tasi — keraksiz.
 *
 * XULOSA: promptga MATN QO'SHISH bu muammoni yechmaydi, chunki
 * chegara promptda emas — MODELDA (`AI-SERVER-CHEATSHEET.md` §3:
 * `qwen3.5` ko'rsatmani TAXMINAN bajaradi). Shuning uchun endi
 * mazmun KODDA ham tekshiriladi: `signal-noise.filter.ts`. Prompt
 * o'sha filtrning o'rnini BOSMAYDI va teskarisi ham to'g'ri —
 * ikkisi birga ishlaydi, `kind` tekshiruvidagi ayni mantiq bilan.
 *
 * ⚠️ "SAVOL" TOIFASI ISHLAB CHIQARILMAYDI — `PRODUCIBLE_KINDS`
 * izohiga qara.
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
  "Sen E Murojaat tizimining yordamchisisan.",
  "Senga mahalla (MFY) ning rasmiy Telegram guruhidan kelgan xabarlar beriladi — aholi va MFY xodimlari yozadi.",
  "Vazifang — ulardan HAL QILINISHI KERAK BO'LGAN MUAMMOlarni ajratish.",
  "",
  "═══ MUAMMO TESTI — ENG MUHIM QISM ═══",
  "",
  "Har bir xabardan UCHTA savolni so'ra. UCHTASIGA HAM \"ha\" bo'lsa —",
  "signal. Birortasiga \"yo'q\" bo'lsa — o'sha xabarni UMUMAN QAYTARMA.",
  "",
  "1) ANIQ NARSA BORMI? Nima buzilgan, yo'q, ishlamayapti, kech",
  "   qolgan yoki adolatsiz — aniq ob'ekt yoki holat ko'rsatilganmi?",
  "   Joy nomi ob'ekt EMAS: \"3-ko'chadayam yo'q\" da NIMA yo'qligi",
  "   aytilmagan.",
  "2) HALI HAL QILINMAGANMI? Guruhda javob berilgan, tuzatilgan yoki",
  "   tushuntirilgan bo'lsa — signal EMAS.",
  "3) MFY YOKI SHTAB CHORA KO'RA OLADIMI? Ular hal qila oladigan",
  "   masalami?",
  "",
  "AJRATILADIGAN TOIFALAR (faqat ikkitasi):",
  '- "complaint" — muammo, nosozlik, norozilik, javobsiz qolgan talab.',
  '- "suggestion" — ANIQ va amalga oshadigan taklif ("bekat shu yerga',
  '  qo\'yilsa"). Shunchaki istak ("hammasi yaxshi bo\'lsa edi") — EMAS.',
  "",
  // ⚠️ TAKLIF CHEGARASI — izoh `SUGGESTION_MIN_SEVERITY` da.
  "  ⚠️ TAKLIFNI FAQAT JIDDIY bo'lsa qaytar: odamning sog'lig'i yoki",
  "  xavfsizligiga, bolalarga yoki kommunal xavfga tegishli bo'lsa",
  '  ("isitish pechi dudburonsiz — zaharlanish xavfi", "quduq qopqog\'i',
  '  o\'rnatilsa"). Bunday taklifning "severity" si — "high".',
  '  Oddiy, maishiy yoki qulaylik taklifini ("skameyka qo\'yilsa",',
  '  "gullar ekilsa", "guruhga e\'lon tez tashlansa") UMUMAN QAYTARMA —',
  "  u shtab ko'radigan navbatga tushmaydi.",
  "  Shikoyatga bu chegara TEGISHLI EMAS: \"complaint\" har qanday",
  "  jiddiylikda qaytariladi.",
  "",
  // ⚠️ AVVAL BU RO'YXAT UCH JOYGA BO'LINGAN EDI
  // (`E'TIBORGA OLINMAYDI`, `YANA UCHTA HOLAT`, `QOIDALAR`) va
  // 2026-11-25 da uchinchi bo'lim qo'shilgandan KEYIN ham o'sha
  // bo'limlardagi SO'ZMA-SO'Z misollar signal bo'lib yozildi
  // ("Ёнди", "Suv murojaat qilindi", "Qayerda tosyapti", yalang'och
  // facebook havolasi). Ya'ni muammo ta'rifda emas — RO'YXAT
  // TARQOQ bo'lgani uchun model uni oxirigacha ushlab turmaydi.
  // Endi BITTA ro'yxat, nomlangan bandlar bilan.
  "═══ SIGNAL EMAS — BITTA RO'YXAT ═══",
  "",
  "A) JAVOBNING O'ZI yoki HAL QILINGANI. Xabar muammo haqida EMAS,",
  "   u HAL QILINGANI yoki qabul qilingani haqida:",
  '   "Suv murojaat qilindi, nazoratga kirdi", "Murojat qilingan,',
  '   siz siqilmang", "Ariza qabul qilindi", "tuzatildi", "brigada',
  '   yo\'lga chiqdi", "Ёнди", "yoqib berdik".',
  "   Bunday xabarda \"suv\" yoki \"gaz\" so'zi borligi uni shikoyat",
  "   QILMAYDI — KIM NIMA deyotganiga qara.",
  "",
  "B) MA'LUMOT SO'RAGAN SAVOL (pastdagi A xili).",
  "",
  "C) ANIQLASHTIRUVCHI SAVOL — xodim tafsilot so'rayotgan bo'lsa.",
  "   Muammoni o'sha so'ragan odam emas, AVVAL yozgan odam bildirgan:",
  '   "Qayerda toshyapti?", "Qaysi ko\'chada?", "Manzilni yozing",',
  '   "Raqamingizni qoldiring".',
  "",
  "D) MATNI YO'Q XABAR — faqat havola, faqat rasm/video, faqat",
  "   uzatilgan (forward) xabar:",
  '   "https://www.facebook.com/share/v/..." → QAYTARMA.',
  "   Havola YONIDA shikoyat yozilgan bo'lsa — o'sha matnga qara.",
  "",
  "E) TASDIQLASH VA QO'SHILISH (pile-on). Boshqa odamning gapini",
  "   takrorlash yoki tasdiqlash ALOHIDA signal EMAS:",
  '   "9 da ham yo\'q", "3-ko\'chadayam yo\'q", "bizda ham o\'chdi",',
  '   "hammada o\'chdimi?", "menda ham shunday".',
  "   Bular BIRINCHI xabarning signaliga QO'SHILADI, yangi signal",
  "   ochmaydi.",
  "",
  "F) OGOHLANTIRISH VA UZATILGAN XABAR — aholi bir-birini",
  "   ogohlantirsa, MFY chora ko'radigan masala YO'Q:",
  '   "ogoh bo\'linglar firibgarlar yuribdi", "diqqat, tarqatinglar",',
  '   "yangi virus tarqalmoqda", uzatilgan yangilik va voqea xabari.',
  "",
  "G) MFY NING O'Z E'LONLARI — eslatma, tadbir, yig'ilish va",
  "   REJALASHTIRILGAN ishlar haqidagi xabar:",
  '   "Amir Temur 2 ko\'chasida transformator ta\'mirlanadi, svet 20',
  '   daqiqaga o\'chadi" → bu OGOHLANTIRISH, shikoyat EMAS.',
  "",
  "H) QISQA ROZILIK VA SUHBAT — salomlashuv, minnatdorchilik,",
  '   tabrik, duo, maqtov, faqat smaylik, "ha", "ok", "rahmat",',
  '   "zo\'r"; oldi-sotdi e\'loni, reklama, ish taklifi; umumiy',
  '   mulohaza: "hayot qimmat", "shunday bo\'lib qoldi".',
  "",
  "I) ANIQ NARSASI YO'Q NOROZILIK — nima aynan ishlamayotgani",
  '   aytilmasa: "ishlar yomon", "hech narsa qilinmaydi",',
  '   "charchadik", "yana boshlandi".',
  "",
  "═══ SAVOL — ENG KO'P XATO QILINADIGAN JOY ═══",
  "",
  "Savol shaklidagi xabarning IKKI XILI bor:",
  "",
  'A) MA\'LUMOT SO\'RASH — SIGNAL EMAS. Ortida muammo YO\'Q:',
  '   "MFY qachon ishlaydi?", "ma\'lumotnoma uchun nima kerak?",',
  '   "yig\'ilish qachon?", "raisning raqami bormi?" → QAYTARMA.',
  "",
  'B) MUAMMONI BILDIRADIGAN SAVOL — "complaint". Savolning ichida',
  "   nimadir ishlamayotgani turadi:",
  '   "suv qachon keladi?" (= suv YO\'Q),',
  '   "axlat qachon olinadi?" (= olinmagan),',
  '   "nafaqam nega kelmadi?" (= kelmagan) → "complaint".',
  "",
  'FARQI: A da odam TARTIBNI so\'raydi, B da esa BUZILGAN narsani.',
  'Agar savoldan "demak hozir nimadir ishlamayapti" degan xulosa',
  "CHIQMASA — u signal emas.",
  "",
  "SHIKOYAT NIMA — MISOLLAR (hammasi signal bo'ladi):",
  '- KOMMUNAL: "suv yo\'q", "gaz kelmayapti", "svet o\'chib ketdi",',
  '  "issiq suv bermayapti", "kanalizatsiya toshib ketdi".',
  '- YO\'L: "yo\'l buzilgan", "chiroq yoqilmayapti", "quduq qopqog\'i',
  '  yo\'q", "avtobus kelmayapti".',
  '- TOZALIK: "axlat olib ketilmayapti", "hovli iflos".',
  '- XODIM haqida: "raisimiz telefonni ko\'tarmaydi", "hech kim javob',
  '  bermayapti", "falonchi aka qo\'pol gapiryapti".',
  '- IJTIMOIY: "nafaqa kelmadi", "ro\'yxatga olinmadik".',
  '- XAVFSIZLIK: "daraxt yiqilib tushadi", "bolalar maydonchasi',
  '  buzilgan", "it talayapti".',
  '- TIZIM: "ma\'lumotnoma berilmayapti", "navbat juda uzun".',
  "",
  "MUHIM: shikoyat QISQA va BEPARVO yozilgan bo'lishi mumkin —",
  '"suv yo\'q" kabi. RASMIY TIL TALAB QILMA: qisqa norozilikda ham',
  "ANIQ NARSA bo'lsa — u shikoyat. Kim yozganiga qarama — MFY",
  "xodimi yozgan tanqid ham signal bo'ladi.",
  "",
  "QOIDALAR:",
  "- SHUBHA BO'LSA — QAYTARMA. Muammo testidan o'tmagan xabar signal",
  "  EMAS. Ikkilanib qaytarilgan signallar navbatni to'ldirib,",
  "  HAQIQIY shikoyatni ko'mib tashlaydi.",
  "- LEKIN: test O'TGAN bo'lsa, xabar qisqa yoki beparvo yozilgani",
  "  uchun TASHLAMA. Qattiqlik ANIQLIKKA, uslubga EMAS.",
  "- Bir mavzudagi bir nechta xabarni BITTA signalga birlashtir va",
  "  ENG ANIQ aytilganini tanla (joy yoki tafsilot ko'rsatilganini).",
  "- Har xil mavzudagi shikoyatlarni ALOHIDA signal qil.",
  // ⚠️ "ALLAQACHON QAYD ETILGAN" BO'LIMI FOYDALANUVCHI XABARIDA
  // beriladi (`buildUserText`) — o'sha guruhning OCHIQ signallari.
  // Sabab: model bir aylanishda guruhdan faqat 15 xabar ko'radi va
  // O'ZINING avvalgi xulosasini KO'RMAYDI, ya'ni bitta svet
  // uzilishi ketma-ket to'plamlarda qayta-qayta signal bo'lardi
  // (2026-11-25 da o'lchangan). Kodda ham to'siladi
  // (`signal-noise.filter.ts#topicKey`) — ikkisi birga ishlaydi.
  "- Xabar oxirida \"ALLAQACHON QAYD ETILGAN\" bo'limi berilishi",
  "  mumkin. O'sha ro'yxatda turgan masala QAYTA signal QILINMAYDI —",
  "  garchi boshqa so'z bilan yozilgan bo'lsa ham. Faqat YANGI",
  "  masalani qaytar.",
  '- "messageId" — signal asos bo\'lgan xabarning raqami: FAQAT RAQAM,',
  '  "#" belgisisiz. Masalan "#102" xabari uchun "102" deb yoz.',
  '- "severity": "high" — odamning sog\'lig\'i yoki xavfsizligi, bolalar,',
  "  kommunal to'liq uzilish, takrorlanayotgan javobsizlik yoki xodim ustidan",
  '  jiddiy ayblov; "normal" — oddiy shikoyat/taklif; "low" — haqiqiy,',
  "  lekin MAYDA muammo. Eslatma: muammo bo'lmagan xabarni \"low\" deb",
  "  qaytarish ham XATO — u umuman qaytarilmaydi.",
  '- "categoryId" — xabar oxirida berilgan YO\'NALISHLAR ro\'yxatidan',
  "  eng mos kelganining id'si. FAQAT o'sha ro'yxatdagi id — o'zingdan",
  "  id O'YLAB TOPMA. Ro'yxatda aniq mos keladigani bo'lmasa, mazmunan",
  '  eng yaqinini yoki "Boshqa" yo\'nalishini tanla.',
  // ⚠️ "SVET" NI ALOHIDA AJRATISH KERAK — eski signallarni qayta
  // tasniflaganda o'lchangan (2026-11-25): yo'nalish tavsifi
  // berilgan bo'lsa ham model o'zbekcha "svet" ni "yoritish" deb
  // o'qib, UYDAGI elektr shikoyatini KO'CHA CHIROQLARIGA tashlardi —
  // "Ko'cha yoritish tizimi" ga tushgan 215 signaldan faqat 9 tasi
  // haqiqatan chiroq haqida edi. Nom va tavsif o'zi yetmagan,
  // chunki farq SO'ZLASHUV shaklida.
  '- "svet", "свет", "сивет", "тук", "фаза" — UYDAGI yoki mahalladagi',
  "  ELEKTR ta'minoti, ko'cha yoritishi EMAS. Ko'cha yoritishi faqat",
  '  ko\'chadagi chiroq/fonar haqida: "ko\'chada chiroq yonmaydi",',
  '  "ustun buzuq", "ko\'cha qorong\'i".',
  `- Eng ko'pi ${MAX_SIGNALS} ta signal qaytar. Hech narsa topilmasa — bo'sh ro'yxat.`,
  "",
  "⚠️ MATN YOZMA. Sen faqat TANLAYSAN va TOIFALAYSAN: qaysi xabar",
  "signalga arzishini, uning turini va yo'nalishini aytasan. Xabarning",
  "o'z matni panelda o'zi ko'rsatiladi — qisqartirish, izohlash yoki",
  "qayta yozish KERAK EMAS.",
  "",
  "Javobni FAQAT shu JSON shaklida qaytar (boshqa hech narsa yozma):",
  '{"signals":[{"messageId":"123","kind":"complaint","severity":"normal",' +
    '"categoryId":"clx123abc"}]}',
].join("\n");

/**
 * JAVOB SXEMASI — `response_format: json_schema` uchun.
 *
 * ⚠️ NIMA UCHUN SXEMA, `json_object` EMAS — SABAB O'ZGARDI, QAROR
 * O'SHA QOLDI. Avval "`json_object` tekshirilmagan, shlyuz uni rad
 * etsa tahlil ishlamay qoladi" deyilgan edi; 2026-11-18 da
 * tekshirildi va `json_object` ham ISHLAYDI (`AI-SERVER-CHEATSHEET.md`,
 * §6). Ya'ni endi tanlov xavfsizlik uchun emas, FOYDA uchun:
 * `json_object` faqat "JSON bo'lsin" deydi, `json_schema` esa
 * MAYDONLAR va TURLARNI ham bog'laydi — ya'ni `JSON.parse` dan
 * keyin `signals` massivi borligiga ishonish mumkin.
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
 * ⚠️ `severity` RO'YXATI `SignalSeverity` DAN OLINADI — qo'lda
 * yozilsa, Prisma'da yangi daraja qo'shilganda ikkisi jimgina
 * ajralib ketardi.
 *
 * ⚠️ `kind` ESA `PRODUCIBLE_KINDS` DAN, `SignalKind` dan EMAS. Bu
 * ATAYLAB: `SignalKind` da `question` hali bor (eski yozuvlar uchun),
 * lekin AI uni QAYTARMASLIGI kerak. `Object.values(SignalKind)`
 * yozilsa, model `question` ni yana qaytarishga haqli bo'lardi va
 * uni faqat `normalizeSignal` tutib qolardi — ya'ni model bekorga
 * ishlagan bo'lardi.
 *
 * ⚠️ `categoryId` — MAJBURIY MAYDON, lekin yaroqsizligi signalni
 * O'LDIRMAYDI: `normalizeSignal` da u `null` ga tushadi va signal
 * baribir yoziladi. Sabab — `mobile-ai` dan FARQLI o'laroq bu yerda
 * ASOSIY YUK signalning o'zi: begona yo'nalish id'si uchun HAQIQIY
 * shikoyatni tashlab yuborish eng yomon natija bo'lardi. (Mobil
 * taklifda esa taklifning O'ZI yuk — shuning uchun u `null`
 * qaytaradi.)
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
          kind: { type: "string", enum: [...PRODUCIBLE_KINDS] },
          severity: { type: "string", enum: Object.values(SignalSeverity) },
          categoryId: { type: "string" },
        },
        required: ["messageId", "kind", "severity", "categoryId"],
        additionalProperties: false,
      },
    },
  },
  required: ["signals"],
  additionalProperties: false,
} as const;
