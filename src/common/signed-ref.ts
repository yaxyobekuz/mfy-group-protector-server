/**
 * IMZOLANGAN HAVOLA — mijoz aytgan qiymatga ISHONMASLIK uchun.
 *
 * ── MUAMMO ────────────────────────────────────────────────────────────
 *
 * Mini App ikki joyda serverga "men ilgari olgan natijani" qaytaradi:
 *
 *   1. Yuklangan fayl (`token`) — murojaat yaratishda qayta yuboriladi.
 *   2. AI toifa taklifi — murojaat yaratishda `sourceMeta.ai` ga yoziladi.
 *
 * Agar shu qiymatlarga SHUNCHAKI ishonilsa, mijoz brauzer konsolidan
 * istalgan narsani yuborardi: panelda "AI 94% ishonch bilan shuni
 * aytgan" degan SOXTA DALIL yoki o'zi ko'rmagan faylga havola paydo
 * bo'lardi.
 *
 * ── YECHIM ────────────────────────────────────────────────────────────
 *
 * Server qiymatni HMAC bilan IMZOLAB beradi. Mijoz uni o'zgartira
 * olmaydi (sirni bilmaydi) va server qaytib kelganda imzoni qayta
 * tekshiradi. Buzilgan yoki muddати o'tgan imzo rad etiladi.
 *
 * ⚠️ MUDDAT BOR (6 soat): imzo cheksiz yashasa, bir marta olingan
 * token qayta-qayta ishlatilardi. Qoralama ham shuncha vaqt ma'noli
 * (`mobile/.../wizard-state.ts` DRAFT_TTL bilan ayni).
 *
 * ⚠️ SIR `MOBILE_JWT_SECRET` DAN OLINADI (alohida "context" bilan):
 * token imzolash va havola imzolash bir sirning ikki MUSTAQIL
 * ishlatilishi — biri ikkinchisiga o'tkazib ishlatilmasligi uchun
 * HMAC kaliti kontekst bilan ajratiladi.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

import { env } from "../config/env.config";

/** Imzo 6 soat yaroqli. */
const TTL_MS = 6 * 60 * 60 * 1000;

/** `base64url` — URL va JSON'da xavfsiz, `+ / =` belgilarisiz. */
const b64url = (value: string | Buffer): string =>
  Buffer.from(value).toString("base64url");

/**
 * Kontekstga bog'langan HMAC kaliti.
 *
 * ⚠️ "upload" va "ai" alohida kontekst: upload imzosini AI imzosi
 * sifatida o'tkazib bo'lmaydi.
 */
const keyFor = (context: string): string => `${env.mobileJwtSecret}:signed-ref:${context}`;

const mac = (context: string, data: string): string =>
  createHmac("sha256", keyFor(context)).update(data).digest("base64url");

/**
 * Qiymatni imzolaydi — `<payload>.<exp>.<mac>`.
 *
 * `value` — ixtiyoriy JSON-serializable obyekt.
 */
export const signRef = (context: string, value: unknown): string => {
  const payload = b64url(JSON.stringify(value));
  const exp = String(Date.now() + TTL_MS);
  const signature = mac(context, `${payload}.${exp}`);
  return `${payload}.${exp}.${signature}`;
};

/**
 * Imzoni tekshiradi va qiymatni qaytaradi; buzilgan/muddati o'tgan
 * bo'lsa `null`.
 *
 * ⚠️ `timingSafeEqual` DOIMIY VAQTDA: oddiy `===` imzoni bayt-bayt
 * topishga yo'l ochardi.
 */
export const verifyRef = <T = unknown>(context: string, token: string): T | null => {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [payload, exp, signature] = parts as [string, string, string];

  const expected = mac(context, `${payload}.${exp}`);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const expMs = Number.parseInt(exp, 10);
  if (!Number.isFinite(expMs) || Date.now() > expMs) return null;

  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
};
