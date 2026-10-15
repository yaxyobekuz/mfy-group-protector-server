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
  | "masked_url";

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

/**
 * MATNDAGI BARCHA HAVOLALARNI TEKSHIRADI — BIRINCHI topilgani
 * qaytariladi.
 *
 * ⚠️ BITTASI YETARLI: xabar baribir BUTUNLAY o'chiriladi, ya'ni
 * qolgan havolalarni sanash yozuvni shishirardi.
 */
export const inspectText = (
  text: string,
  config: GuardConfig,
): ThreatVerdict | null => {
  if (!config.deleteUrls || !text) return null;

  for (const url of extractUrls(text)) {
    const verdict = inspectUrl(url, config);
    if (verdict) return verdict;
  }

  return null;
};
