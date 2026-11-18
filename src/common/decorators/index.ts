/**
 * DEKORATORLAR — controller'dagi ruxsat va kontekst e'lonlari.
 *
 * ⚠️ RUXSAT CONTROLLER'DA E'LON QILINADI, service'da tekshirilmaydi.
 * Sabab: e'lon endpoint'ning YONIDA turganda "bu endpoint kimga ochiq"
 * degan savolga bir qarashda javob bo'ladi. Service ichiga yashirilsa,
 * yangi endpoint qo'shgan odam tekshiruvni unutib qoldirishi oson —
 * va bu jim ochilib qolgan endpoint bo'lardi.
 */

import { SetMetadata, createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { ScopeKind } from "@prisma/client";

/** `JwtAuthGuard` shu kalitni ko'rsa, token talab qilmaydi. */
export const IS_PUBLIC_KEY = "isPublic";

/**
 * TOKENSIZ OCHIQ ENDPOINT.
 *
 * ⚠️ ATAYLAB "OPT-OUT": guard GLOBAL o'rnatiladi va hamma narsa
 * standart holda YOPIQ. Teskarisi ("kerakli joyga guard qo'yish")
 * amalda bitta endpoint ochiq qolib ketishi bilan tugaydi.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const PERMISSIONS_KEY = "permissions";

/**
 * TALAB QILINADIGAN RUXSATLAR.
 *
 * ⚠️ BIR NECHTASI BERILSA — HAMMASI kerak (AND). "Bittasi yetarli"
 * (OR) mantig'i ataylab yo'q: u "nima uchun bu odam kira oldi" degan
 * savolni murakkablashtiradi va amalda hech qachon kerak bo'lmagan.
 */
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

export const BOT_ONLY_KEY = "botOnly";

/**
 * FAQAT BOT KIRADIGAN ENDPOINT (`X-Bot-Key` bilan).
 *
 * ⚠️ BOTDA JWT YO'Q va bo'lishi ham kerak emas: bot foydalanuvchi
 * emas, ishonchli XIZMAT. Unga JWT berish "bot nomidan sessiya"
 * degan tushunchani tug'dirardi — kim tomonidan, qanday muddatga?
 */
export const BotOnly = () => SetMetadata(BOT_ONLY_KEY, true);

export const CITIZEN_ONLY_KEY = "citizenOnly";

/**
 * FAQAT FUQARO KIRADIGAN ENDPOINT (Mini App tokeni bilan).
 *
 * ⚠️ FUQARO — XODIM EMAS. Bu endpoint'lar `request.user` ni EMAS,
 * `request.citizen` ni to'ldiradi va `MOBILE_JWT_SECRET` bilan
 * imzolangan tokenni talab qiladi. Shu tufayli ularga tasodifan
 * `@RequirePermissions` qo'yilsa, `PermissionsGuard` `request.user`
 * ni topolmay darhol 403 beradi — jim o'tib ketmaydi.
 */
export const CitizenOnly = () => SetMetadata(CITIZEN_ONLY_KEY, true);

/** So'rov egasi — `JwtAuthGuard` joylashtiradi. */
export interface RequestUser {
  id: string;
  username: string;
  role: string;
  scopeKind: ScopeKind;
  districtId: string | null;
  permissions: string[];
}

/**
 * JORIY XODIM.
 *
 * ⚠️ MA'LUMOT TOKENDAN EMAS, BAZADAN keladi (`JwtAuthGuard`). Tokenga
 * ruxsat va qamrovni muhrlash vasvasasi bor (bazaga bormaslik uchun),
 * lekin o'shanda ruxsat olib qo'yilgan xodim token muddati
 * tugamaguncha ishlab yuraverardi. Ruxsat — DARHOL amal qilishi
 * kerak bo'lgan narsa.
 */
export const CurrentUser = createParamDecorator(
  (data: keyof RequestUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ user?: RequestUser }>();
    const user = request.user;
    if (!user) return undefined;
    return data ? user[data] : user;
  },
);

/** So'rov egasi FUQARO — `JwtAuthGuard` `@CitizenOnly()` yo'lida joylaydi. */
export interface RequestCitizen {
  id: string;
  /**
   * ⚠️ `null` BO'LISHI MUMKIN: mobil ilovadan (Google bilan) kirgan
   * fuqaroda Telegram hisobi YO'Q. Shuning uchun bu maydonni
   * "xabar yuborish manzili" deb qabul qiladigan kod uni ALBATTA
   * tekshirishi kerak.
   */
  telegramId: string | null;
  firstName: string;
  isBlocked: boolean;
}

/**
 * JORIY FUQARO.
 *
 * ⚠️ `CurrentUser` KO'ZGUSI, lekin `request.citizen` dan o'qiydi.
 * Ma'lumot tokendan emas, BAZADAN keladi (`JwtAuthGuard`): bloklangan
 * fuqaro token muddati tugamay turib ham darhol to'xtatilishi kerak.
 */
export const CurrentCitizen = createParamDecorator(
  (data: keyof RequestCitizen | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ citizen?: RequestCitizen }>();
    const citizen = request.citizen;
    if (!citizen) return undefined;
    return data ? citizen[data] : citizen;
  },
);

/** So'rov IP'si — audit uchun. */
export const ClientIp = createParamDecorator((_data, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<{
    ip?: string;
    headers: Record<string, string | string[] | undefined>;
  }>();

  // ⚠️ `x-forwarded-for` BIRINCHI qiymati olinadi: proxy zanjirida u
  // mijozning haqiqiy IP'si, qolganlari esa proxy'lar.
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0]!.trim();
  }

  return request.ip ?? null;
});
