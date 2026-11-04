/**
 * MINI APP KIRISHI — Telegram `initData` tekshiruvi va fuqaro tokeni.
 *
 * ── NIMA UCHUN PAROL YO'Q ─────────────────────────────────────────────
 *
 * Fuqaro allaqachon Telegram'da autentifikatsiyadan o'tgan. Telegram
 * mini-ilovaga IMZOLANGAN `initData` beradi va uning imzosini faqat bot
 * tokeni egasi (ya'ni biz) tekshira oladi. Shuning uchun parol, OTP yoki
 * refresh token KERAK EMAS — kirish bitta imzo tekshiruvi.
 *
 * ⚠️ TOKEN UZOQ MUDDATLI (30 kun) VA REFRESH YO'Q: eskirganda ilova
 * Telegram'dan yangi `initData` olib qaytadan kiradi. Refresh oqimi
 * (rotatsiya, "qayta ishlatilgan token") bu yerda ortiqcha murakkablik
 * bo'lardi.
 *
 * ⚠️ FUQARO TOKENI UCHINCHI ALOHIDA SIR bilan imzolanadi
 * (`MOBILE_JWT_SECRET`): xodim tokeni boshqa sir bilan, ya'ni fuqaro
 * tokeni panelga struktura jihatidan KIRA OLMAYDI.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

import {
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { OAuth2Client, type TokenPayload } from "google-auth-library";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

import { env } from "../../config/env.config";
import { PrismaService } from "../../prisma/prisma.service";

/** `initData` dagi `user` maydonidan kerakli qism. */
interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  language_code?: string;
}

/** `initData` eskirgan deb hisoblanadigan muddat (soniya). */
const INIT_DATA_MAX_AGE = 24 * 60 * 60;

/**
 * Google `id_token` ni kim chiqargan bo'lishi kerak.
 *
 * ⚠️ IKKI QIYMAT HAM HAQIQIY: Google tarixan ikkala shaklni ham
 * ishlatadi va faqat bittasi tekshirilsa, kirish ba'zan "yaroqsiz
 * token" bilan rad etilardi — sababi esa hech qayerda ko'rinmasdi.
 */
const GOOGLE_ISSUERS = ["accounts.google.com", "https://accounts.google.com"];

/**
 * Apple `identityToken` ni kim chiqargan bo'lishi kerak — Google'dagi
 * `GOOGLE_ISSUERS` bilan ayni rol. Apple uchun bitta qiymat.
 */
const APPLE_ISSUER = "https://appleid.apple.com";

/** Apple'ning imzo kalitlari (JWKS) manzili. */
const APPLE_JWKS_URL = new URL("https://appleid.apple.com/auth/keys");

@Injectable()
export class MobileAuthService {
  private readonly logger = new Logger(MobileAuthService.name);

  /**
   * ⚠️ BITTA NUSXA, HAR SO'ROVDA YANGISI EMAS: mijoz Google'ning
   * imzo kalitlarini KESHLAYDI. Har kirishda yangi nusxa yaratilsa,
   * har kirish Google'ga qo'shimcha so'rov yuborardi va kalitlar
   * xizmati sekinlashganda kirish ham sekinlashardi.
   */
  private readonly googleClient = new OAuth2Client();

  /**
   * ⚠️ BITTA NUSXA, HAR SO'ROVDA YANGISI EMAS (Google mijozi bilan
   * ayni sabab): `createRemoteJWKSet` Apple'ning imzo kalitlarini
   * KESHLAYDI va ular aylanganda o'zi yangilaydi. Har kirishda yangi
   * nusxa yaratilsa, har kirish Apple'ga qo'shimcha so'rov yuborardi.
   *
   * ⚠️ DANGASA EMAS, LEKIN TARMOQQA CHIQMAYDI: `createRemoteJWKSet`
   * kalitlarni faqat BIRINCHI tekshiruvda yuklaydi — modul
   * yuklanishida emas. Shuning uchun Apple sozlanmagan bo'lsa ham
   * (`appleClientId` yo'q) bu qator zararsiz.
   */
  private readonly appleJwks = createRemoteJWKSet(APPLE_JWKS_URL);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  // ─────────────────────────────────────────────────────────────────
  //  TELEGRAM initData
  // ─────────────────────────────────────────────────────────────────

  async loginWithInitData(initData: string): Promise<{ token: string; citizen: unknown }> {
    const user = this.verifyInitData(initData);
    if (!user) {
      throw new UnauthorizedException("Telegram imzosi yaroqsiz — ilovani qayta oching");
    }

    return this.upsertAndIssue({
      key: { telegramId: String(user.id) },
      firstName: user.first_name?.trim() || "Fuqaro",
      lastName: user.last_name?.trim() || null,
      username: user.username?.trim() || null,
      photoUrl: user.photo_url?.trim() || null,
      languageCode: user.language_code?.trim() || "uz",
    });
  }

  // ─────────────────────────────────────────────────────────────────
  //  GOOGLE (MOBIL ILOVA — Flutter)
  // ─────────────────────────────────────────────────────────────────

  /**
   * GOOGLE BILAN KIRISH — MOBIL ILOVA (Play Market / App Store).
   *
   * ── NIMA UCHUN TELEGRAM EMAS ──────────────────────────────────────
   *
   * ⚠️ `initData` NI FAQAT TELEGRAM MIJOZI BERADI — ya'ni mini-ilova
   * ichida. Do'kondan o'rnatilgan MUSTAQIL ilovada u YO'Q.
   *
   * Avval bu yerda Telegram Login Widget (oauth) ishlatilgan edi va u
   * OLIB TASHLANDI: oqim brauzer → HTTPS qaytish sahifasi → `vshtabi://`
   * deep link → ilova degan TO'RT bo'g'indan iborat edi va har bo'g'in
   * o'z sababi bilan jimgina uzilardi (Chrome foydalanuvchi bosmagan
   * o'tishni bloklaydi; qaytish sahifasining ichki skripti CSP ga
   * tushadi; `cap sync` deep link filtrini o'chiradi). Google esa
   * TIZIM DARAJASIDA: hisob qurilmada allaqachon bor, natija
   * to'g'ridan-to'g'ri ilovaga qaytadi — orada brauzer ham, deep link
   * ham YO'Q.
   *
   * ── IMZO QANDAY TEKSHIRILADI ──────────────────────────────────────
   *
   * ⚠️ `id_token` — GOOGLE IMZOLAGAN JWT. Kutubxona uni Google'ning
   * ochiq kalitlari bilan tekshiradi va `aud` (kim uchun chiqarilgan)
   * bizning mijoz id'mizga tengligiga ishonch hosil qiladi.
   *
   * ⚠️ `aud` TEKSHIRUVI MAJBURIY: usiz BOSHQA ilova uchun chiqarilgan
   * (o'g'irlangan) token ham qabul qilinardi — imzosi haqiqiy, lekin
   * egasi biz emas.
   *
   * ⚠️ `email_verified` TALAB QILINMAYDI va QILINMASLIGI KERAK: biz
   * pochtani kirish kaliti sifatida ISHLATMAYMIZ (`sub` bo'yicha
   * topamiz), u faqat panelda ko'rsatiladi.
   */
  async loginWithGoogle(idToken: string): Promise<{ token: string; citizen: unknown }> {
    /**
     * ⚠️ SOZLANMAGAN BO'LSA 503, 401 EMAS: 401 "noto'g'ri hisob"
     * degan ma'no beradi va fuqaro aybni o'zidan qidirardi. Bu esa
     * SERVER sozlanmagani.
     */
    const audiences = [env.googleClientId, env.googleIosClientId].filter(
      (value): value is string => Boolean(value),
    );

    if (audiences.length === 0) {
      this.logger.error("GOOGLE_CLIENT_ID yo'q — Google kirishi o'chiq");
      throw new ServiceUnavailableException(
        "Google orqali kirish hozircha sozlanmagan",
      );
    }

    let payload: TokenPayload | undefined;

    try {
      const ticket = await this.googleClient.verifyIdToken({ idToken, audience: audiences });
      payload = ticket.getPayload();
    } catch (error) {
      // ⚠️ SABAB LOGGA YOZILADI, FUQAROGA EMAS: "iss noto'g'ri" kabi
      // matn unga hech narsa aytmaydi, bizga esa kerak.
      this.logger.warn(`Google id_token tekshirilmadi: ${String(error)}`);
      throw new UnauthorizedException("Google hisobi tasdiqlanmadi — qaytadan kiring");
    }

    if (!payload?.sub) {
      throw new UnauthorizedException("Google hisobi tasdiqlanmadi — qaytadan kiring");
    }

    // ⚠️ `iss` ALOHIDA TEKSHIRILADI: kutubxona buni o'zi qiladi, lekin
    // versiya o'zgarsa tekshiruv jimgina tushib qolmasligi uchun.
    if (!GOOGLE_ISSUERS.includes(payload.iss)) {
      this.logger.warn(`Google id_token: kutilmagan iss "${payload.iss}"`);
      throw new UnauthorizedException("Google hisobi tasdiqlanmadi — qaytadan kiring");
    }

    /**
     * ⚠️ ISM BO'SH BO'LISHI MUMKIN: Google hisobida familiya yoki hatto
     * ism ko'rsatilmagan bo'lishi mumkin va bo'sh satr panelda
     * "ismsiz fuqaro" qatorini chiqarardi.
     */
    const given = payload.given_name?.trim();
    const full = payload.name?.trim();

    return this.upsertAndIssue({
      key: { googleId: payload.sub },
      email: payload.email?.trim().toLowerCase() || null,
      firstName: given || full || "Fuqaro",
      lastName: payload.family_name?.trim() || null,
      // ⚠️ `username` GOOGLE'DA YO'Q — Telegram tushunchasi. Pochtadan
      // yasalmaydi: panelda u Telegram useri deb o'qilardi.
      username: null,
      photoUrl: payload.picture?.trim() || null,
      languageCode: payload.locale?.trim().slice(0, 8) || "uz",
    });
  }

  // ─────────────────────────────────────────────────────────────────
  //  APPLE (MOBIL ILOVA — Flutter, FAQAT iOS)
  // ─────────────────────────────────────────────────────────────────

  /**
   * "SIGN IN WITH APPLE" — MOBIL ILOVA (App Store), FAQAT iOS.
   *
   * ── NIMA UCHUN BOR ────────────────────────────────────────────────
   *
   * ⚠️ APP STORE QOIDASI 4.8: iOS'da Google kabi uchinchi tomon kirishi
   * ASOSIY bo'lsa, maxfiylikni himoya qiluvchi MUQOBIL kirish talab
   * qilinadi. Apple aynan shu — usiz ilova do'konda RAD ETILADI.
   * Android'da (Play Market) bu talab YO'Q, shuning uchun tugma faqat
   * iOS'da ko'rsatiladi (`login_screen.dart`).
   *
   * ── GOOGLE BILAN AYNI, FARQLAR BELGILANGAN ────────────────────────
   *
   * ⚠️ `identityToken` — APPLE IMZOLAGAN JWT. `jose` uni Apple'ning
   * ochiq kalitlari (JWKS) bilan tekshiradi, `aud` (kim uchun
   * chiqarilgan) bizning bundle id'mizga (`APPLE_CLIENT_ID`) va `iss`
   * Apple'ga tengligiga ishonch hosil qiladi — Google'dagi tekshiruv
   * bilan AYNI himoya.
   *
   * ⚠️ `aud` = BUNDLE ID: `sign_in_with_apple` ilova ichidan kirganda
   * Apple `aud` ni ilovaning bundle id'siga qo'yadi (veb-oqimdagi
   * "Services ID" EMAS — bizda u yo'q). `env.config.ts` izohiga
   * qarang.
   *
   * ⚠️ ISM/POCHTA FAQAT BIRINCHI KIRISHDA KELADI: Apple keyingi
   * kirishlarda `id_token` ga ularni QO'SHMAYDI. Shuning uchun
   * `nameIsFresh: false` — mavjud fuqaroning ismi o'chmaydi
   * (`upsertAndIssue` izohiga qarang). Ilova birinchi kirishda ism/
   * pochtani ALOHIDA beradi, lekin biz unga ISHONMAYMIZ: faqat
   * imzolangan tokendan olinadi (Google bilan ayni sabab).
   */
  async loginWithApple(identityToken: string): Promise<{ token: string; citizen: unknown }> {
    /**
     * ⚠️ SOZLANMAGAN BO'LSA 503, 401 EMAS (Google bilan ayni sabab):
     * bu fuqaroning aybi emas, SERVER sozlanmagani.
     */
    if (!env.appleClientId) {
      this.logger.error("APPLE_CLIENT_ID yo'q — Apple kirishi o'chiq");
      throw new ServiceUnavailableException(
        "Apple orqali kirish hozircha sozlanmagan",
      );
    }

    let payload: JWTPayload;

    try {
      // ⚠️ `jose` IMZO + `iss` + `aud` + MUDDATNI BIR O'ZI TEKSHIRADI.
      // `kid` sarlavhadan olinib, mos kalit JWKS'dan tanlanadi.
      const result = await jwtVerify(identityToken, this.appleJwks, {
        issuer: APPLE_ISSUER,
        audience: env.appleClientId,
      });
      payload = result.payload;
    } catch (error) {
      // ⚠️ SABAB LOGGA, FUQAROGA EMAS (Google bilan ayni): "aud
      // mismatch" unga hech narsa aytmaydi, bizga esa kerak.
      this.logger.warn(`Apple identityToken tekshirilmadi: ${String(error)}`);
      throw new UnauthorizedException("Apple hisobi tasdiqlanmadi — qaytadan kiring");
    }

    if (!payload.sub) {
      throw new UnauthorizedException("Apple hisobi tasdiqlanmadi — qaytadan kiring");
    }

    // ⚠️ POCHTA — FAQAT KO'RSATISH UCHUN, kalit EMAS (`sub` kalit).
    // Apple "yashirish" tanlasa bu relay manzili bo'ladi — normal.
    // `email` string sifatida kelishini tekshiramiz: Apple uni ba'zan
    // JSON bool/string sifatida beradi va kutilmagan tur bazaga
    // tushmasligi kerak.
    const email =
      typeof payload.email === "string" ? payload.email.trim().toLowerCase() || null : null;

    return this.upsertAndIssue({
      key: { appleId: payload.sub },
      email,
      // ⚠️ APPLE `id_token` DA ISM YO'Q — u faqat BIRINCHI kirishda,
      // tokendan TASHQARI keladi va biz unga ishonmaymiz. Shuning
      // uchun "Fuqaro" bilan yaratiladi; haqiqiy ismni fuqaro keyin
      // o'zi kiritmaydi (ism Telegram/Google tushunchasi) — bu normal.
      firstName: "Fuqaro",
      lastName: null,
      // ⚠️ `username` APPLE'DA YO'Q (Telegram tushunchasi) — Google
      // bilan ayni.
      username: null,
      // ⚠️ APPLE RASM BERMAYDI.
      photoUrl: null,
      languageCode: "uz",
      // ⚠️ ISM O'CHMASIN: izoh yuqorida va `upsertAndIssue` da.
      nameIsFresh: false,
    });
  }

  /**
   * ⚠️ FAQAT DEV. Brauzerda `initData` yo'q va ishlab chiqishda sinash
   * uchun kerak. Server `production` da uni O'ZI rad etadi — frontend
   * ham chaqirmaydi, lekin ikki tomonlama himoya.
   */
  async devLogin(telegramId: string, firstName?: string): Promise<{ token: string; citizen: unknown }> {
    if (env.isProduction) {
      throw new ForbiddenException("Dev kirish ishlab chiqarishda o'chirilgan");
    }

    return this.upsertAndIssue({
      key: { telegramId: telegramId.trim() },
      firstName: firstName?.trim() || "Sinov",
      lastName: null,
      username: null,
      photoUrl: null,
      languageCode: "uz",
    });
  }

  // ─────────────────────────────────────────────────────────────────
  //  Ichki
  // ─────────────────────────────────────────────────────────────────

  /**
   * Fuqaroni upsert qiladi va token beradi.
   *
   * ⚠️ ISM/USERNAME/RASM HAR KIRISHDA YANGILANADI: ular Telegram yoki
   * Google'dan keladi va u yerda o'zgargan bo'lishi mumkin. Shuning
   * uchun ilovada ular TAHRIRLANMAYDI (keyingi kirishda jim qaytarib
   * yozilardi).
   *
   * ⚠️ HUDUD/TELEFON UPSERT'DA TEGILMAYDI: ularni fuqaroning O'ZI
   * kiritadi va Telegram/Google ustiga yozib yuborishi noto'g'ri
   * bo'lardi.
   *
   * ⚠️ KALIT CHAQIRUVCHIDAN KELADI (`key`): mini-ilova `telegramId`,
   * mobil ilova `googleId` beradi. Shu tufayli IKKI KIRISH YO'LI
   * uchun bitta upsert yetarli va ular bir-biridan ajralib
   * ketmaydi.
   *
   * ⚠️ IKKI YO'L — IKKI ALOHIDA FUQARO. Telegram bilan ham, Google
   * bilan ham kirgan BIR ODAM bazada ikki qator bo'ladi va bu
   * ATAYLAB: ularni birlashtiradigan ishonchli belgi YO'Q
   * (Telegram pochta bermaydi), taxminga qo'shilsa esa BEGONA
   * odamning murojaatlari tarixi ochilib ketardi.
   */
  private async upsertAndIssue(data: {
    key: { telegramId: string } | { googleId: string } | { appleId: string };
    firstName: string;
    lastName: string | null;
    username: string | null;
    photoUrl: string | null;
    languageCode: string;
    email?: string | null;
    /**
     * ⚠️ APPLE UCHUN `false`: Apple ism/familiyani FAQAT BIRINCHI
     * kirishda beradi, keyingilarida YO'Q. O'shanda `firstName`
     * "Fuqaro" bo'lib keladi va `true` bo'lsa, oldingi KIRISHDA
     * saqlangan haqiqiy ismni o'chirib yuborardi. Shuning uchun Apple
     * kirishida mavjud fuqaroning ismiga TEGILMAYDI (faqat `create`
     * da yoziladi). Telegram/Google har kirishda haqiqiy ism beradi —
     * ular uchun `true` (standart), eski xatti-harakat o'zgarmaydi.
     */
    nameIsFresh?: boolean;
  }): Promise<{ token: string; citizen: unknown }> {
    const nameIsFresh = data.nameIsFresh ?? true;

    const citizen = await this.prisma.citizen.upsert({
      where: data.key,
      update: {
        // ⚠️ ISM/FAMILIYA FAQAT MANBA ISHONCHLI BERGANDA YANGILANADI
        // (`nameIsFresh`). Apple ikkinchi kirishda ism bermaydi —
        // yuqoridagi izohga qarang.
        ...(nameIsFresh
          ? { firstName: data.firstName, lastName: data.lastName }
          : {}),
        username: data.username,
        photoUrl: data.photoUrl,
        // ⚠️ POCHTA FAQAT KELGANDA YOZILADI: Telegram yo'li uni
        // umuman bermaydi va `null` bilan ustiga yozilsa, Google/Apple
        // bilan kirgan fuqaroning pochtasi o'chib ketardi. (Apple ham
        // pochtani faqat birinchi kirishda beradi — ayni himoya.)
        ...(data.email !== undefined && data.email !== null ? { email: data.email } : {}),
      },
      create: {
        ...data.key,
        firstName: data.firstName,
        lastName: data.lastName,
        username: data.username,
        photoUrl: data.photoUrl,
        languageCode: data.languageCode,
        email: data.email ?? null,
      },
      include: { district: { select: { name: true } }, mahalla: { select: { name: true } } },
    });

    // ⚠️ BLOKLANGAN FUQARO KIRA OLMAYDI — sabab qaytariladi (ilovada
    // ko'rsatiladi). Blok JUDA qattiq chora va kirish bosqichida
    // to'xtatiladi.
    if (citizen.isBlocked) {
      throw new ForbiddenException(
        citizen.blockReason?.trim() || "Hisobingiz vaqtincha cheklangan",
      );
    }

    const token = await this.jwt.signAsync(
      { sub: citizen.id, typ: "citizen" },
      { secret: env.mobileJwtSecret, expiresIn: env.mobileJwtTtl },
    );

    return {
      token,
      citizen: {
        id: citizen.id,
        telegramId: citizen.telegramId,
        email: citizen.email,
        firstName: citizen.firstName,
        lastName: citizen.lastName,
        username: citizen.username,
        phone: citizen.phone,
        photoUrl: citizen.photoUrl,
        languageCode: citizen.languageCode,
        districtId: citizen.districtId,
        districtName: citizen.district?.name ?? null,
        mahallaId: citizen.mahallaId,
        mahallaName: citizen.mahalla?.name ?? null,
        points: citizen.points,
        createdAt: citizen.createdAt,
      },
    };
  }

  /**
   * TELEGRAM WebApp `initData` IMZOSINI TEKSHIRADI.
   *
   * Algoritm (Telegram spetsifikatsiyasi):
   *   secret_key = HMAC_SHA256("WebAppData" kaliti bilan, bot_token)
   *   hash       = HMAC_SHA256(secret_key, data_check_string)
   * bu yerda `data_check_string` — `hash` dan boshqa barcha maydonlar
   * alifbo tartibida `key=value\n` ko'rinishida.
   *
   * ⚠️ BOT_TOKEN YO'Q BO'LSA TEKSHIRIB BO'LMAYDI: o'shanda `null`
   * qaytadi va kirish rad etiladi (dev yo'lidan foydalanish kerak).
   */
  private verifyInitData(initData: string): TelegramUser | null {
    if (!env.botToken) {
      this.logger.warn("BOT_TOKEN yo'q — initData tekshirib bo'lmaydi");
      return null;
    }

    let params: URLSearchParams;
    try {
      params = new URLSearchParams(initData);
    } catch {
      return null;
    }

    const hash = params.get("hash");
    if (!hash) return null;

    // ── data_check_string ──────────────────────────────────────────
    const pairs: string[] = [];
    for (const [key, value] of params.entries()) {
      if (key === "hash") continue;
      pairs.push(`${key}=${value}`);
    }
    pairs.sort();
    const dataCheckString = pairs.join("\n");

    const secretKey = createHmac("sha256", "WebAppData").update(env.botToken).digest();
    const computed = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

    // ⚠️ DOIMIY VAQTLI TAQQOSLASH.
    const a = Buffer.from(computed, "hex");
    const b = Buffer.from(hash, "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return null;
    }

    // ── MUDDAT ──────────────────────────────────────────────────────
    const authDate = Number.parseInt(params.get("auth_date") ?? "", 10);
    if (Number.isFinite(authDate)) {
      const ageSeconds = Math.floor(Date.now() / 1000) - authDate;
      if (ageSeconds > INIT_DATA_MAX_AGE) {
        this.logger.warn("initData muddati o'tgan");
        return null;
      }
    }

    // ── user ────────────────────────────────────────────────────────
    const rawUser = params.get("user");
    if (!rawUser) return null;

    try {
      const user = JSON.parse(rawUser) as TelegramUser;
      if (!user?.id) return null;
      return user;
    } catch {
      return null;
    }
  }
}
