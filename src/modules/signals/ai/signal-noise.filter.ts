/**
 * SHOVQIN FILTRI — PROMPTDAN KEYINGI, KOD DARAJASIDAGI TO'SIQ.
 *
 * ⚠️ NIMA UCHUN UMUMAN KERAK — PROMPT ISHLAMADI. 2026-11-25 da
 * prompt qattiqlashtirildi ("SHUBHADA — QAYTARMA", `MUAMMO TESTI`,
 * uchta qo'shimcha holat) va 11:01 da ishga tushdi. Keyingi
 * aylanishlarda PROMPTDA OCHIQ TAQIQLANGAN signallar BARIBIR
 * o'tib ketdi:
 *
 *   "Ёнди"                          → 1-holat: "javobning o'zi"
 *   "...5да худо хохласа йокиб берамиз" → MFY ning javobi
 *   "Амур Темур 2 ... свет 20 минутга учади" → MFY ning e'loni (2 marta)
 *   "Svet xammada o'chdimi"         → A-xil (ma'lumot so'rash)
 *   "9 да хам йук", "3 нчи кучадаям йук" → "aniq narsasi yo'q"
 *   "Qayerda tosyapti"              → 2-holat: aniqlashtiruvchi savol
 *   "https://www.facebook.com/..."  → 3-holat: matni yo'q xabar
 *
 * Ya'ni promptga matn QO'SHISH bu muammoni yechmaydi — bir marta
 * sinab ko'rilgan. `AI-SERVER-CHEATSHEET.md` §3 ning o'zi ham
 * `qwen3.5` ko'rsatmani TAXMINAN bajarishini yozib qo'ygan.
 *
 * ⚠️ O'LCHOV — NEGA BU SHOSHILINCH. 18–25 noyabr: 4586 signal
 * yozilgan, ulardan MUAMMOGA AYLANGANI — 16 ta (0.35%), tegilmagani
 * 4374 ta. `signal-ai.constants.ts` dagi doktrina izohi aynan shundan
 * ogohlantirgan edi ("to'lib ketgan ro'yxatda operator hammasini
 * ko'rishni to'xtatadi") — va u ALLAQACHON sodir bo'lgan.
 *
 * ⚠️ BU FILTR PROMPTNING O'RNINI BOSMAYDI, USTIGA QO'SHILADI —
 * `signal-ai.constants.ts` dagi "prompt / sxema / kod" uchligi bilan
 * ayni mantiq:
 *
 *   prompt → modelga nima kerakligini AYTADI (lekin kafolat emas)
 *   sxema  → javob SHAKLINI bog'laydi
 *   kod    → QIYMATNI tekshiradi (yagona ISHONCHLI nuqta)
 *
 * Bu fayl — uchinchisining MAZMUN tomoni: `normalizeSignal` faqat
 * shaklni (`kind`, `messageId`) tekshirardi, mazmunga esa HECH KIM
 * qaramasdi.
 *
 * ⚠️ QASDDAN QATTIQ — VA NIMA YO'QOLISHI OCHIQ AYTILADI.
 * `aniqNarsaYoq` qoidasi qisqa va ob'ektsiz xabarni to'sadi, ya'ni
 * "yana boshlandi" kabi HAQIQIY, lekin kontekstsiz shikoyat ham
 * qirqiladi. Bu ATAYLAB tanlangan: 0.35% foydali chiqadigan
 * ro'yxatda bitta yo'qolgan shikoyatning zarari, ko'milib ketgan
 * 4374 signaldan kam. O'lchov — `reports.service.ts#attachRate`:
 * u o'smasa filtr foyda bermayapti, 100% ga yopishsa juda qattiq.
 *
 * ⚠️ NIMA TO'SILMAYDI: ob'ekti bor qisqa shikoyat ("suv yo'q" — 8
 * belgi) O'TADI. Qattiqlik UZUNLIKKA emas, ANIQLIKKA qaraydi —
 * promptdagi "RASMIY TIL TALAB QILMA" qoidasi bilan ayni mantiq.
 */

/** Nega to'sildi — logga va `dismissedReason` ga tushadi. */
export type NoiseReason =
  | "matn-yo'q"
  | "faqat-havola"
  | "qisqa-rozilik"
  | "hal-qilingan"
  | "e'lon-ogohlantirish"
  | "aniq-narsa-yo'q";

/**
 * Ob'ektsiz xabar shu uzunlikdan QISQA bo'lsa — to'siladi.
 *
 * ⚠️ 30 BELGI — HAQIQIY MA'LUMOTDAN OLINGAN (2026-11-25 kesimi).
 * Bundan qisqa va ob'ektsiz xabarlarning deyarli hammasi
 * "pile-on" (boshqa odamning gapini tasdiqlash): "9 да хам йук",
 * "Бизда вопшем йук", "Sh battar", "Йук кирмайди". Uzunroq xabarda
 * esa ob'ekt ro'yxatga tushmagan so'z bilan atalgan bo'lishi
 * mumkin — shuning uchun u O'TADI.
 */
const MIN_LENGTH_WITHOUT_OBJECT = 30;

/**
 * MATN NORMALLASHTIRISH.
 *
 * ⚠️ `NFKD` MAJBURIY — bezatilgan harflar uchun. Guruhlarda
 * matematik Unicode bilan yozish keng tarqalgan va u filtrdan
 * JIMGINA o'tib ketardi:
 *   "𝙎𝙪𝙫 𝙢𝙪𝙧𝙤𝙟𝙖𝙩 𝙦𝙞𝙡𝙞𝙣𝙙𝙞" → "Suv murojaat qilindi"
 * Aynan shu xabar 2026-11-25 da signal bo'lib yozilgan, holbuki u
 * promptdagi 1-holatning (javobning o'zi) SO'ZMA-SO'Z misoli.
 *
 * ⚠️ APOSTROFLAR BIRLASHTIRILADI: o'zbek matnida `ʻ ʼ ' ' ` ´` —
 * hammasi ishlatiladi va "yo'q" bilan "yoʻq" bir xil so'z.
 */
function normalize(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[ʻʼ‘’`´']/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Harflar soni — emoji, raqam va tinish belgilarisiz. */
function letterCount(text: string): number {
  return (text.match(/[a-zЀ-ӿ]/g) ?? []).length;
}

/**
 * SO'Z CHEGARASI BILAN IZLASH.
 *
 * ⚠️ `\b` ISHLATILMAYDI: u ASCII ga qurilgan va kirill matnida
 * noto'g'ri ishlaydi. Qo'lda chegara qo'yiladi, aks holda qisqa
 * ob'ektlar begona so'z ichidan topilardi — "it" (hayvon) "ketdi",
 * "bitta", "ichida" ichida; "tok" esa "tokcha" ichida.
 */
function hasWord(text: string, words: readonly string[]): boolean {
  const edge = "[^a-z\\u0400-\\u04ff]";
  const flat = text.replace(/'/g, "");
  return words.some((word) =>
    new RegExp(`(?:^|${edge})${word}(?:${edge}|$)`, "u").test(flat),
  );
}

/**
 * NAQSHNI MATN BILAN AYNI QOLIPGA SOLISH.
 *
 * ⚠️ BUSIZ KIRILL NAQSHLARI HECH QACHON MOS KELMAYDI — va bu
 * JIMGINA ishlamaydigan xato edi. `normalize` dagi `NFKD` kirill
 * harflarini AJRATADI, keyin diakritik olib tashlanadi va natijada:
 *
 *   "Ёнди" → "енди"      ("ё" → "е")
 *   "йук"  → "иук"       ("й" → "и")
 *   "йўл"  → "иул"       ("й" → "и", "ў" → "у")
 *   "тўлов" → "тулов"
 *
 * Ya'ni matn "енди" ga aylanadi, ro'yxatdagi naqsh esa "ёнди"
 * bo'lib qolardi va `includes` HAR DOIM `false` qaytarardi. Aynan
 * shu sabab "Ёнди" `hal-qilingan` emas, `aniq-narsa-yo'q` bo'lib
 * to'silgan — natija tasodifan to'g'ri, mexanizm esa buzuq edi.
 * `й`/`ё`/`ў` bor ob'ektlar ("йул", "ёрдам", "рўйхат") esa UMUMAN
 * topilmay, haqiqiy shikoyatni "aniq narsasi yo'q" deb qirqardi.
 *
 * ⚠️ YECHIM — IKKI TOMONNI AYNI FUNKSIYADAN O'TKAZISH, naqshlarni
 * qo'lda "to'g'ri" yozish EMAS: qo'lda yozilsa, `normalize`
 * o'zgarganda ro'yxat jimgina ajralib ketardi.
 *
 * ⚠️ YON FOYDA: "ў" va "у" birlashadi, ya'ni "йўл" va "йул" bitta
 * naqsh bo'lib qoladi — o'zbek matnidagi eng keng tarqalgan
 * yozilish farqi o'zi yopiladi.
 *
 * ⚠️ APOSTROF HAM OLIB TASHLANADI: u TASODIFIY qo'yiladi, "gaz"
 * ham, "g'az" ham yoziladi. Tirik ma'lumotda tutilgan: "G'az
 * umuman yonmayapti" — MUAMMOGA AYLANGAN haqiqiy signal — apostrof
 * sababli ob'ekt testidan o'tmay to'silib qolgan edi.
 */
function prep(words: readonly string[]): readonly string[] {
  return words.map((word) => normalize(word).replace(/'/g, ""));
}

/** Qism sifatida izlash — uzun va xatosi ko'p so'zlar uchun. */
function hasPart(text: string, parts: readonly string[]): boolean {
  const flat = text.replace(/'/g, "");
  return parts.some((part) => flat.includes(part));
}

/**
 * MUAMMO OB'EKTLARI — "ANIQ NARSA BORMI?" TESTINING KOD SHAKLI.
 *
 * ⚠️ IKKI ALIFBO VA XATO YOZILISHLAR BILAN: guruhda lotin ham,
 * kirill ham, "сивет", "муср", "болон" kabi xato yozilishlar ham
 * uchraydi. Ro'yxatdan tushib qolgan shakl — signal YO'QOLISHI
 * degani, shuning uchun keng olinadi.
 *
 * ⚠️ JOY NOMLARI (ko'cha, mahalla, uy) ATAYLAB YO'Q: ular
 * muammoning O'ZI emas, o'rni. "3 нчи кучадаям йук" da "куча" bor,
 * lekin NIMA yo'qligi aytilmagan — aynan shu xabarlar to'silishi
 * kerak.
 */
const RAW_OBJECT_PARTS: readonly string[] = [
  // Kommunal
  "suv", "сув", "gaz", "газ", "svet", "свет", "сивет", "сивэт",
  "elektr", "электр", "chiroq", "чирок", "чироқ", "fonar", "фонар",
  "yoritish", "ёритиш", "kanalizatsiya", "канализация", "issiq suv",
  "isitish", "иситиш", "otopleniye", "отоплени", "nasos", "насос",
  "transformator", "трансформатор", "quvur", "кувур", "труба",
  "schyotchik", "счетчик", "hisoblagich", "ҳисоблагич", "хисоблагич",
  // ⚠️ "liniya" — elektr liniyasi. Tirik ma'lumotdan: "Tolko'chadayam
  // 1 liniya yo'q" MUAMMOGA AYLANGAN, lekin ro'yxatda bu so'z
  // bo'lmagani uchun to'silib qolar edi.
  "liniya", "линия", "lineya", "линя", "faza", "фаза",
  "balon", "балон", "болон", "plita", "плита",
  // Tozalik
  "axlat", "ахлат", "musor", "мусор", "musr", "муср", "мусир",
  "chiqindi", "чикинди", "чиқинди", "ariq", "арик", "ариқ",
  "zaxkash", "захкаш", "kanal", "канал",
  // Yo'l va infratuzilma
  "yo'l", "йул", "йўл", "koprik", "ko'prik", "куприк", "кўприк",
  "asfalt", "асфальт", "trotuar", "тротуар", "quduq", "кудук",
  "қудуқ", "lyuk", "люк", "bekat", "бекат", "avtobus", "автобус",
  "marshrut", "маршрут", "transport", "транспорт",
  // Ijtimoiy
  "nafaqa", "нафака", "нафақа", "pensiya", "пенсия", "subsidiya",
  "субсидия", "yordam", "ёрдам", "ro'yxat", "руйхат", "рўйхат",
  "kreditsiya", "ipoteka", "ипотека",
  // Hujjat va xizmat
  "ma'lumotnoma", "маълумотнома", "hujjat", "хужжат", "ҳужжат",
  "spravka", "справка", "ariza", "ариза", "navbat", "навбат",
  "santexnik", "сантехник", "elektrik", "электрик", "usta", "уста",
  "brigada", "бригада",
  // Muassasa
  "maktab", "мактаб", "bog'cha", "богча", "боғча", "bogcha",
  "shifoxona", "шифохона", "poliklinika", "поликлиника",
  "fap", "фап", "dorixona", "дорихона",
  // Xavfsizlik va atrof
  "daraxt", "дарахт", "maydoncha", "майдонча", "qabriston",
  "кабристон", "mol", "мол", "kuchuk", "кучук",
  // Pul
  "to'lov", "тулов", "тўлов", "qarz", "карз", "қарз", "jarima",
  "жарима", "soliq", "солик", "солиқ", "tarif", "тариф",
  // Odam (xodim ustidan shikoyat)
  "rais", "раис", "xodim", "ходим", "ходими", "nozir", "нозир",
  "inspektor", "инспектор", "mirshab", "миршаб", "prorab", "прораб",
];

/** Qisqa, chegara bilan izlanadigan ob'ektlar. */
const RAW_OBJECT_WORDS: readonly string[] = ["it", "ит", "tok", "ток", "gaz", "газ"];

/**
 * HAL QILINGANI / JAVOBNING O'ZI.
 *
 * ⚠️ PROMPTDAGI 1-HOLATNING KOD SHAKLI. "Suv murojaat qilindi,
 * nazoratga kirdi" — ichida "suv" bor, ya'ni ob'ekt testidan
 * O'TADI, lekin u shikoyat EMAS. Shuning uchun bu tekshiruv ob'ekt
 * tekshiruvidan OLDIN turadi.
 */
const RAW_RESOLVED_PARTS: readonly string[] = [
  "murojaat qilindi", "murojat qilindi", "мурожат килинди",
  "мурожаат килинди", "мурожаат қилинди", "murojat qilingan",
  "мурожат килинган", "nazoratga", "назоратга", "назоратда",
  "hal qilindi", "hal etildi", "хал килинди", "хал этилди",
  "ҳал этилди", "ҳал қилинди", "bartaraf", "бартараф",
  "tuzatildi", "тузатилди", "ta'mirlandi", "таъмирланди",
  "qabul qilindi", "кабул килинди", "қабул қилинди",
  "ariza qabul", "ариза кабул", "yo'lga chiqdi", "йулга чикди",
  "йўлга чиқди", "yoqib berdik", "yoqib beramiz", "йокиб берамиз",
  "ёқиб берамиз", "ёкиб берилди", "yondi", "ёнди", "ёнди",
  "ishga tushdi", "ишга тушди", "ta'minlandi", "таъминланди",
  "ko'rib chiqildi", "куриб чикилди", "кўриб чиқилди",
  "javob berildi", "жавоб берилди", "siqilmang", "сикилманг",
  "сиқилманг", "хавотир олманг", "havotir olmang",
];

/**
 * E'LON, OGOHLANTIRISH VA UZATILGAN XABAR.
 *
 * ⚠️ 2026-11-25 DA O'LCHANGAN: "Мана шу аёл болаларни ўғирлаяпти
 * экан" SAKKIZ guruhda SAKKIZ signal bo'lib yozilgan — bu uzatilgan
 * (forward) ogohlantirish, MFY chora ko'radigan masala EMAS
 * (`MUAMMO TESTI` ning 3-sharti).
 *
 * ⚠️ "FIRIBGAR" TO'SILADI, LEKIN "PUL YIG'IB KETDI" YO'Q: birinchisi
 * — aholining bir-birini ogohlantirishi, ikkinchisi — sodir bo'lgan
 * voqea. Farqni so'z emas, SHAKL beradi: ogohlantirish har doim
 * "ogoh bo'ling", "diqqat", "tarqating" bilan keladi.
 */
const RAW_BROADCAST_PARTS: readonly string[] = [
  "ogoh bo'ling", "ogoh buling", "огох булинг", "огоҳ бўлинг",
  "ehtiyot bo'ling", "эхтиёт булинг", "эҳтиёт бўлинг",
  "diqqat", "диққат", "диккат", "tarqating", "тарқатинг",
  "таркатинг", "tarqalmoqda", "тарқалмоқда", "таркалмокда",
  "ulashing", "улашинг", "virus", "вирус", "firibgar", "фирибгар",
  "прибгар", "пормани кийволип", "scam", "aldamoqda", "алдамокда",
  "e'lon qilinadi", "эълон килинади", "эълон қилинади",
  "ma'lum qilamiz", "маълум киламиз", "маълум қиламиз",
  "eslatma", "эслатма", "tadbir", "тадбир", "yig'ilish bo'ladi",
  "йигилиш булади", "йиғилиш бўлади", "tabriklaymiz", "табриклаймиз",
];

/**
 * QISQA ROZILIK VA SUHBAT — AYNAN TENG KELSA to'siladi.
 *
 * ⚠️ `includes` EMAS, TENGLIK: "ha" ni qism sifatida izlash
 * "hammada", "haqida" kabi o'nlab so'zni tutib, haqiqiy shikoyatni
 * o'ldirardi.
 */
const RAW_SHORT_NOISE: readonly string[] = [
  "ha", "ҳа", "ха", "yo'q", "йук", "йўк", "ok", "ок", "okey",
  "rahmat", "рахмат", "раҳмат", "tashakkur", "ташаккур",
  "zo'r", "зур", "зўр", "barakalla", "баракалла", "to'g'ri",
  "тугри", "тўғри", "shunday", "шунday", "шундай", "xo'p", "хуп",
  "хўп", "mayli", "майли", "assalomu alaykum", "ассалому алайкум",
  "salom", "салом", "xayr", "хайр", "omin", "омин", " omin",
  "yondi", "ёнди", "keldi", "келди", "bo'ldi", "булди", "бўлди",
];

/**
 * ⚠️ RO'YXATLAR MODUL YUKLANGANDA BIR MARTA NORMALLASHTIRILADI —
 * har chaqiruvda emas: `detectNoise` har signal uchun ishlaydi va
 * yuzlab so'zni qayta-qayta qolipga solish bekor yuk bo'lardi.
 */
const OBJECT_PARTS = prep(RAW_OBJECT_PARTS);
const OBJECT_WORDS = prep(RAW_OBJECT_WORDS);
const RESOLVED_PARTS = prep(RAW_RESOLVED_PARTS);
const BROADCAST_PARTS = prep(RAW_BROADCAST_PARTS);
const SHORT_NOISE = prep(RAW_SHORT_NOISE);

/**
 * BITTA XABARNI TEKSHIRADI.
 *
 * @returns To'silsa — SABABI, o'tsa — `null`.
 */
export function detectNoise(rawText: string): NoiseReason | null {
  const text = normalize(rawText);

  // ── 1. MATN YO'QMI ──────────────────────────────────────────────
  // ⚠️ Emoji, stiker izohi, faqat raqam — promptdagi 3-holat.
  if (letterCount(text) < 2) return "matn-yo'q";

  // ── 2. FAQAT HAVOLAMI ───────────────────────────────────────────
  // ⚠️ Havola OLIB TASHLANIB qolgan matn qaraladi: havola YONIDA
  // shikoyat yozilgan bo'lsa (promptdagi qoida) u O'TADI.
  //
  // ⚠️ QOIDA FAQAT HAVOLA BOR XABARGA TEGISHLI. Avval shu shart
  // yo'q edi va qoida HAMMA qisqa xabarni "faqat-havola" deb
  // to'sardi — ya'ni "suv yo'q" (6 harf, havolasiz) ham qirqilardi.
  // Tirik ma'lumotda tutilgan: 4611 signallik kesimda 189 xabar shu
  // sabab bilan to'silgan, holbuki ko'pida havola YO'Q edi.
  const links = /https?:\/\/\S+|t\.me\/\S+|www\.\S+/g;
  if (links.test(text)) {
    const withoutLinks = text.replace(links, " ");
    if (letterCount(withoutLinks) < 10) return "faqat-havola";
  }

  // ── 3. HAL QILINGANI / JAVOBNING O'ZI ───────────────────────────
  // ⚠️ OB'EKT TEKSHIRUVIDAN OLDIN: "suv murojaat qilindi" da ob'ekt
  // BOR, lekin u shikoyat emas.
  if (hasPart(text, RESOLVED_PARTS)) return "hal-qilingan";

  // ── 4. E'LON / OGOHLANTIRISH / FORWARD ──────────────────────────
  if (hasPart(text, BROADCAST_PARTS)) return "e'lon-ogohlantirish";

  // ── 5. QISQA ROZILIK ────────────────────────────────────────────
  const bare = text.replace(/[^a-zЀ-ӿ' ]/g, "").trim();
  if (SHORT_NOISE.includes(bare)) return "qisqa-rozilik";

  // ── 6. ANIQ NARSA BORMI ─────────────────────────────────────────
  // ⚠️ `MUAMMO TESTI` NING 1-SHARTI, KODDA. Uzun xabar O'TADI:
  // ob'ekti ro'yxatga tushmagan so'z bilan atalgan bo'lishi mumkin.
  if (letterCount(text) >= MIN_LENGTH_WITHOUT_OBJECT) return null;

  const hasObject =
    hasPart(text, OBJECT_PARTS) || hasWord(text, OBJECT_WORDS);

  return hasObject ? null : "aniq-narsa-yo'q";
}

/**
 * TAKRORNI ANIQLASH UCHUN BARMOQ IZI.
 *
 * ⚠️ MATNNING O'ZI EMAS, NORMALLASHTIRILGANI: ayni shikoyat turli
 * bezak, apostrof va bo'sh joy bilan yozilsa ham bitta iz beradi.
 * Harf va raqamdan boshqa hamma narsa tashlanadi — emoji va tinish
 * belgisi takrorni "boshqa matn" qilib ko'rsatmasligi kerak.
 */
export function fingerprint(rawText: string): string {
  return normalize(rawText).replace(/[^a-z0-9Ѐ-ӿ]/g, "");
}

/**
 * MAVZU OILALARI — TAKRORNI BIRLASHTIRISH UCHUN.
 *
 * ⚠️ NIMA UCHUN BARMOQ IZI YETARLI EMAS. `fingerprint` faqat AYNI
 * matnni tutadi, lekin eng katta shovqin manbai — AYNI VOQEANI
 * boshqa-boshqa so'z bilan yozish. 2026-11-25 kesimida bitta svet
 * uzilishi shunday ko'rinadi:
 *
 *   "Сиветга нима болди", "Свет хамада учдми", "Svet nmaga ochdi",
 *   "Svet xammada o'chdimi", "Hammada ochdimi svet", "Гулшанда свет
 *   учди", "Bo'stonda ham svet o'chib qoldi", "Свет келадими Бустон
 *   кучага", "Раис хабариз борми свет учганидан", "Svet qachon yonadi"
 *
 * Hammasining ob'ekti BOR, ya'ni `detectNoise` dan O'TADI va
 * barmoq izlari ham BOSHQA-BOSHQA. Promptdagi "bitta signalga
 * birlashtir" qoidasi esa faqat BITTA so'rov ichida ishlaydi:
 * guruhdan bir aylanishda 15 xabar olinadi, qolgani keyingisida —
 * ya'ni model o'zining avvalgi xulosasini KO'RMAYDI.
 *
 * ⚠️ RO'YXAT `OBJECT_PARTS` DAN AJRATIB YOZILADI, undan
 * HOSILA QILINMAYDI: ob'ekt ro'yxati "shikoyatmi?" degan savolga
 * ishlaydi, bu esa "AYNI MASALAMI?" degan BOSHQA savolga. Ikkisini
 * bitta ro'yxatga qo'shish birini o'zgartirganda ikkinchisini
 * jimgina buzardi.
 */
const RAW_TOPIC_FAMILIES: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["elektr", ["svet", "свет", "сивет", "сивэт", "elektr", "электр",
    "chiroq", "чирок", "чироқ", "liniya", "линия", "lineya", "линя",
    "faza", "фаза", "tok", "ток", "transformator", "трансформатор",
    "fonar", "фонар", "yoritish", "ёритиш"]],
  ["suv", ["suv", "сув", "nasos", "насос", "quvur", "кувур", "труба",
    "isitish", "иситиш", "otopleniye", "отоплени"]],
  ["gaz", ["gaz", "газ", "balon", "балон", "болон", "plita", "плита"]],
  ["axlat", ["axlat", "ахлат", "musor", "мусор", "musr", "муср",
    "мусир", "chiqindi", "чикинди", "чиқинди"]],
  ["kanalizatsiya", ["kanalizatsiya", "канализация", "ariq", "арик",
    "ариқ", "zaxkash", "захкаш"]],
  ["yo'l", ["yo'l", "йул", "йўл", "asfalt", "асфальт", "trotuar",
    "тротуар", "koprik", "ko'prik", "куприк", "кўприк", "quduq",
    "кудук", "қудуқ", "lyuk", "люк"]],
  ["transport", ["avtobus", "автобус", "bekat", "бекат", "marshrut",
    "маршрут", "transport", "транспорт"]],
  ["ijtimoiy", ["nafaqa", "нафака", "нафақа", "pensiya", "пенсия",
    "subsidiya", "субсидия", "yordam", "ёрдам", "ro'yxat", "руйхат",
    "рўйхат"]],
  ["hujjat", ["ma'lumotnoma", "маълумотнома", "hujjat", "хужжат",
    "ҳужжат", "spravka", "справка", "ariza", "ариза", "navbat",
    "навбат"]],
  ["muassasa", ["maktab", "мактаб", "bog'cha", "богча", "боғча",
    "bogcha", "shifoxona", "шифохона", "poliklinika", "поликлиника",
    "dorixona", "дорихона"]],
  ["xodim", ["rais", "раис", "xodim", "ходим", "nozir", "нозир",
    "inspektor", "инспектор", "mirshab", "миршаб", "prorab", "прораб"]],
  ["pul", ["to'lov", "тулов", "тўлов", "qarz", "карз", "қарз",
    "jarima", "жарима", "soliq", "солик", "солиқ", "tarif", "тариф",
    "schyotchik", "счетчик", "hisoblagich", "ҳисоблагич", "хисоблагич"]],
];

/** ⚠️ Naqshlar bir marta qolipga solinadi — `OBJECT_PARTS` dagi sabab. */
const TOPIC_FAMILIES: ReadonlyArray<readonly [string, readonly string[]]> =
  RAW_TOPIC_FAMILIES.map(([family, words]) => [family, prep(words)] as const);

/**
 * XABARNING MAVZU KALITI — `null` bo'lishi mumkin.
 *
 * ⚠️ `null` — BIRLASHTIRMASLIK degani, "mavzusi yo'q" degani EMAS.
 * Oila ro'yxatiga tushmagan shikoyat (masalan "it talayapti")
 * HAR DOIM alohida signal bo'lib qoladi. Bu ATAYLAB: tanimagan
 * narsani birlashtirish — shikoyatni YO'QOTISH, tanimagan narsani
 * o'tkazib yuborish esa faqat bitta ortiqcha signal.
 *
 * ⚠️ BIR NECHTA OILA TOPILSA HAMMASI OLINADI va ALIFBO TARTIBIDA
 * yoziladi: "svet ham yo'q, suv ham yo'q" degan xabar `elektr+suv`
 * kalitini oladi va u YOLG'IZ "svet" shikoyati bilan birlashmaydi —
 * ikkisi boshqa masala.
 */
export function topicKey(rawText: string): string | null {
  const flat = normalize(rawText).replace(/'/g, "");
  const found = TOPIC_FAMILIES.filter(([, words]) =>
    words.some((word) => flat.includes(word)),
  ).map(([family]) => family);

  return found.length > 0 ? found.sort().join("+") : null;
}
