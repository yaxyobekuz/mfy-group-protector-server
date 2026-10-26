/**
 * KIRISH NAZORATI — token va bot kaliti.
 *
 * ⚠️ GLOBAL O'RNATILADI (`app.module.ts`): hamma narsa standart holda
 * YOPIQ, ochiq endpoint esa `@Public()` bilan ALOHIDA belgilanadi.
 * Teskarisi ("kerakli joyga guard qo'yish") amalda bitta endpoint
 * ochiq qolib ketishi bilan tugaydi va buni hech kim sezmaydi.
 */

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";

import { env } from "../../config/env.config";
import { PrismaService } from "../../prisma/prisma.service";
import {
  BOT_ONLY_KEY,
  CITIZEN_ONLY_KEY,
  IS_PUBLIC_KEY,
  type RequestCitizen,
  type RequestUser,
} from "../decorators";

/** Access token ichidagi ma'lumot. */
interface AccessPayload {
  sub: string;
  username: string;
  /**
   * ⚠️ TOKEN TURI — MAJBURIY. Refresh token access sifatida
   * ishlatilmasligi kerak: u uzoq muddatli va uni har so'rovda
   * yuborish o'g'irlanish xavfini oshiradi. Sirlar ham alohida, ya'ni
   * bu IKKINCHI himoya qatlami.
   */
  typ: "access";
}

/** Fuqaro (Mini App) tokeni ichidagi ma'lumot. */
interface CitizenPayload {
  sub: string;
  /**
   * ⚠️ `typ` + ALOHIDA SIR: fuqaro tokeni xodim yo'liga tushib qolsa
   * ham imzo boshqa sir bilan tekshirilgani uchun o'tmaydi, va `typ`
   * teskari tomonda ikkinchi to'siq.
   */
  typ: "citizen";
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const handler = [context.getHandler(), context.getClass()];

    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, handler)) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();

    // ── BOT YO'LI ───────────────────────────────────────────────────
    if (this.reflector.getAllAndOverride<boolean>(BOT_ONLY_KEY, handler)) {
      return this.checkBotKey(request);
    }

    // ── FUQARO YO'LI (Mini App) ─────────────────────────────────────
    if (this.reflector.getAllAndOverride<boolean>(CITIZEN_ONLY_KEY, handler)) {
      return this.checkCitizen(request);
    }

    // ── XODIM YO'LI ─────────────────────────────────────────────────
    const token = this.extractToken(request);
    if (!token) {
      throw new UnauthorizedException("Token yo'q");
    }

    let payload: AccessPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessPayload>(token, {
        secret: env.jwt.accessSecret,
      });
    } catch {
      // ⚠️ SABAB AYTILMAYDI ("muddati tugagan" / "imzo noto'g'ri"):
      // bu tashqi odamga tokenni sinab ko'rishda yo'l ko'rsatardi.
      // Panel muddati tugashini 401 javobidan O'ZI tushunadi va
      // refresh qiladi.
      throw new UnauthorizedException("Token yaroqsiz");
    }

    if (payload.typ !== "access") {
      throw new UnauthorizedException("Token turi mos emas");
    }

    // ⚠️ RUXSAT VA QAMROV BAZADAN O'QILADI, tokendan emas. Tokenga
    // muhrlansa (bazaga bormaslik uchun), ruxsat olib qo'yilgan xodim
    // token muddati tugamaguncha ishlab yuraverardi — ruxsat esa
    // DARHOL amal qilishi kerak.
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        username: true,
        role: true,
        scopeKind: true,
        districtId: true,
        permissions: true,
        isActive: true,
        isArchived: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException("Xodim topilmadi");
    }

    // ⚠️ ARXIVLANGAN VA NOFAOL XODIM — DARHOL TO'XTATILADI, tokeni
    // amalda bo'lsa ham. Xodim ishdan ketganda tokenini kutib turish
    // mumkin emas.
    if (user.isArchived || !user.isActive) {
      throw new ForbiddenException("Hisob faol emas");
    }

    const requestUser: RequestUser = {
      id: user.id,
      username: user.username,
      role: user.role,
      scopeKind: user.scopeKind,
      districtId: user.districtId,
      permissions: user.permissions,
    };

    (request as Request & { user: RequestUser }).user = requestUser;
    return true;
  }

  /**
   * FUQARO TOKENINI TEKSHIRADI (Mini App).
   *
   * ⚠️ XODIM YO'LIDAN ALOHIDA SIR: `mobileJwtSecret` bilan tekshiriladi.
   * ⚠️ `isBlocked` BAZADAN O'QILADI: bloklangan fuqaro token muddati
   * tugamay turib ham darhol to'xtatilishi kerak — blok JUDA qattiq
   * chora va u DARHOL kuchga kirishi shart.
   */
  private async checkCitizen(request: Request): Promise<boolean> {
    const token = this.extractToken(request);
    if (!token) {
      throw new UnauthorizedException("Token yo'q");
    }

    let payload: CitizenPayload;
    try {
      payload = await this.jwt.verifyAsync<CitizenPayload>(token, {
        secret: env.mobileJwtSecret,
      });
    } catch {
      throw new UnauthorizedException("Token yaroqsiz");
    }

    if (payload.typ !== "citizen") {
      throw new UnauthorizedException("Token turi mos emas");
    }

    const citizen = await this.prisma.citizen.findUnique({
      where: { id: payload.sub },
      select: { id: true, telegramId: true, firstName: true, isBlocked: true, blockReason: true },
    });

    if (!citizen) {
      throw new UnauthorizedException("Foydalanuvchi topilmadi");
    }

    if (citizen.isBlocked) {
      // ⚠️ SABAB QAYTARILADI: fuqaroga ilovada ko'rsatiladi — "ilova
      // ishlamayapti" degan noaniqlikdan ko'ra, aniq sabab yaxshiroq.
      throw new ForbiddenException(
        citizen.blockReason?.trim() || "Hisobingiz vaqtincha cheklangan",
      );
    }

    const requestCitizen: RequestCitizen = {
      id: citizen.id,
      telegramId: citizen.telegramId,
      firstName: citizen.firstName,
      isBlocked: citizen.isBlocked,
    };

    (request as Request & { citizen: RequestCitizen }).citizen = requestCitizen;
    return true;
  }

  /**
   * BOT KALITINI TEKSHIRADI.
   *
   * ⚠️ UZUNLIK AVVAL TEKSHIRILADI: `timingSafeEqual` turli uzunlikda
   * XATO OTADI (TypeError), ya'ni tekshiruvning o'zi yiqilardi.
   */
  private checkBotKey(request: Request): boolean {
    const provided = request.headers["x-bot-key"];
    const key = typeof provided === "string" ? provided : "";

    if (key.length !== env.botApiKey.length) {
      throw new UnauthorizedException("Bot kaliti yaroqsiz");
    }

    // ⚠️ DOIMIY VAQTLI TAQQOSLASH: oddiy `!==` birinchi mos
    // kelmagan baytda to'xtaydi va javob vaqti kalitni bayt-bayt
    // topish imkonini berardi.
    const { timingSafeEqual } = require("node:crypto") as typeof import("node:crypto");
    const ok = timingSafeEqual(Buffer.from(key), Buffer.from(env.botApiKey));

    if (!ok) throw new UnauthorizedException("Bot kaliti yaroqsiz");
    return true;
  }

  private extractToken(request: Request): string | null {
    const header = request.headers.authorization;
    if (!header) return null;

    const [scheme, value] = header.split(" ");
    if (scheme?.toLowerCase() !== "bearer" || !value) return null;

    return value.trim() || null;
  }
}
