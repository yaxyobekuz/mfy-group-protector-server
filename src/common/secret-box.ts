/**
 * SIR QUTISI — bazada saqlanadigan TIRIK sirni shifrlaydi.
 *
 * ── MUAMMO ────────────────────────────────────────────────────────────
 *
 * Apple `refresh_token` — hisobni o'chirishda ruxsatni bekor qilish
 * (`/auth/revoke`) uchun SAQLANISHI SHART, chunki uni o'chirish
 * vaqtida qayta olib bo'lmaydi (`authorizationCode` bir martalik).
 *
 * Lekin u TIRIK ruxsat: o'qigan odam fuqaro nomidan Apple'dan yangi
 * `id_token` olishi mumkin, ya'ni uning hisobiga kira oladi. Bazaga
 * XOM yozilsa, zaxira nusxasi (dump) tarqalganda HAR BIR iOS
 * fuqaroning hisobi ochilib ketardi — va buni hech kim sezmasdi.
 *
 * ── YECHIM ────────────────────────────────────────────────────────────
 *
 * `AES-256-GCM`. Kalit `MOBILE_JWT_SECRET` dan SHA-256 bilan olinadi
 * (`signed-ref.ts` bilan ayni mantiq: bitta sirning ikki MUSTAQIL
 * ishlatilishi KONTEKST bilan ajratiladi, biri ikkinchisiga
 * o'tkazilmaydi).
 *
 * ⚠️ `GCM` TANLANDI, `CBC` EMAS: u shifrlash bilan BIRGA butunlikni
 * ham tekshiradi (`authTag`). CBC'da buzilgan qiymat jimgina
 * axlat matnga aylanib, Apple'ga yuborilardi va xato sababi
 * "Apple rad etdi" bo'lib ko'rinardi — haqiqiy sabab esa baza
 * ustuni buzilgani bo'lardi.
 *
 * ⚠️ `iv` HAR SHIFRLASHDA YANGI (tasodifiy): bir xil `iv` bilan ikki
 * qiymat shifrlansa, GCM himoyasi BUTUNLAY buziladi. Shuning uchun u
 * natijaning ichida, ochiq holda saqlanadi — bu normal, `iv` sir
 * emas.
 *
 * ⚠️ KALIT ALMASHTIRILSA ESKI QIYMATLAR O'QILMAYDI (`null` qaytadi).
 * Bu — Apple revoke o'tkazib yuboriladi, o'chirish esa BARIBIR davom
 * etadi degani (`mobile.service.ts`). Teskarisi — "kalit o'zgardi,
 * endi hech kim hisobini o'chira olmaydi" — ancha yomon bo'lardi.
 */

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

import { env } from "../config/env.config";

/**
 * KONTEKSTLAR — YAGONA MANBA.
 *
 * ⚠️ SATR SIFATIDA QO'LDA YOZILMAYDI: kontekst kalitni belgilaydi,
 * ya'ni yozishda bitta harf xato bo'lsa shifrlash BOSHQA kalit bilan
 * ketardi. Xato esa faqat ochishda — ya'ni oylar keyin, hisob
 * o'chirilayotganda — "token ochilmadi" bo'lib chiqardi va revoke
 * jimgina o'tkazib yuborilardi.
 */
export const SECRET_CONTEXT = {
  /** Apple `refresh_token` (`mobile-auth` yozadi, `mobile` o'qiydi). */
  APPLE_REFRESH: "apple-refresh",
} as const;

const ALGORITHM = "aes-256-gcm";
/** GCM uchun tavsiya etilgan uzunlik. */
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

/**
 * Kontekstga bog'langan 32-baytli kalit.
 *
 * ⚠️ KONTEKST `signed-ref.ts` DAN BOSHQA: shu tufayli imzo kaliti
 * shifrlash kaliti sifatida ishlatilmaydi va aksincha.
 */
const keyFor = (context: string): Buffer =>
  createHash("sha256")
    .update(`${env.mobileJwtSecret}:secret-box:${context}`)
    .digest();

/** Shifrlaydi — `<iv>.<tag>.<ciphertext>` (hammasi base64url). */
export const sealSecret = (context: string, plaintext: string): string => {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, keyFor(context), iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  return [
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
};

/**
 * Ochadi; buzilgan/boshqa kalit bilan shifrlangan bo'lsa `null`.
 *
 * ⚠️ XATO OTILMAYDI, `null` QAYTADI: chaqiruvchi (hisobni o'chirish)
 * buning uchun TO'XTAMASLIGI kerak — revoke o'tkazib yuboriladi,
 * o'chirish davom etadi.
 */
export const openSecret = (context: string, sealed: string): string | null => {
  const parts = sealed.split(".");
  if (parts.length !== 3) return null;

  const [rawIv, rawTag, rawData] = parts as [string, string, string];

  try {
    const iv = Buffer.from(rawIv, "base64url");
    const tag = Buffer.from(rawTag, "base64url");
    if (iv.length !== IV_LENGTH || tag.length !== TAG_LENGTH) return null;

    const decipher = createDecipheriv(ALGORITHM, keyFor(context), iv);
    decipher.setAuthTag(tag);

    return Buffer.concat([
      decipher.update(Buffer.from(rawData, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    // ⚠️ `final()` BUTUNLIK BUZILGANDA XATO OTADI — aynan shu yerda
    // ushlanadi va `null` ga aylanadi.
    return null;
  }
};
