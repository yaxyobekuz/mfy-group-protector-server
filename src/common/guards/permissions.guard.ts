/**
 * RUXSAT NAZORATI — `@RequirePermissions()` ni amalga oshiradi.
 *
 * ⚠️ `JwtAuthGuard` DAN KEYIN ishlaydi (global guard'lar tartibi
 * `app.module.ts` dagi ro'yxat tartibida). Bu muhim: bu guard
 * `request.user` ga tayanadi va uni oldingisi joylashtiradi.
 */

import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";

import { PERMISSIONS_KEY, type RequestUser } from "../decorators";

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[] | undefined>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Ruxsat e'lon qilinmagan — faqat token yetarli (`JwtAuthGuard`
    // allaqachon tekshirdi).
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: RequestUser }>();
    const user = request.user;

    // ⚠️ BU YERGA `user` SIZ KELISH — KOD XATOSI, ruxsat masalasi
    // emas: `@RequirePermissions()` `@Public()` bilan birga
    // qo'yilgan. Jim `true` qaytarish o'sha endpoint'ni butunlay
    // ochib qo'yardi.
    if (!user) {
      throw new ForbiddenException("Ruxsat tekshirilmadi: so'rov egasi aniqlanmagan");
    }

    // ⚠️ `owner` RUXSATI O'QILMAYDI. Uning `permissions` massivi bo'sh
    // bo'lishi mumkin va bu normal: egani ro'yxat bilan cheklash
    // yangi ruxsat qo'shilganda uni owner'dan JIMGINA olib qo'yardi.
    if (user.role === "owner") return true;

    // ⚠️ HAMMASI kerak (AND), bittasi emas — `@RequirePermissions()`
    // izohiga qara.
    const missing = required.filter((key) => !user.permissions.includes(key));

    if (missing.length > 0) {
      // ⚠️ QAYSI RUXSAT YETMAYOTGANI AYTILADI: bu ichki panel va
      // xodim "nima uchun kira olmadim" degan savolga javob olishi
      // kerak. Tashqi API'da bu ma'lumot oshkor bo'lardi, lekin bu
      // yerda so'rov egasi allaqachon tizimga kirgan odam.
      throw new ForbiddenException(`Ruxsat yetarli emas: ${missing.join(", ")}`);
    }

    return true;
  }
}
