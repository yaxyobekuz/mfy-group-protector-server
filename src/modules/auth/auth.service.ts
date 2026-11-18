/**
 * KIRISH — login, token yangilash, chiqish.
 *
 * ── TOKEN MODELI ──────────────────────────────────────────────────────
 *
 *   access   — qisqa muddatli (15 daq), har so'rovda `Authorization`
 *   refresh  — uzoq muddatli (30 kun), BAZADA hash'i saqlanadi
 *
 * ⚠️ IKKI ALOHIDA SIR (`env.jwt.accessSecret` / `refreshSecret`). Bitta
 * sir ishlatilsa, access token refresh sifatida ham qabul qilinardi
 * (`typ` tekshiruvi aylanib o'tilsa) — ikkita sir buni STRUKTURAVIY
 * imkonsiz qiladi.
 *
 * ⚠️ REFRESH TOKEN BAZADA — ACCESS EMAS. Sabab: access tokenni bekor
 * qilish uchun har so'rovda bazaga borish kerak bo'lardi va u o'shanda
 * sessiya cookie'siga aylanardi (JWT'ning ma'nosi yo'qoladi). Refresh
 * esa kamdan-kam ishlatiladi, ya'ni uni tekshirish arzon — va aynan u
 * uzoq yashaydi, ya'ni bekor qilish MUMKIN bo'lishi kerak.
 *
 * ⚠️ ROTATSIYA VA O'G'IRLANISHNI ANIQLASH. Har yangilanishda eski
 * qator `revokedAt` oladi va yangisi yoziladi. Allaqachon bekor
 * qilingan token qayta kelsa — bu O'G'IRLANISH belgisi (haqiqiy mijoz
 * yangisini olgan, demak bu nusxa boshqa qo'lda) va o'shanda xodimning
 * BARCHA sessiyalari yopiladi.
 */

import {
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import { createHash, randomBytes } from "node:crypto";

import { env } from "../../config/env.config";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../common/audit.service";
import { ROLE_DEFAULT_PERMISSIONS } from "../../common/permissions";

/**
 * ARGON2 PARAMETRLARI.
 *
 * ⚠️ `argon2id` — OWASP tavsiyasi: `argon2i` (yon kanalga chidamli) va
 * `argon2d` (GPU'ga chidamli) ning birikmasi. Parametrlar OWASP
 * minimumidan olingan; ularni pasaytirish parolni tez sindirilishiga
 * olib keladi, oshirish esa login so'rovini sekinlashtiradi.
 */
const ARGON_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
};

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResult extends TokenPair {
  user: {
    id: string;
    username: string;
    firstName: string;
    lastName: string;
    role: string;
    scopeKind: string;
    districtId: string | null;
    districtName: string | null;
    permissions: string[];
  };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
  ) {}

  /** Parolni hash qiladi — xodim yaratish/parol almashtirishda. */
  static hashPassword(plain: string): Promise<string> {
    return argon2.hash(plain, ARGON_OPTIONS);
  }

  // ─────────────────────────────────────────────────────────────────
  //  LOGIN
  // ─────────────────────────────────────────────────────────────────

  async login(
    username: string,
    password: string,
    meta: { ip?: string | null; userAgent?: string | null } = {},
  ): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({
      where: { username: username.trim().toLowerCase() },
      include: { district: { select: { name: true } } },
    });

    // ⚠️ XODIM YO'Q BO'LSA HAM PAROL TEKSHIRILADI (dummy hash bilan).
    // Aks holda javob vaqti "bu login bor" degan ma'lumotni berardi:
    // mavjud loginda ~100ms (argon2), mavjud bo'lmaganda ~1ms.
    if (!user) {
      await this.wasteTime();
      throw new UnauthorizedException("Login yoki parol xato");
    }

    const valid = await argon2.verify(user.passwordHash, password).catch(() => false);

    if (!valid) {
      await this.audit.record({
        userId: user.id,
        action: "auth.login_failed",
        ip: meta.ip,
      });
      // ⚠️ "PAROL XATO" DEYILMAYDI — bu loginning mavjudligini
      // tasdiqlardi va ro'yxat to'plashga yo'l ochardi.
      throw new UnauthorizedException("Login yoki parol xato");
    }

    if (user.isArchived || !user.isActive) {
      throw new ForbiddenException("Hisob faol emas — ma'muriyatga murojaat qiling");
    }

    const tokens = await this.issueTokens(user.id, user.username, meta);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    await this.audit.record({
      userId: user.id,
      action: "auth.login",
      ip: meta.ip,
      meta: { userAgent: meta.userAgent ?? null },
    });

    return {
      ...tokens,
      user: {
        id: user.id,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        scopeKind: user.scopeKind,
        districtId: user.districtId,
        districtName: user.district?.name ?? null,
        // ⚠️ `owner` da ro'yxat BO'SH bo'lishi mumkin va panel buni
        // `role === "owner"` bo'yicha hal qiladi — serverdagi
        // `PermissionsGuard` bilan AYNI mantiq.
        permissions:
          user.role === "owner"
            ? (ROLE_DEFAULT_PERMISSIONS.admin ?? [])
            : user.permissions,
      },
    };
  }

  // ─────────────────────────────────────────────────────────────────
  //  YANGILASH
  // ─────────────────────────────────────────────────────────────────

  async refresh(
    refreshToken: string,
    meta: { ip?: string | null; userAgent?: string | null } = {},
  ): Promise<TokenPair> {
    let payload: { sub: string; username: string; typ: string };
    try {
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret: env.jwt.refreshSecret,
      });
    } catch {
      throw new UnauthorizedException("Refresh token yaroqsiz");
    }

    if (payload.typ !== "refresh") {
      throw new UnauthorizedException("Token turi mos emas");
    }

    const tokenHash = this.hashToken(refreshToken);
    const session = await this.prisma.session.findUnique({ where: { tokenHash } });

    if (!session) {
      throw new UnauthorizedException("Sessiya topilmadi");
    }

    // ⚠️ O'G'IRLANISHNI ANIQLASH. Bekor qilingan token qayta kelgan
    // bo'lsa: haqiqiy mijoz allaqachon yangisini olgan, demak bu
    // nusxa BOSHQA qo'lda. Qaysi biri haqiqiy ekanini bilmaymiz,
    // shuning uchun IKKALASINI ham yopamiz — xodim qaytib kiradi.
    if (session.revokedAt) {
      await this.revokeAll(session.userId);
      await this.audit.record({
        userId: session.userId,
        action: "auth.refresh_reuse",
        ip: meta.ip,
        meta: { note: "Bekor qilingan token qayta ishlatildi — barcha sessiya yopildi" },
      });
      this.logger.warn(
        `Refresh token qayta ishlatildi (user=${session.userId}) — barcha sessiya yopildi`,
      );
      throw new UnauthorizedException("Sessiya bekor qilingan — qaytadan kiring");
    }

    if (session.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException("Sessiya muddati tugagan");
    }

    const user = await this.prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, username: true, isActive: true, isArchived: true },
    });

    if (!user || user.isArchived || !user.isActive) {
      await this.revokeAll(session.userId);
      throw new ForbiddenException("Hisob faol emas");
    }

    // ⚠️ ROTATSIYA ATOMAR: eski qator bekor qilinadi va yangisi
    // yoziladi — bitta tranzaksiyada. Aks holda ikkisi orasida uzilish
    // bo'lsa, xodim ikkala tokendan ham mahrum qolardi.
    const tokens = await this.prisma.$transaction(async (tx) => {
      await tx.session.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });

      return this.issueTokens(user.id, user.username, meta, tx);
    });

    return tokens;
  }

  // ─────────────────────────────────────────────────────────────────
  //  CHIQISH
  // ─────────────────────────────────────────────────────────────────

  /**
   * ⚠️ BITTA SESSIYA YOPILADI, hammasi emas: xodim telefonda ham,
   * kompyuterda ham kirgan bo'lishi mumkin va birida chiqish
   * ikkinchisini uzmasligi kerak.
   *
   * ⚠️ TOPILMAGAN TOKEN XATO BERMAYDI: chiqish IDEMPOTENT bo'lishi
   * kerak. Panel tokenni allaqachon o'chirgan bo'lsa ham "chiqdim"
   * degan javob olishi kerak — aks holda u xato ekranida qolib,
   * foydalanuvchi tizimdan chiqa olmasdi.
   */
  async logout(refreshToken: string | undefined): Promise<{ ok: true }> {
    if (!refreshToken) return { ok: true };

    await this.prisma.session.updateMany({
      where: { tokenHash: this.hashToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return { ok: true };
  }

  /** Barcha qurilmalardan chiqish — parol o'zgarganda ham chaqiriladi. */
  async revokeAll(userId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  // ─────────────────────────────────────────────────────────────────
  //  Ichki
  // ─────────────────────────────────────────────────────────────────

  private async issueTokens(
    userId: string,
    username: string,
    meta: { ip?: string | null; userAgent?: string | null },
    tx?: Pick<PrismaService, "session">,
  ): Promise<TokenPair> {
    const client = tx ?? this.prisma;

    const accessToken = await this.jwt.signAsync(
      { sub: userId, username, typ: "access" },
      { secret: env.jwt.accessSecret, expiresIn: env.jwt.accessTtl },
    );

    // ⚠️ `jti` QO'SHILADI: bo'lmasa bir sekund ichida chiqarilgan
    // ikki refresh token AYNI bo'lib qolardi (payload bir xil,
    // `iat` sekund aniqligida) va `tokenHash` unique'iga urilardi.
    const refreshToken = await this.jwt.signAsync(
      { sub: userId, username, typ: "refresh", jti: randomBytes(16).toString("hex") },
      { secret: env.jwt.refreshSecret, expiresIn: env.jwt.refreshTtl },
    );

    const decoded = this.jwt.decode(refreshToken) as { exp: number };

    await client.session.create({
      data: {
        userId,
        // ⚠️ TOKEN O'ZI SAQLANMAYDI — faqat hash'i. Baza o'qib
        // ketilsa, o'g'irlangan hash bilan kirish mumkin emas.
        tokenHash: this.hashToken(refreshToken),
        userAgent: meta.userAgent ?? null,
        ip: meta.ip ?? null,
        expiresAt: new Date(decoded.exp * 1000),
      },
    });

    return { accessToken, refreshToken };
  }

  private hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  /**
   * ⚠️ MAVJUD BO'LMAGAN LOGIN UCHUN VAQT SARFLAYDI — login
   * ro'yxatini to'plashga qarshi. Hash haqiqiy parametrlar bilan
   * hisoblanadi, ya'ni vaqt haqiqiy tekshiruvga TENG.
   */
  private async wasteTime(): Promise<void> {
    await argon2
      .hash("dummy-password-for-timing-equalization", ARGON_OPTIONS)
      .catch(() => undefined);
  }
}
