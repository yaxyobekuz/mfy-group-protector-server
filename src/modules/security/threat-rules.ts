/**
 * ZARARLI KONTENTNI ANIQLASH QOIDALARI — SOF FUNKSIYALAR.
 *
 * ── NIMA UCHUN AI EMAS ────────────────────────────────────────────────
 *
 * ⚠️ BU YERDA AI ISHLATILMAYDI va bu ataylab. Signal — AI TAXMINI va u
 * ODAM qaroriga muhtoj (`GroupSignal`); bu yerda esa bot xabarni
 * DARHOL o'chiradi, ya'ni qaror qaytarib bo'lmaydi. Taxminga
 * asoslangan o'chirish aholining oddiy xabarini yo'q qilib,
 * tizimga bo'lgan ishonchni buzardi.
 *
 * Shuning uchun qoidalar QAT'IY, tekshiriladigan va shu faylda
 * jamlangan: `.apk` — har doim zararli, `bit.ly` — har doim
 * yashiruvchi. Shubha bo'lsa — TEGILMAYDI (signalning teskarisi:
 * u yerda "shubhada — signal").
 *
 * ── SOF FUNKSIYA ──────────────────────────────────────────────────────
 *
 * ⚠️ BU FAYLDA BAZA HAM, TELEGRAM HAM YO'Q: faqat kirish → xulosa.
 * Shu sababli uni testdan o'tkazish oson va qoida o'zgarganda
 * boshqa hech narsa buzilmaydi.
 */

/** Aniqlangan tahdid turi — `ThreatKind` enum'i bilan AYNI. */
export type ThreatKind =
  | "apk_file"
  | "unknown_file"
  | "suspicious_url"
  | "shortened_url"
  | "masked_url"
  | "scam_text";

export interface ThreatVerdict {
  kind: ThreatKind;
  /** Qoida kaliti — panelda o'zbekcha matnga aylantiriladi. */
  reason: string;
  url?: string;
  urlHost?: string;
}

/**
 * O'RNATMA FAYL KENGAYTMALARI.
 *
 * ⚠️ MIME TURIGA ISHONILMAYDI: uni YUBORUVCHI belgilaydi va
 * `.apk` faylni `image/jpeg` deb jo'natish mumkin. Kengaytma esa
 * fayl nomining bir qismi va foydalanuvchi uni ko'radi — aynan
 * shunga bosadi.
 *
 * ⚠️ RO'YXAT KODDA, SOZLAMADA EMAS: "apk zararli" — bu qoida
 * o'zgarmaydi va uni sozlamaga chiqarish kimdir tasodifan
 * o'chirib qo'yishiga yo'l ochardi.
 */
const INSTALLER_EXTENSIONS = new Set([
  "apk", "xapk", "apks", "aab",
  "exe", "msi", "bat", "cmd", "com", "scr", "pif",
  "jar", "ipa", "dmg", "pkg", "deb", "rpm", "appimage",
  "vbs", "vbe", "js", "jse", "wsf", "wsh", "ps1", "psm1",
  "hta", "cpl", "msc", "reg", "lnk", "iso", "img",
]);

/**
 * ARXIVLAR — O'CHIRILMAYDI.
 *
 * ⚠️ QOIDA OLIB TASHLANDI, TIRIK SHIKOYATDAN KEYIN (2026-11-18):
 * oddiy `.zip` fayllar guruhlarda jimgina o'chib ketardi. Izohda
 * "o'chirish sozlamada yoqilgandagina bo'ladi" deb yozilgan edi,
 * LEKIN BUNDAY SOZLAMA YO'Q — `deleteFiles` yoqilgan har guruhda
 * arxiv darhol o'chirilardi.
 *
 * ⚠️ SABAB DOKTRINADA: arxiv o'z-o'zidan zararli EMAS — MFY xodimi
 * hujjatlarni, rais suratlarni zip qilib tashlaydi. "Shubhada —
 * tegilmaydi" qoidasi (`SecurityEvent` bo'limi) aynan shu holat
 * uchun: bot ogohlantirish YOZMAYDI, ya'ni o'chirilgan hisobotni
 * hech kim izlab topmaydi.
 *
 * ⚠️ HIMOYA YO'QOLMADI: `.apk`, `.exe` va IKKI KENGAYTMALI nom
 * (`hisobot.pdf.apk`) baribir ushlanadi — ular arxiv emas. Arxiv
 * ICHIDAGI faylni esa bot umuman ko'ra olmaydi, ya'ni o'chirish
 * taxminga asoslanardi.
 *
 * ⚠️ QAYTARMANG. Qaytarish kerak bo'lsa, avval `Settings` ga
 * ALOHIDA bayroq qo'shiling (standart `false`) va panelda
 * ko'rsating — aks holda yana bir nechta hisobot yo'qoladi.
 */

/**
 * HAVOLANI YASHIRADIGAN QISQARTIRGICHLAR.
 *
 * ⚠️ QISQARTIRGICH O'ZI ZARARLI EMAS, lekin u manzilni KO'RSATMAYDI:
 * odam qayerga borayotganini bilmay bosadi va firibgarlik aynan
 * shunga tayanadi. Guruhda qisqartirilgan havolaning foydali ishlatilishi
 * kam — rasmiy e'lon to'liq manzil bilan tashlanadi.
 */
/**
 * HECH QACHON O'CHIRILMAYDIGAN HOSTLAR.
 *
 * ⚠️ TASHQI RO'YXATLAR XATO QILADI va bu tirik holat: 392 000
 * yozuvli Phishing.Database ichida `telegra.ph` va 333 ta `.uz`
 * domeni bor edi — ular orasida oddiy do'kon va tashkilot saytlari.
 * Bitta xato yozuv butun viloyat bo'ylab o'sha havolali har xabarni
 * o'chirardi, bot esa ogohlantirish yozmaydi (doktrina).
 *
 * ⚠️ RO'YXAT QISQA VA ANIQ: faqat MFY guruhida HAQIQATAN
 * ishlatiladigan, mulki ma'lum domenlar. Uzaytirib yuborish qora
 * ro'yxatni ma'nosiz qilardi — firibgar ham o'sha domenda sahifa
 * ocha olsa, himoya yo'qoladi. Shuning uchun bu yerda fayl
 * almashish va sayt yasash xizmatlari YO'Q.
 *
 * ⚠️ `telegra.ph` ATAYLAB BOR: Telegram'ning o'z nashr xizmati va
 * rasmiy e'lonlar aynan o'sha yerda yoziladi. Firibgar undan
 * foydalanishi mumkin, lekin o'shanda matn qoidasi
 * (`inspectText`) va qisqartirgich qoidasi baribir ishlaydi.
 */
const ALWAYS_ALLOWED_HOSTS: readonly string[] = [
  // Telegram — bot ishlaydigan muhitning o'zi
  "t.me", "telegram.me", "telegram.org", "telegram.dog", "telegra.ph",
  /**
   * ⚠️ `gov.uz` BOR, YALANG'OCH `uz` YO'Q: solishtirish SUFFIKS
   * bo'yicha boradi (`hostMatches`), ya'ni `uz` yozilsa butun
   * `.uz` zonasi — firibgarning yangi ochgan domeni ham —
   * o'chirilmaydigan bo'lib qolardi.
   */
  "gov.uz",
  // Ijtimoiy tarmoq va video
  "youtube.com", "youtu.be", "instagram.com", "facebook.com", "fb.com",
  "tiktok.com", "vk.com", "ok.ru", "linkedin.com", "x.com", "twitter.com",
  // Keng ishlatiladigan xizmatlar
  "google.com", "apple.com", "microsoft.com",
];

const URL_SHORTENERS = new Set([
  "bit.ly", "tinyurl.com", "goo.gl", "t.co", "ow.ly", "is.gd", "buff.ly",
  "cutt.ly", "rb.gy", "shorturl.at", "rebrand.ly", "bit.do", "clck.ru",
  "vk.cc", "tiny.cc", "surl.li", "qps.ru", "u.to", "clc.to",
]);

/**
 * ⚠️ `@` BELGISI HAVOLADA — KLASSIK ALDOV:
 * `https://sberbank.ru@evil.com` brauzerda `evil.com` ga boradi,
 * lekin odam boshida `sberbank.ru` ni ko'radi.
 */
/**
 * ⚠️ SXEMASIZ DOMEN HAM USHLANADI (`gov.uz/vplt`). Oldin regex
 * faqat `http://` yoki `www.` bilan boshlanganini topardi va
 * HAQIQIY firibgarlik xabari aynan shu teshikdan o'tib ketdi:
 * matnda `gov.uz/vplt` yozilgan, `https://` yo'q edi.
 *
 * ⚠️ TLD RO'YXATI CHEKLANGAN: har qanday `so'z.so'z` ni domen deb
 * hisoblash "narx 1.5 mln", "soat 10.30 da" kabi oddiy matnni
 * havolaga aylantirardi.
 */
const BARE_DOMAIN_TLDS =
  "uz|com|net|org|ru|info|biz|xyz|top|site|online|shop|store|club|live|app|dev|io|co|me|tv|pro|link|click|win|vip";

const URL_REGEX = new RegExp(
  [
    // 1. To'liq sxemali havola
    String.raw`\bhttps?:\/\/[^\s<>"']+`,
    // 2. www. bilan boshlangan
    String.raw`(?<![@\w.])www\.[^\s<>"']+`,
    // 3. Sxemasiz domen: gov.uz/vplt, example.xyz
    String.raw`(?<![@\w.\/])(?:[a-z0-9][a-z0-9-]*\.)+(?:${BARE_DOMAIN_TLDS})(?:\/[^\s<>"']*)?(?![a-z0-9-])`,
  ].join("|"),
  "gi",
);

/** Fayl nomidan kengaytma — oxirgi nuqtadan keyingi qism. */
const extensionOf = (fileName: string): string => {
  const clean = fileName.trim().toLowerCase();
  const dot = clean.lastIndexOf(".");
  if (dot < 0 || dot === clean.length - 1) return "";
  return clean.slice(dot + 1);
};

/**
 * Domenni normallashtiradi: `WWW.Evil.COM.` → `evil.com`.
 *
 * ⚠️ OXIRIDAGI NUQTA OLIB TASHLANADI: `evil.com.` — HAQIQIY domen
 * (DNS'da "root" belgisi) va u qora ro'yxatdagi `evil.com` bilan
 * SATR sifatida mos kelmasdi.
 */
export const normalizeHost = (host: string): string =>
  host.trim().toLowerCase().replace(/\.+$/, "").replace(/^www\./, "");

/**
 * Domen ro'yxatga kiradimi — SUBDOMENLAR BILAN.
 *
 * ⚠️ `endsWith` O'ZI YETARLI EMAS: `notevil.com` ham `evil.com` bilan
 * tugaydi va u noto'g'ri bloklanardi. Nuqta bilan tekshiriladi:
 * `sub.evil.com` ✅, `notevil.com` ❌.
 */
export const hostMatches = (host: string, list: readonly string[]): boolean => {
  const target = normalizeHost(host);
  return list.some((raw) => {
    const entry = normalizeHost(raw);
    if (!entry) return false;
    return target === entry || target.endsWith(`.${entry}`);
  });
};

/** Matndan havolalarni ajratadi. */
/**
 * HOST TASHQI RO'YXATDAMI — TO'PLAM BO'YICHA.
 *
 * ⚠️ `hostMatches` DAN FARQI TEZLIKDA. U butun ro'yxatni aylanib
 * chiqadi va qo'lda kiritilgan 20-30 domen uchun bu yetarli. Tashqi
 * ro'yxatda esa 50 000 host bor va har havola uchun 50 000 ta
 * solishtirish botni sezilarli sekinlashtirardi — o'chirish esa
 * VAQTGA bog'liq amal.
 *
 * ⚠️ SHUNING UCHUN TESKARI TOMONDAN QIDIRILADI: hostning o'zi, keyin
 * ota-domenlari (a.b.evil.com → b.evil.com → evil.com). Bu 3-4 ta
 * qidiruv, ro'yxat hajmidan QAT'IY NAZAR.
 *
 * ⚠️ RO'YXAT NORMALLASHTIRILGAN HOLDA KELADI (server `normalizeHost`
 * ni yozishda qo'llagan): bu yerda qayta normallashtirish 50 000
 * satrni har safar qayta ishlash degani bo'lardi.
 */
export const hostInSet = (
  host: string,
  set: ReadonlySet<string> | undefined,
): boolean => {
  if (!set || set.size === 0) return false;

  let probe = normalizeHost(host);

  while (probe) {
    if (set.has(probe)) return true;

    const dot = probe.indexOf(".");
    if (dot < 0) break;
    probe = probe.slice(dot + 1);

    // ⚠️ TLD GA YETGANDA TO'XTAYDI: "com" ni ro'yxatda qidirish
    // ma'nosiz va noto'g'ri mos kelish xavfini tug'dirardi.
    if (!probe.includes(".")) break;
  }

  return false;
};

export const extractUrls = (text: string): string[] => {
  const found = text.match(URL_REGEX);
  if (!found) return [];

  // ⚠️ TAKRORLAR OLIB TASHLANADI: bitta havola ikki marta
  // yozilgan bo'lsa, ikkita bir xil yozuv yaratilardi.
  return [...new Set(found.map((item) => item.replace(/[.,;:!?)\]]+$/, "")))];
};

/** Havoladan domen; yaroqsiz bo'lsa `null`. */
export const hostOf = (url: string): string | null => {
  try {
    const withScheme = /^https?:\/\//i.test(url) ? url : `http://${url}`;
    return normalizeHost(new URL(withScheme).hostname);
  } catch {
    return null;
  }
};

export interface GuardConfig {
  deleteFiles: boolean;
  deleteUrls: boolean;
  blockedHosts: readonly string[];
  allowedHosts: readonly string[];

  /**
   * TASHQI RO'YXATLARDAN YIG'ILGAN HOSTLAR (URLhaus, PhishTank,
   * AdGuard va h.k.).
   *
   * ⚠️ MASSIV EMAS, TO'PLAM: unda 50 000 host bo'lishi mumkin va har
   * havola uchun massivni aylanib chiqish botni sezilarli
   * sekinlashtirardi (`hostInSet` izohi).
   *
   * ⚠️ IXTIYORIY: ro'yxat hali yuklanmagan bo'lishi mumkin (bot endi
   * ko'tarildi, server javob bermadi) va o'shanda qalqon QO'LDAGI
   * ro'yxat bilan ishlashda davom etadi.
   *
   * ⚠️ OQ RO'YXAT BARIBIR USTUN: `gov.uz` tashqi ro'yxatga xato bilan
   * tushsa ham o'chirilmaydi (`inspectUrl` dagi tartib).
   */
  feedHosts?: ReadonlySet<string>;
}

export interface FileInput {
  fileName?: string;
  mime?: string;
}

/**
 * FAYL TEKSHIRUVI.
 *
 * ⚠️ KENGAYTMA BIRINCHI, MIME IKKINCHI: yuboruvchi MIME'ni
 * o'zgartira oladi, lekin fayl nomi foydalanuvchiga KO'RINADI va
 * u aynan shunga ishonadi.
 */
export const inspectFile = (
  file: FileInput,
  config: GuardConfig,
): ThreatVerdict | null => {
  if (!config.deleteFiles) return null;

  const name = file.fileName?.trim() ?? "";
  const ext = extensionOf(name);

  if (ext && INSTALLER_EXTENSIONS.has(ext)) {
    return { kind: "apk_file", reason: `installer_extension:${ext}` };
  }

  /**
   * ⚠️ MIME ORQALI ZAXIRA TEKSHIRUV: Telegram ba'zan faylni nomsiz
   * yuboradi (`file_name` bo'sh) va o'shanda kengaytma yo'q.
   */
  const mime = file.mime?.trim().toLowerCase() ?? "";
  if (
    mime === "application/vnd.android.package-archive" ||
    mime === "application/x-msdownload" ||
    mime === "application/x-msdos-program"
  ) {
    return { kind: "apk_file", reason: `installer_mime:${mime}` };
  }

  /**
   * ⚠️ IKKI KENGAYTMALI NOM (`hisobot.pdf.apk`): Windows oxirgisini
   * ishlatadi, odam esa birinchisini o'qiydi. Yuqoridagi tekshiruv
   * buni allaqachon ushlaydi, bu yerda esa TESKARI holat —
   * `hujjat.apk.pdf` kabi chalg'ituvchi nom.
   */
  const parts = name.toLowerCase().split(".");
  if (parts.length > 2) {
    const hidden = parts.slice(1, -1).find((part) => INSTALLER_EXTENSIONS.has(part));
    if (hidden) {
      return { kind: "apk_file", reason: `double_extension:${hidden}` };
    }
  }

  return null;
};

/**
 * HAVOLA TEKSHIRUVI.
 *
 * ⚠️ OQ RO'YXAT BIRINCHI TEKSHIRILADI: rasmiy domen (`gov.uz`)
 * qisqartirgich ro'yxatida bo'lsa ham o'chirilmasligi kerak.
 * Tartib teskari bo'lsa, MFY xodimining rasmiy havolasi yo'q
 * qilinardi.
 */
export const inspectUrl = (
  url: string,
  config: GuardConfig,
): ThreatVerdict | null => {
  if (!config.deleteUrls) return null;

  const host = hostOf(url);
  if (!host) return null;

  if (hostMatches(host, config.allowedHosts)) return null;

  /**
   * ⚠️ KODDAGI OQ RO'YXAT — TASHQI MANBANING XATOSIDAN HIMOYA.
   * Tirik holat (2026-11-18): Phishing.Database ro'yxatida
   * `telegra.ph` turardi va MFY raisining e'loni — Telegram'da eng
   * keng tarqalgan havola turi — har safar jimgina o'chirilardi.
   *
   * ⚠️ SOZLAMADAGI OQ RO'YXATDAN ALOHIDA: `guardAllowedHosts` ni
   * ma'muriyat to'ldiradi va u BO'SH bo'lishi mumkin. Bu ro'yxat
   * esa "qanday sozlasa ham buzilmasligi kerak" degan zamin —
   * `gov.uz` ni ham, Telegram'ning o'z domenlarini ham tashqi
   * ro'yxat xato bilan bloklay olmaydi.
   *
   * ⚠️ `SOCIAL_HOSTS` DAN HAM ALOHIDA va ikkisi aralashtirilmaydi:
   * u "aldov dalili bo'la olmaydi" degani (yashirilgan manzil
   * qoidasi uchun), bu esa "umuman o'chirilmaydi". Birini
   * ikkinchisining o'rniga ishlatish qora ro'yxatni ijtimoiy
   * tarmoqlar uchun BUTUNLAY o'chirib qo'yardi.
   */
  if (hostMatches(host, ALWAYS_ALLOWED_HOSTS)) return null;

  if (hostMatches(host, config.blockedHosts)) {
    return { kind: "suspicious_url", reason: "blocked_host", url, urlHost: host };
  }

  /**
   * ⚠️ TASHQI RO'YXAT QO'LDAGISIDAN KEYIN TEKSHIRILADI: qo'lda
   * kiritilgan domen — ma'muriyatning ANIQ qarori va u sabab
   * kalitida ham shunday ko'rinishi kerak.
   *
   * ⚠️ SABAB ALOHIDA (`feed_host`): panelda "qayerdan bilindi" degan
   * savolga javob shundan. Ikkalasi bitta kalit bilan yozilsa,
   * ma'muriyat tashqi ro'yxatning foydasini umuman ko'rmasdi.
   */
  if (hostInSet(host, config.feedHosts)) {
    return { kind: "suspicious_url", reason: "feed_host", url, urlHost: host };
  }

  if (URL_SHORTENERS.has(host)) {
    return { kind: "shortened_url", reason: "url_shortener", url, urlHost: host };
  }

  /**
   * ⚠️ `@` BELGISI — ALDOV: `https://gov.uz@evil.com` odamga
   * `gov.uz` bo'lib ko'rinadi, lekin `evil.com` ga boradi.
   * Qonuniy ishlatilishi deyarli yo'q.
   */
  if (/^https?:\/\/[^/\s]*@/i.test(url)) {
    return { kind: "masked_url", reason: "userinfo_in_url", url, urlHost: host };
  }

  /**
   * ⚠️ IP MANZIL: qonuniy e'lon domen bilan tashlanadi. To'g'ridan
   * -to'g'ri IP — deyarli har doim vaqtinchalik zararli server.
   */
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    return { kind: "suspicious_url", reason: "raw_ip_host", url, urlHost: host };
  }

  return null;
};

/* ══════════════════════════════════════════════════════════════════════
 * FIRIBGARLIK MATNI — "IKKI DALIL" QOIDASI
 * ══════════════════════════════════════════════════════════════════════
 *
 * MFY guruhlariga tushadigan eng keng tarqalgan firibgarlik — "davlat
 * yordami" aldovi: "35 000 000 so'mgacha ko'mak", "ma'lumotlaringizni
 * kiriting", ko'rinishda `gov.uz`, amalda `uzbekistonviplata.xyz`.
 * Unda `.apk` ham yo'q, domen ham hali qora ro'yxatga tushmagan —
 * ya'ni yuqoridagi qoidalar uni USHLAMAYDI.
 *
 * ── NIMA UCHUN BITTA DALIL YETARLI EMAS ───────────────────────────────
 *
 * ⚠️ MATN BO'YICHA O'CHIRISH — ENG XAVFLI QOIDA. "Yordam", "ariza",
 * "to'lov" — MFY guruhining ODDIY so'zlari: raisning "nafaqa arizasi
 * uchun ma'lumotlaringizni kiriting" degan HAQIQIY e'loni aynan shu
 * so'zlardan tuzilgan. Yakka ibora bo'yicha o'chirish o'sha e'lonni
 * yo'q qilardi va buni HECH KIM sezmasdi — bot ogohlantirish
 * yozmaydi (`handler.ts`).
 *
 * ⚠️ SHUNING UCHUN IKKI MUSTAQIL DALIL TALAB QILINADI:
 *
 *     ibora/summa  +  ishonchsiz TASHQI HAVOLA  →  o'chiriladi
 *     faqat ibora                               →  TEGILMAYDI
 *     faqat havola                              →  TEGILMAYDI
 *
 * Mantiq: rais e'lonida havola BO'LMAYDI yoki u oq ro'yxatdagi
 * rasmiy domenga (`gov.uz`) ketadi. Firibgarlikning esa MAQSADI —
 * odamni begona saytga olib borish; havolasiz u foydasiz. Ya'ni
 * ikkinchi dalil firibgar uchun MAJBURIY, haqiqiy e'lon uchun esa
 * tasodifiy.
 *
 * ⚠️ BU AI EMAS: iboralar ro'yxati qat'iy, sanab o'tilgan va
 * testdan o'tadi. "Shubhada tegilmaydi" qoidasi kuchida — shubha
 * aynan shu sababdan IKKI dalilga bo'lingan.
 */

/**
 * ⚠️ IBORALAR — YAKKA SO'Z EMAS, BIRIKMA. "Yordam" yoki "to'lov"
 * MFY guruhida kuniga o'nlab marta uchraydi; "moliyaviy ko'mak
 * ajratish" esa faqat shu aldovda ishlatiladi.
 *
 * ⚠️ RO'YXAT KODDA: sozlamaga chiqarilsa, kimdir uni tasodifan
 * tozalab qo'yishi mumkin. O'zgaruvchan qism — domen ro'yxati.
 */
const SCAM_PHRASES: readonly string[] = [
  // "Davlat yordami" aldovining o'zagi
  "moliyaviy ko'mak",
  "moliyaviy yordam",
  "ijtimoiy yordam dasturlari",
  "yordam dasturi",
  "nasib etdi",
  "ko'mak ajratish",
  "ko'mak ajratilmoqda",
  "yordam ajratilishi mumkin",
  "yordam ajratilmoqda",
  "pul ajratilmoqda",
  "to'lov ajratildi",
  "subsidiya olish",
  "kompensatsiya olish",
  "tekin pul",

  // Harakatga undash — "ma'lumot kirit"
  "ma'lumotlaringizni kiriting",
  "ma'lumotlaringizni to'ldiring",
  "arizani to'ldiring",
  "imkoniyatingizni tekshirib ko'ring",
  "imkoniyatingizni tekshiring",
  "qancha yordam mavjudligini",
  "ishtirok etish talablarini",
  "havolaga o'ting",
  "quyidagi havola orqali",
  "linkni bosing",
  "havolani bosing",
  "ro'yxatdan o'ting va oling",


  // Karta/parol so'rash — HECH QACHON qonuniy emas
  "karta raqamingizni",
  "plastik raqamingizni",
  "sms kodni",
  "sms kodingizni",
  "bir martalik kod",
  "parolingizni kiriting",

  // Kirill yozuvidagi variantlari
  "молиявий кўмак",
  "молиявий ёрдам",
  "ижтимоий ёрдам",
  "ёрдам дастури",
  "маълумотларингизни киритинг",
  "насиб этди",
  "карта рақамингизни",
];

/**
 * HOMOGLIF JADVALI — ENG MUHIM QISM.
 *
 * ⚠️ HAQIQIY NAMUNADA `TASHАKKUR` so'zidagi `А` — KIRILL harfi
 * (U+0410), lotin `A` emas. Ko'zga bir xil ko'rinadi, lekin satr
 * sifatida BOSHQA: firibgar aynan shu bilan kalit so'z filtridan
 * o'tib ketadi. Almashtirilmasa, ro'yxatga ibora qo'shish foydasiz
 * bo'lardi — har harfni kirillcha yozib aylanib o'tardi.
 */
const HOMOGLYPHS: Readonly<Record<string, string>> = {
  а: "a", А: "a", е: "e", Е: "e", о: "o", О: "o", р: "p", Р: "p",
  с: "c", С: "c", у: "y", У: "y", х: "x", Х: "x", к: "k", К: "k",
  м: "m", М: "m", т: "t", Т: "t", в: "b", В: "b", і: "i", І: "i",
  ј: "j", Ј: "j", ѕ: "s", Ѕ: "s",
  ο: "o", Ο: "o", α: "a", Α: "a", ε: "e", ρ: "p", τ: "t", υ: "y",
};

/**
 * Matnni solishtirishga tayyorlaydi.
 *
 * ⚠️ APOSTROF BIRLASHTIRILADI: o'zbek matnida `o'`, `o‘`, `oʻ` —
 * bir so'zning uch yozilishi. Birlashtirilmasa `ko'mak` iborasi
 * `ko‘mak` yozilgan xabarga mos kelmasdi.
 *
 * ⚠️ KO'RINMAS BELGILAR OLIB TASHLANADI: zero-width space so'z
 * ichiga qo'yilsa, ibora topilmasdi.
 *
 * ⚠️ TOZA KIRILL MATNI BUZILMAYDI: jadval faqat lotinga O'XSHASH
 * harflarni almashtiradi, shuning uchun `молиявий` o'zgarmaydi va
 * ro'yxatdagi kirill iborasi bilan solishtiriladi.
 */
export const normalizeText = (text: string): string => {
  let folded = "";
  for (const char of text) folded += HOMOGLYPHS[char] ?? char;

  return folded
    .toLowerCase()
    .replace(/[‘’ʻʼ`´']/g, "'")
    .replace(/[​-‏⁠﻿­]/g, "")
    .replace(/\s+/g, " ")
    .trim();
};

/**
 * ⚠️ IBORA HAM AYNI FUNKSIYADAN O'TADI: aks holda ro'yxatdagi
 * apostrof turi matndagisi bilan mos kelmasdi.
 */
const NORMALIZED_PHRASES: readonly { raw: string; needle: string }[] =
  SCAM_PHRASES.map((raw) => ({ raw, needle: normalizeText(raw) }));

/** Matndagi birinchi firibgarlik iborasi; topilmasa `null`. */
export const findScamPhrase = (text: string): string | null => {
  const haystack = normalizeText(text);
  return NORMALIZED_PHRASES.find(({ needle }) => haystack.includes(needle))?.raw ?? null;
};

/**
 * SHOSHILTIRISH — KUCHSIZ DALIL, YAKKA ISHLAMAYDI.
 *
 * ⚠️ BU IBORALAR ASOSIY RO'YXATDAN ATAYLAB CHIQARILDI. Testda
 * "Yangi dorixona ochildi, chegirma faqat bugun: <havola>" degan
 * MUTLAQO QONUNIY e'lon o'chirilib ketdi: "faqat bugun" — oddiy
 * savdo tili va MFY guruhida kuniga uchraydi.
 *
 * ⚠️ SHUNING UCHUN ULAR UCHINCHI DARAJALI: faqat ASOSIY ibora
 * bilan BIRGA kelganda "ishonch darajasi"ni oshiradi, o'zi esa
 * hech qachon o'chirishga asos bo'lmaydi.
 */
const URGENCY_PHRASES: readonly string[] = [
  "muddat tugayapti",
  "faqat bugun",
  "joylar soni cheklangan",
  "shoshilinch ravishda",
  "oxirgi kun",
];

const NORMALIZED_URGENCY: readonly string[] = URGENCY_PHRASES.map(normalizeText);

/** Shoshiltirish iborasi bormi — qo'shimcha dalil sifatida. */
export const hasUrgency = (text: string): boolean => {
  const haystack = normalizeText(text);
  return NORMALIZED_URGENCY.some((needle) => haystack.includes(needle));
};

/**
 * KATTA PUL SUMMASI — IBORANI KUCHAYTIRUVCHI DALIL.
 *
 * ⚠️ "35 000 000 so'mgacha" — aldovning ilmog'i va u deyarli har
 * bir bunday xabarda bor.
 *
 * ⚠️ YAKKA O'ZI O'CHIRISHGA ASOS EMAS: "uy sotiladi 850 000 000
 * so'm" + havola — butunlay qonuniy e'lon. Summa faqat ASOSIY
 * ibora bilan birga sabab kalitini kuchaytiradi
 * (`scam_phrase_money`).
 *
 * ⚠️ CHEGARA 1 MLN: kichik summalar ("50 ming so'm a'zolik puli")
 * guruhda butunlay qonuniy ishlatiladi.
 *
 * ⚠️ VALYUTA TALAB QILINADI: yakka "35 000 000" telefon yoki hisob
 * raqami bo'lishi mumkin.
 */
const MONEY_THRESHOLD = 1_000_000;
const CURRENCY_NEAR = /(so'm|som|sum|сўм|сум|usd|dollar|\$)/i;

export const findLargeMoney = (text: string): number | null => {
  const haystack = normalizeText(text);

  // "35 000 000 so'm" / "35.000.000 sum"
  for (const match of haystack.matchAll(/\d{1,3}(?:[\s., ]\d{3}){2,}/g)) {
    const start = match.index ?? 0;
    const tail = haystack.slice(start, start + match[0].length + 24);
    if (!CURRENCY_NEAR.test(tail)) continue;

    const value = Number(match[0].replace(/[\s., ]/g, ""));
    if (Number.isFinite(value) && value >= MONEY_THRESHOLD) return value;
  }

  // "35 mln so'm" / "35 млн сўм"
  for (const match of haystack.matchAll(/(\d{1,4})\s*(?:mln|million|млн|миллион)/g)) {
    const start = match.index ?? 0;
    const tail = haystack.slice(start, start + match[0].length + 24);
    if (!CURRENCY_NEAR.test(tail)) continue;

    const value = Number(match[1]) * 1_000_000;
    if (value >= MONEY_THRESHOLD) return value;
  }

  return null;
};

/**
 * KO'RINADIGAN MANZIL HAQIQIYSIGA MOS KELMAYDI.
 *
 * ⚠️ BU YAKKA O'ZI YETARLI DALIL — ikki dalil talab qilinmaydi.
 * Namunadagi `gov.uz/vplt (https://uzbekistan.uzbekistonviplata.xyz/)`
 * da odam `gov.uz` ni o'qiydi, bosganda esa `.xyz` ga boradi.
 * QONUNIY xabar hech qachon rasmiy domen nomini yozib, boshqa
 * domenga olib bormaydi — bu ataylab qilingan aldov.
 *
 * ⚠️ FAQAT ISHONCHLI DOMEN NOMI TEKSHIRILADI (`gov.uz`, `soliq.uz`),
 * har qanday "matnda domen bor, havola boshqa" holati EMAS. Aks
 * holda "saytimiz example.uz, batafsil boshqa.uz da" degan oddiy
 * xabar ham tushib ketardi.
 */
const IMPERSONATED_DOMAINS: readonly string[] = [
  "gov.uz", "soliq.uz", "mehnat.uz", "president.uz", "senat.uz",
  "lex.uz", "davxizmat.uz", "my.gov.uz",
  "cbu.uz", "nbu.uz", "sqb.uz", "agrobank.uz", "ipotekabank.uz",
  "click.uz", "payme.uz", "paynet.uz", "uzum.uz",
];

/**
 * RASMIY SAHIFALAR TURADIGAN XIZMATLAR — ALDOV DALILI EMAS.
 *
 * ⚠️ BU RO'YXAT HAQIQIY NOTO'G'RI O'CHIRISHDAN KEYIN QO'SHILDI. IIV
 * ning firibgarlikka qarshi ogohlantirishi oxirida "Website |
 * Telegram | Facebook | Instagram | Youtube | Ok | TV" degan qator
 * bor va ularning HAR BIRI gipermurojaat: biri `gov.uz` ga, biri
 * `t.me/iivuz` ga. Eski qoida buni "ko'rinishda gov.uz, amalda
 * t.me" deb o'qib, RASMIY xabarni o'chirishga urindi.
 *
 * ⚠️ FAQAT "YASHIRILGAN MANZIL" QOIDASIDAN CHIQARILADI: qora
 * ro'yxat, qisqartirgich va "ikki dalil" tekshiruvlari bu hostlarga
 * BARIBIR ishlaydi — `t.me` dagi firibgar kanal himoyasiz
 * qolmaydi.
 */
const SOCIAL_HOSTS: readonly string[] = [
  "t.me", "telegram.me", "telegram.org", "telegram.dog",
  "facebook.com", "fb.com", "fb.me", "instagram.com",
  "youtube.com", "youtu.be", "ok.ru", "odnoklassniki.ru",
  "vk.com", "x.com", "twitter.com", "linkedin.com", "tiktok.com",
];

export interface DomainMismatch {
  shown: string;
  actual: string;
  url: string;
}

/**
 * ⚠️ IKKINCHI ARGUMENT — YASHIRIN MANZILLAR (`text_link` ichidagi
 * `url`), matndan ajratib olingan havolalar EMAS. Bu farq butun
 * qoidaning MA'NOSI: aldov — "yozilgani boshqa, ochiladigani
 * boshqa", ya'ni IKKI TOMON kerak. Matndagi `gov.uz/vplt` — odam
 * O'QIYDIGAN tomon; `entity.url` esa OCHILADIGAN tomon.
 *
 * ⚠️ AVVAL IKKALASI BIR QOPGA SOLINGAN EDI (`handler.ts` yashirin
 * manzillarni matnga QO'SHIB uzatardi) va aynan shuning uchun oddiy
 * KO'P HAVOLALI xabar — `gov.uz` ga ham, `t.me` ga ham havola
 * qilgan rasmiy e'lon — "yashirilgan manzil" deb topilgan. Ya'ni
 * qoida aldovni emas, HAVOLALAR SONINI o'qiyotgan edi.
 */
export const findDomainMismatch = (
  text: string,
  hiddenUrls: readonly string[],
): DomainMismatch | null => {
  const haystack = normalizeText(text);

  for (const shown of IMPERSONATED_DOMAINS) {
    // Matnda rasmiy domen NOMI tilga olinganmi
    if (!haystack.includes(shown)) continue;

    /**
     * ⚠️ HALOL HAVOLA DALILNI BEKOR QILADI: xabarda o'sha rasmiy
     * domenga HAQIQIY havola ham bo'lsa, domen nomi aldov uchun
     * emas, o'z o'rnida ishlatilgan. Firibgar bunday havolani
     * QO'YMAYDI — uning maqsadi odamni rasmiy saytdan UZOQLASHTIRISH.
     */
    const honest = hiddenUrls.some((url) => {
      const host = hostOf(url);
      return host !== null && (host === shown || host.endsWith(`.${shown}`));
    });
    if (honest) continue;

    for (const url of hiddenUrls) {
      const host = hostOf(url);
      if (!host) continue;

      // Havola o'sha rasmiy domenga ketsa — hammasi joyida
      if (host === shown || host.endsWith(`.${shown}`)) continue;

      // Boshqa rasmiy domenga ketsa ham muammo yo'q
      if (hostMatches(host, IMPERSONATED_DOMAINS)) continue;

      // Rasmiy sahifa turadigan xizmat — yuqoridagi izoh.
      if (hostMatches(host, SOCIAL_HOSTS)) continue;

      return { shown, actual: host, url };
    }
  }

  return null;
};

/**
 * FIRIBGARLIKKA QARSHI OGOHLANTIRISH — O'CHIRILMAYDI.
 *
 * ⚠️ RASMIY IDORA ALDOV IBORASINI AYNAN KO'CHIRIB YOZADI: IIV ning
 * ogohlantirishida «Pulingizni ko'paytirib beraman» degan ibora
 * QO'SHTIRNOQDA keltiriladi, undan keyin "aldanmang" deyiladi.
 * Ibora ro'yxati esa qo'shtirnoqni ko'rmaydi — ya'ni ogohlantirish
 * aldovning O'ZI deb o'chirilib ketardi.
 *
 * ⚠️ FAQAT `scam_text` QOIDASIGA TEGISHLI. Apk, qora ro'yxat,
 * qisqartirgich va yashirilgan manzil baribir ishlaydi — ya'ni bu
 * "sehrli so'z yozib qutulish" yo'li emas: firibgarning HAVOLASI
 * qoidaga tushsa, matnda nima yozilgani ahamiyatsiz.
 */
const WARNING_MARKERS: readonly string[] = [
  "aldanmang", "aldanib qolmang", "ishonmang", "ishonib qolmang",
  "firibgar", "firibgarlik", "firibgarlarga", "aldov", "aldamchi",
  "ogoh bo'ling", "hushyor bo'ling", "ehtiyot bo'ling",
  "ogohlantiramiz", "ogohlantirish", "aldanmaslik uchun",
  "алданманг", "ишонманг", "фирибгар", "фирибгарлик",
  "огоҳ бўлинг", "ҳушёр бўлинг", "эҳтиёт бўлинг", "огоҳлантирамиз",
];

const NORMALIZED_WARNINGS: readonly string[] = WARNING_MARKERS.map(normalizeText);

/** Matn firibgarlikdan OGOHLANTIRYAPTIMI (ya'ni aldovning o'zi emas). */
export const isFraudWarning = (text: string): boolean => {
  const haystack = normalizeText(text);
  return NORMALIZED_WARNINGS.some((needle) => haystack.includes(needle));
};

/**
 * MATN TEKSHIRUVI — HAVOLA, KEYIN FIRIBGARLIK.
 *
 * ⚠️ TARTIB MUHIM: avval havolaning O'ZI qoidaga tushadimi
 * (qisqartirgich, qora ro'yxat, IP) deb ko'riladi — bu ANIQ dalil.
 * Faqat shundan keyin "ikki dalil" qoidasi ishlaydi.
 *
 * ⚠️ BIRINCHI TOPILGAN YETARLI: xabar baribir BUTUNLAY o'chiriladi,
 * ya'ni qolgan havolalarni sanash yozuvni shishirardi.
 */
/**
 * XABARDAGI HAVOLALAR — IKKI ALOHIDA RO'YXAT.
 *
 * ⚠️ FARQ QOIDA UCHUN HAL QILUVCHI: matnda KO'RINADIGAN havolada
 * "yozilgani = ochiladigani" (Telegram uni o'zi havolaga
 * aylantiradi), `text_link` ichidagisi esa KO'RINMAYDI. "Yashirilgan
 * manzil" qoidasi aynan shu farqqa tayanadi, shuning uchun ikkisi
 * BIR QOPGA solinmaydi.
 */
export interface MessageLinks {
  /** `text_link` entity'laridagi manzillar — matnda KO'RINMAYDI. */
  hidden?: readonly string[];
  /** `url` entity'lari — matnda ko'rinadi, lekin regex o'tkazib yuborishi mumkin. */
  visible?: readonly string[];
}

export const inspectText = (
  text: string,
  config: GuardConfig,
  links: MessageLinks = {},
): ThreatVerdict | null => {
  if (!config.deleteUrls || !text) return null;

  const hidden = links.hidden ?? [];

  /**
   * ⚠️ HAMMA HAVOLA BIR RO'YXATDA — "havolaning o'zi qoidaga
   * tushadimi" va "ikki dalil" tekshiruvlari uchun. Yashirin manzil
   * ham HAVOLA: usiz "ibora bor, lekin havola yo'q" deb firibgarning
   * asosiy quroli o'tib ketardi.
   */
  const urls = [
    ...new Set([...extractUrls(text), ...(links.visible ?? []), ...hidden]),
  ];

  for (const url of urls) {
    const verdict = inspectUrl(url, config);
    if (verdict) return verdict;
  }

  /**
   * ── KO'RINADIGAN ≠ HAQIQIY MANZIL ────────────────────────────────
   *
   * ⚠️ YAKKA O'ZI YETARLI: rasmiy domen nomini yozib, boshqa saytga
   * olib borish — ataylab qilingan aldov, tasodif emas.
   */
  const mismatch = findDomainMismatch(text, hidden);
  if (mismatch) {
    return {
      kind: "masked_url",
      reason: `domain_mismatch:${mismatch.shown}`,
      url: mismatch.url,
      urlHost: mismatch.actual,
    };
  }

  /**
   * ── IKKI DALIL QOIDASI ───────────────────────────────────────────
   *
   * ⚠️ IKKINCHI DALIL — ISHONCHSIZ TASHQI HAVOLA. Oq ro'yxatdagi
   * domen (`gov.uz`) dalil BO'LMAYDI: raisning rasmiy e'lonida
   * aynan shunday havola bo'ladi.
   *
   * ⚠️ HAVOLASIZ XABAR HECH QACHON O'CHIRILMAYDI — matn qanchalik
   * shubhali bo'lsa ham. Firibgarlikning maqsadi odamni saytga
   * olib borish; havolasiz u foydasiz, demak o'chirishga HAQIQIY
   * asos yo'q.
   */
  const untrusted = urls.find((url) => {
    const host = hostOf(url);
    return host !== null && !hostMatches(host, config.allowedHosts);
  });

  if (!untrusted) return null;

  /**
   * ⚠️ OGOHLANTIRISHGA TEGILMAYDI — `isFraudWarning` izohi. Bu
   * tekshiruv FAQAT shu yerda, ya'ni yuqoridagi aniq dalillardan
   * (qora ro'yxat, qisqartirgich, yashirilgan manzil) KEYIN turadi.
   */
  if (isFraudWarning(text)) return null;

  const phrase = findScamPhrase(text);
  const money = findLargeMoney(text);

  /**
   * ⚠️ IBORA — YAGONA MAJBURIY DALIL. Summa va shoshiltirish
   * uni faqat KUCHAYTIRADI (sabab kalitida ko'rinadi), lekin
   * iborasiz ikkisi ham o'chirishga asos bo'lmaydi: "uy sotiladi
   * 850 000 000 so'm" + havola — qonuniy e'lon.
   */
  if (phrase) {
    /**
     * ⚠️ SABAB KALITIDA ENG KUCHLI DALIL KO'RSATILADI: panelda
     * ma'muriyat NIMA uchun o'chirilganini ko'rishi kerak —
     * "append-only dalil" shuni talab qiladi.
     */
    const reason = money
      ? `scam_phrase_money:${phrase}`
      : hasUrgency(text)
        ? `scam_phrase_urgency:${phrase}`
        : `scam_phrase:${phrase}`;

    return {
      kind: "scam_text",
      reason,
      url: untrusted,
      urlHost: hostOf(untrusted) ?? undefined,
    };
  }

  return null;
};
