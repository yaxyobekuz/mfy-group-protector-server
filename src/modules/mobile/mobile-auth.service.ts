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
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";

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

@Injectable()
export class MobileAuthService {
  private readonly logger = new Logger(MobileAuthService.name);

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
      telegramId: String(user.id),
      firstName: user.first_name?.trim() || "Fuqaro",
      lastName: user.last_name?.trim() || null,
      username: user.username?.trim() || null,
      photoUrl: user.photo_url?.trim() || null,
      languageCode: user.language_code?.trim() || "uz",
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
      telegramId: telegramId.trim(),
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
   * ⚠️ ISM/USERNAME/RASM HAR KIRISHDA YANGILANADI: ular Telegram'dan
   * keladi va u yerda o'zgargan bo'lishi mumkin. Shuning uchun ilovada
   * ular TAHRIRLANMAYDI (keyingi kirishda jim qaytarib yozilardi).
   *
   * ⚠️ HUDUD/TELEFON UPSERT'DA TEGILMAYDI: ularni fuqaroning O'ZI
   * kiritadi va Telegram ustiga yozib yuborishi noto'g'ri bo'lardi.
   */
  private async upsertAndIssue(data: {
    telegramId: string;
    firstName: string;
    lastName: string | null;
    username: string | null;
    photoUrl: string | null;
    languageCode: string;
  }): Promise<{ token: string; citizen: unknown }> {
    const citizen = await this.prisma.citizen.upsert({
      where: { telegramId: data.telegramId },
      update: {
        firstName: data.firstName,
        lastName: data.lastName,
        username: data.username,
        photoUrl: data.photoUrl,
      },
      create: data,
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
