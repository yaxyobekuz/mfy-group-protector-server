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
 * ARXIVLAR — ichida nima borligini bilib bo'lmaydi.
 *
 * ⚠️ ALOHIDA RO'YXAT: arxiv o'z-o'zidan zararli EMAS (MFY xodimi
 * hujjatlarni zip qilib tashlashi mumkin), lekin u o'rnatma faylni
 * YASHIRISHNING eng keng tarqalgan yo'li. Shuning uchun u
 * "noma'lum tur" deb belgilanadi va o'chirish sozlamada
 * yoqilgandagina bo'ladi.
 */
const ARCHIVE_EXTENSIONS = new Set(["zip", "rar", "7z", "tar", "gz", "bz2", "xz"]);

/**
 * HAVOLANI YASHIRADIGAN QISQARTIRGICHLAR.
 *
 * ⚠️ QISQARTIRGICH O'ZI ZARARLI EMAS, lekin u manzilni KO'RSATMAYDI:
 * odam qayerga borayotganini bilmay bosadi va firibgarlik aynan
 * shunga tayanadi. Guruhda qisqartirilgan havolaning foydali ishlatilishi
 * kam — rasmiy e'lon to'liq manzil bilan tashlanadi.
 */
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
const URL_REGEX = /\bhttps?:\/\/[^\s<>"']+|(?<![@\w.])(?:www\.)[^\s<>"']+/gi;

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

  if (ext && ARCHIVE_EXTENSIONS.has(ext)) {
    return { kind: "unknown_file", reason: `archive_extension:${ext}` };
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

  if (hostMatches(host, config.blockedHosts)) {
    return { kind: "suspicious_url", reason: "blocked_host", url, urlHost: host };
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

export interface DomainMismatch {
  shown: string;
  actual: string;
  url: string;
}

export const findDomainMismatch = (
  text: string,
  urls: readonly string[],
): DomainMismatch | null => {
  const haystack = normalizeText(text);

  for (const shown of IMPERSONATED_DOMAINS) {
    // Matnda rasmiy domen NOMI tilga olinganmi
    if (!haystack.includes(shown)) continue;

    for (const url of urls) {
      const host = hostOf(url);
      if (!host) continue;

      // Havola o'sha rasmiy domenga ketsa — hammasi joyida
      if (host === shown || host.endsWith(`.${shown}`)) continue;

      // Boshqa rasmiy domenga ketsa ham muammo yo'q
      if (hostMatches(host, IMPERSONATED_DOMAINS)) continue;

      return { shown, actual: host, url };
    }
  }

  return null;
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
export const inspectText = (
  text: string,
  config: GuardConfig,
): ThreatVerdict | null => {
  if (!config.deleteUrls || !text) return null;

  const urls = extractUrls(text);

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
  const mismatch = findDomainMismatch(text, urls);
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
