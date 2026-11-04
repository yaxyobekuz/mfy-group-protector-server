/**
 * APPLE TOKEN XIZMATI — `authorizationCode` ni almashtirish va
 * RUXSATNI BEKOR QILISH (`/auth/revoke`).
 *
 * ── NIMA UCHUN BOR ────────────────────────────────────────────────────
 *
 * ⚠️ APP STORE QOIDASI 5.1.1(v): "Sign in with Apple" bilan kirgan
 * fuqaro hisobini o'chirganda Apple TOMONIDAGI ruxsat ham bekor
 * qilinishi SHART. Faqat bazani tozalash YETARLI EMAS — iPhone
 * sozlamalarida ilova "Apple ID bilan bog'langan" bo'lib turardi va
 * App Store tekshiruvi aynan shuni ushlaydi.
 *
 * ── NIMA UCHUN TOKEN KIRISHDA OLINADI ─────────────────────────────────
 *
 * ⚠️ `refresh_token` NI O'CHIRISH PAYTIDA OLIB BO'LMAYDI: uni faqat
 * `authorizationCode` ga almashtirib olish mumkin, kod esa BIR
 * MARTALIK va bir necha daqiqada so'nadi — ya'ni u faqat KIRISH
 * paytida qo'limizda bo'ladi. Shuning uchun kirishda olinadi,
 * shifrlanadi (`secret-box.ts`) va bazada saqlanadi.
 *
 * ── `client_secret` — PAROL EMAS ───────────────────────────────────────
 *
 * ⚠️ APPLE `client_secret` SIFATIDA ES256 BILAN IMZOLANGAN JWT KUTADI.
 * Uni har chaqiruvda O'ZIMIZ yasaymiz va `.p8` kaliti bilan
 * imzolaymiz. Doimiy parol yo'q — shuning uchun "sirni almashtirish"
 * degan amal ham yo'q.
 *
 * ⚠️ `jose` ALLAQACHON BOR (`mobile-auth.service.ts` Apple `id_token`
 * ni shu bilan tekshiradi) — yangi kutubxona qo'shilmaydi.
 *
 * ── XATO HECH QACHON YUQORIGA CHIQMAYDI ───────────────────────────────
 *
 * ⚠️ HAR METOD XATONI O'ZI YUTADI va `null`/`false` qaytaradi
 * (`audit.service.ts` bilan ayni qoida). Sabab: Apple javob bermasa
 * ham fuqaro KIRISHI va hisobini O'CHIRISHI kerak. Aks holda Apple
 * xizmati sekinlashgan paytda butun iOS kirishi to'xtardi, o'chirish
 * esa "hisobimni o'chirib bo'lmayapti" holatida qolardi — bu do'kon
 * talabini BUZISH bo'lardi.
 */

import { readFile } from "node:fs/promises";

import { Injectable, Logger } from "@nestjs/common";
import { SignJWT, importPKCS8, type KeyLike } from "jose";

import { env } from "../../config/env.config";

const APPLE_TOKEN_URL = "https://appleid.apple.com/auth/token";
const APPLE_REVOKE_URL = "https://appleid.apple.com/auth/revoke";
const APPLE_AUDIENCE = "https://appleid.apple.com";

/**
 * `client_secret` muddati.
 *
 * ⚠️ APPLE ENG KO'PI 6 OY RUXSAT BERADI, lekin biz qisqa muddat
 * (5 daqiqa) qo'yamiz: JWT har chaqiruvda qaytadan yasaladi va uzoq
 * muddatli token hech qayerda saqlanmaydi, ya'ni o'g'irlanishi
 * mumkin bo'lgan narsa ham yo'q.
 */
const CLIENT_SECRET_TTL = "5m";

/**
 * Tarmoq kutish muddati (ms).
 *
 * ⚠️ MAJBURIY: `fetch` standart holda MUDDATSIZ kutadi. Apple javob
 * bermay qotib qolsa, hisobni o'chirish so'rovi ham cheksiz osilib
 * turardi va fuqaro ilovada "yuklanmoqda" ekranida qolardi.
 */
const REQUEST_TIMEOUT_MS = 10_000;

@Injectable()
export class AppleTokenService {
  private readonly logger = new Logger(AppleTokenService.name);

  /**
   * ⚠️ KALIT BIR MARTA O'QILADI VA KESHLANADI: `importPKCS8` har
   * chaqiruvda ishlatilsa, diskdan o'qish va kalitni tahlil qilish
   * har kirishda takrorlanardi.
   *
   * ⚠️ `undefined` — HALI O'QILMAGAN; `null` — O'QILDI, LEKIN YO'Q
   * (sozlanmagan yoki fayl topilmadi). Ikkisi ajratiladi, aks holda
   * sozlanmagan holatda har chaqiruv diskka borib urinardi.
   */
  private cachedKey: KeyLike | null | undefined = undefined;

  /** Apple revoke sozlanganmi — `mobile-auth` kod so'rashni shunga qarab hal qiladi. */
  get isConfigured(): boolean {
    return Boolean(
      env.appleClientId &&
        env.apple.teamId &&
        env.apple.keyId &&
        (env.apple.privateKey || env.apple.privateKeyPath),
    );
  }

  /**
   * `authorizationCode` → `refresh_token`.
   *
   * ⚠️ `null` QAYTISHI NORMAL HOLAT: Apple sozlanmagan, kod
   * berilmagan (eski ilova versiyasi) yoki Apple rad etdi. O'shanda
   * `appleRefreshToken` bo'sh qoladi va o'chirishda revoke O'TKAZIB
   * YUBORILADI — kirish esa BARIBIR davom etadi.
   */
  async exchangeCode(code: string): Promise<string | null> {
    if (!this.isConfigured) return null;

    const clientSecret = await this.buildClientSecret();
    if (!clientSecret) return null;

    try {
      const response = await fetch(APPLE_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: env.appleClientId!,
          client_secret: clientSecret,
          code,
          grant_type: "authorization_code",
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (!response.ok) {
        // ⚠️ MATN LOGGA: Apple sababni `{"error":"invalid_grant"}`
        // ko'rinishida beradi va uni ko'rmasdan "nega refresh token
        // yo'q" degan savolga javob topib bo'lmaydi.
        this.logger.warn(
          `Apple code almashtirilmadi (${response.status}): ${await this.safeText(response)}`,
        );
        return null;
      }

      const data = (await response.json()) as { refresh_token?: unknown };

      // ⚠️ TUR TEKSHIRILADI: kutilmagan shakl bazaga tushmasligi
      // kerak (keyin shifrlanib, o'chirishda jim ishlamay qolardi).
      return typeof data.refresh_token === "string" && data.refresh_token
        ? data.refresh_token
        : null;
    } catch (error) {
      this.logger.warn(`Apple code almashtirilmadi: ${String(error)}`);
      return null;
    }
  }

  /**
   * RUXSATNI BEKOR QILADI (hisob o'chirilganda).
   *
   * ⚠️ NATIJA FAQAT LOG UCHUN: `false` bo'lsa ham hisob o'chadi.
   * Qaytarilgan qiymat chaqiruvchiga "logda ko'rinsinmi" degan
   * savolga javob beradi, OQIMNI boshqarmaydi.
   */
  async revoke(refreshToken: string): Promise<boolean> {
    if (!this.isConfigured) {
      this.logger.log("Apple revoke o'tkazib yuborildi — kalitlar sozlanmagan");
      return false;
    }

    const clientSecret = await this.buildClientSecret();
    if (!clientSecret) return false;

    try {
      const response = await fetch(APPLE_REVOKE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: env.appleClientId!,
          client_secret: clientSecret,
          token: refreshToken,
          token_type_hint: "refresh_token",
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (!response.ok) {
        this.logger.warn(
          `Apple revoke rad etildi (${response.status}): ${await this.safeText(response)}`,
        );
        return false;
      }

      // ⚠️ MUVAFFAQIYAT LOGGA YOZILADI: do'kon tekshiruvida "revoke
      // haqiqatan chaqirilganmi" degan savolga javob SHU qator
      // bo'ladi (qabul qilish mezoni).
      this.logger.log("Apple ruxsati bekor qilindi (/auth/revoke → 200)");
      return true;
    } catch (error) {
      this.logger.warn(`Apple revoke chaqirilmadi: ${String(error)}`);
      return false;
    }
  }

  // ─────────────────────────────────────────────────────────────────
  //  Ichki
  // ─────────────────────────────────────────────────────────────────

  /**
   * `client_secret` — ES256 bilan imzolangan JWT.
   *
   * Apple talab qiladigan claim'lar:
   *   iss = Team ID,  aud = appleid.apple.com,  sub = client_id (bundle id)
   * sarlavhada esa `kid` = `.p8` kaliti id'si.
   */
  private async buildClientSecret(): Promise<string | null> {
    const key = await this.loadKey();
    if (!key) return null;

    try {
      return await new SignJWT({})
        .setProtectedHeader({ alg: "ES256", kid: env.apple.keyId! })
        .setIssuer(env.apple.teamId!)
        .setAudience(APPLE_AUDIENCE)
        // ⚠️ `sub` = BUNDLE ID (`aud` tekshiruvidagi qiymat bilan
        // AYNI): Apple uchun bu "qaysi ilova so'rayapti" degani.
        .setSubject(env.appleClientId!)
        .setIssuedAt()
        .setExpirationTime(CLIENT_SECRET_TTL)
        .sign(key);
    } catch (error) {
      this.logger.error(`Apple client_secret imzolanmadi: ${String(error)}`);
      return null;
    }
  }

  /**
   * `.p8` kalitini o'qiydi — PEM matni yoki fayl yo'lidan.
   *
   * ⚠️ IKKI SHAKL: `.env` ichida ko'p qatorli PEM saqlash noqulay
   * (`\n` qo'lda yoziladi), shuning uchun fayl yo'li ham qabul
   * qilinadi. `APPLE_PRIVATE_KEY` ustun turadi.
   */
  private async loadKey(): Promise<KeyLike | null> {
    if (this.cachedKey !== undefined) return this.cachedKey;

    const pem = await this.readPem();
    if (!pem) {
      this.cachedKey = null;
      return null;
    }

    try {
      this.cachedKey = await importPKCS8(pem, "ES256");
      return this.cachedKey;
    } catch (error) {
      // ⚠️ XATO BIR MARTA YOZILADI (`cachedKey = null`): aks holda
      // har kirish logga bir xil qatorni qo'shib, log hajmini
      // portlatardi.
      this.logger.error(
        `APPLE_PRIVATE_KEY o'qilmadi — Apple revoke o'chiq: ${String(error)}`,
      );
      this.cachedKey = null;
      return null;
    }
  }

  private async readPem(): Promise<string | null> {
    const inline = env.apple.privateKey;
    if (inline) {
      // ⚠️ `\n` QATOR AJRATGICHGA AYLANTIRILADI: `.env` faylida
      // haqiqiy yangi qator yozib bo'lmaydi va PEM bir qatorga
      // `\n` belgilar bilan yoziladi. Almashtirilmasa `importPKCS8`
      // "yaroqsiz kalit" deb rad etardi.
      return inline.includes("\\n") ? inline.replace(/\\n/g, "\n") : inline;
    }

    const path = env.apple.privateKeyPath;
    if (!path) return null;

    try {
      return await readFile(path, "utf8");
    } catch (error) {
      this.logger.error(
        `APPLE_PRIVATE_KEY_PATH o'qilmadi (${path}): ${String(error)}`,
      );
      return null;
    }
  }

  /**
   * Javob matnini xavfsiz o'qiydi.
   *
   * ⚠️ `response.text()` NING O'ZI XATO OTISHI MUMKIN (ulanish
   * uzilsa) va o'shanda LOG YOZISH urinishi asosiy xatoni
   * yashirardi.
   */
  private async safeText(response: Response): Promise<string> {
    try {
      return (await response.text()).slice(0, 300);
    } catch {
      return "(javob o'qilmadi)";
    }
  }
}
