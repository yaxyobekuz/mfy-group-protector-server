/**
 * MUHIT SOZLAMALARI — bitta joyda o'qiladi va TEKSHIRILADI.
 *
 * ⚠️ `process.env` GA TO'G'RIDAN-TO'G'RI MUROJAAT QILINMAYDI (bu fayldan
 * boshqa joyda). Sabab: `process.env.FOO` har doim `string | undefined`
 * va uni har ishlatish joyida tekshirish kerak bo'ladi. Amalda bu
 * tekshiruv tushib qoladi va xato ishga tushgandan KEYIN, birinchi
 * so'rovda chiqadi — ko'pincha ishlab chiqarishda.
 *
 * ⚠️ TEKSHIRUV STARTUP'DA. Majburiy qiymat yo'q bo'lsa jarayon
 * KO'TARILMAYDI. Yarim sozlangan server "ishlayapti" deb turib, har
 * so'rovda 500 qaytarishdan ko'ra yaxshi.
 */

import { join, resolve } from "node:path";

/** Majburiy satr — bo'sh bo'lsa startup to'xtaydi. */
const required = (key: string): string => {
  const value = process.env[key]?.trim();
  if (!value) {
    throw new Error(
      `[config] ${key} majburiy, lekin berilmagan. .env.example faylini ko'ring.`,
    );
  }
  return value;
};

/** Majburiy emas — bo'sh bo'lsa `undefined` (bo'sh satr EMAS). */
const optional = (key: string): string | undefined => {
  const value = process.env[key]?.trim();
  return value ? value : undefined;
};

const int = (key: string, fallback: number): number => {
  const raw = process.env[key]?.trim();
  if (!raw) return fallback;

  const parsed = Number.parseInt(raw, 10);
  // ⚠️ `NaN` JIM O'TKAZILMAYDI: `PORT=abc` bo'lsa server 0-portda
  // ko'tarilib, hech kim ulanmay qolardi.
  if (Number.isNaN(parsed)) {
    throw new Error(`[config] ${key} son bo'lishi kerak, "${raw}" berilgan`);
  }
  return parsed;
};

/**
 * CORS manzillari — vergul bilan ajratilgan ro'yxat.
 *
 * ⚠️ `*` ISHLATILMAYDI. Panel `credentials: true` bilan ishlaydi
 * (refresh token cookie'da) va brauzer `*` + credentials
 * birikmasini RAD ETADI — xato esa faqat brauzer konsolida ko'rinib,
 * server logida jim qolardi.
 */
const list = (key: string, fallback: string[]): string[] => {
  const raw = process.env[key]?.trim();
  if (!raw) return fallback;

  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
};

/**
 * `jsonwebtoken` ning `expiresIn` turi ("15m", "30d", "2h").
 *
 * ⚠️ `@nestjs/jwt` buni `ms` paketidan oladi va u shablon turi
 * (`${number}${unit}`). Bu yerda uni soddalashtirib e'lon qilamiz:
 * qiymat `.env` dan keladi va kompilyatsiyada tekshirilmaydi.
 */
type JwtTtl = `${number}${"s" | "m" | "h" | "d"}`;

const nodeEnv = process.env.NODE_ENV?.trim() || "development";

export const env = {
  nodeEnv,
  isProduction: nodeEnv === "production",
  isDevelopment: nodeEnv === "development",

  port: int("PORT", 4000),
  corsOrigins: list("CORS_ORIGINS", ["http://localhost:3000"]),

  databaseUrl: required("DATABASE_URL"),

  jwt: {
    // ⚠️ IKKI ALOHIDA SIR — bitta sir ishlatilsa access token refresh
    // sifatida ham o'tib ketish xavfi tug'ilardi.
    accessSecret: required("JWT_ACCESS_SECRET"),
    refreshSecret: required("JWT_REFRESH_SECRET"),
    // ⚠️ TUR MAJBURLANADI (`as`): `jsonwebtoken` `expiresIn` uchun
    // o'zining `StringValue` shablon turini talab qiladi ("15m",
    // "30d"), oddiy `string` esa unga to'g'ri kelmaydi. Qiymat
    // `.env` dan keladi, ya'ni uni kompilyatsiyada tekshirib
    // bo'lmaydi — xato format bo'lsa `jsonwebtoken` ishga tushishda
    // o'zi xato otadi va buni startup logida ko'rish mumkin.
    accessTtl: (process.env.JWT_ACCESS_TTL?.trim() || "15m") as JwtTtl,
    refreshTtl: (process.env.JWT_REFRESH_TTL?.trim() || "30d") as JwtTtl,
  },

  /**
   * ⚠️ MAJBURIY EMAS. Kalit bo'lmasa tizim ISHLAYDI: guruh xabarlari
   * to'planadi, lekin tahlil qilinmaydi. Bu fon ishi — uni majburiy
   * qilish AI'siz ishlatmoqchi bo'lgan tashkilotga tizimni butunlay
   * yopib qo'yardi.
   */
  openaiApiKey: optional("OPENAI_API_KEY"),

  /**
   * BOT KALITI — bot serverga shu bilan murojaat qiladi.
   *
   * ⚠️ MAJBURIY: botsiz tizimning yarmi (guruh kuzatuvi) ishlamaydi va
   * kalit yo'qligini ishga tushishda bilish kerak, botning birinchi
   * so'rovida 401 olganida emas.
   */
  botApiKey: required("BOT_API_KEY"),

  /**
   * Serverdan botga/fuqaroga xabar yuborish uchun. Bo'lmasa javob
   * yuborilmaydi. Mini App'da `initData` imzosini tekshirish ham SHU
   * token bilan (Telegram WebApp spetsifikatsiyasi).
   */
  botToken: optional("BOT_TOKEN"),

  /**
   * MINI APP (FUQARO MUROJAATLARI).
   *
   * ⚠️ `mobileJwtSecret` — UCHINCHI ALOHIDA SIR (JWT access/refresh dan
   * ham, bir-biridan ham alohida). Fuqaro tokeni shu bilan imzolanadi:
   * `typ` tekshiruvi tushib qolsa ham fuqaro tokeni panelga KIRA
   * OLMAYDI, chunki xodim tokeni boshqa sir bilan imzolangan.
   *
   * ⚠️ MAJBURIY: Mini App yoqilgan bo'lsa fuqaro umuman kira olmaydi va
   * buni ishga tushishda bilish kerak.
   */
  mobileJwtSecret: required("MOBILE_JWT_SECRET"),
  mobileJwtTtl: (process.env.MOBILE_JWT_TTL?.trim() || "30d") as JwtTtl,

  /**
   * Mini App manzili — bot menyu tugmasi (`setChatMenuButton`) va CORS
   * uchun. Bo'sh bo'lsa menyu tugmasi qo'yilmaydi (tizim ishlaydi).
   */
  mobileAppUrl: optional("MOBILE_APP_URL"),

  /**
   * MOBIL ILOVA (Flutter) — GOOGLE BILAN KIRISH.
   *
   * ⚠️ BU — WEB TURIDAGI OAuth mijoz id'si, Android/iOS niki EMAS.
   * `google_sign_in` ga `serverClientId` sifatida aynan shu beriladi
   * va u qaytargan `id_token` ning `aud` maydoni SHU qiymatga teng
   * bo'ladi. Android mijoz id'si yozilsa, imzo to'g'ri bo'lsa ham
   * `aud` mos kelmay, kirish "yaroqsiz token" bilan rad etilardi.
   *
   * ⚠️ MAJBURIY EMAS: bo'lmasa Google kirishi O'CHADI (endpoint 503
   * beradi), lekin mini-ilova (Telegram) ishlayveradi — ikki kirish
   * yo'li bir-biriga bog'liq emas.
   *
   * ⚠️ iOS MIJOZ ID'SI ALOHIDA (`GOOGLE_IOS_CLIENT_ID`): iOS'da
   * `google_sign_in` `aud` ni O'ZINING mijoz id'siga qo'yadi va
   * yagona `aud` tekshiruvi iPhone'dan kirishni butunlay
   * bloklardi.
   */
  googleClientId: optional("GOOGLE_CLIENT_ID"),
  googleIosClientId: optional("GOOGLE_IOS_CLIENT_ID"),

  /**
   * YUKLANGAN FAYLLAR PAPKASI (murojaat dalillari).
   *
   * ⚠️ STANDART QIYMAT — `process.cwd()/uploads/appeals`, ya'ni LOYIHA
   * KATALOGINING ICHIDA. Ishlab chiqishda qulay, lekin DEPLOY'DA
   * XAVFLI: konteyner qayta qurilganda yoki kod yangi katalogga
   * clone qilinganda papka kod bilan BIRGA ketadi va fayllar
   * YO'QOLADI. Bazada esa faqat yo'l saqlanadi (`IssueAttachment`),
   * ya'ni murojaat ko'rinib turadi, DALILI esa yo'q bo'ladi.
   *
   * ⚠️ ISHLAB CHIQARISHDA SHU O'ZGARUVCHI MAJBURIY QO'YILADI va
   * qiymat kod katalogidan TASHQARIDA bo'lishi kerak (Docker'da —
   * volume ulangan yo'l). "Fayl — dalil, bezak emas" qoidasi
   * shunisiz saqlanmaydi.
   */
  uploadsDir: resolve(
    optional("UPLOADS_DIR") ?? join(process.cwd(), "uploads", "appeals"),
  ),

  timezone: process.env.TIMEZONE?.trim() || "Asia/Tashkent",
} as const;

export type Env = typeof env;
