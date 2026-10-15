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

  /** Serverdan botga xabar yuborish uchun. Bo'lmasa javob yuborilmaydi. */
  botToken: optional("BOT_TOKEN"),

  timezone: process.env.TIMEZONE?.trim() || "Asia/Tashkent",
} as const;

export type Env = typeof env;
