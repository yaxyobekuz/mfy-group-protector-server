/**
 * HUDUDIY QAMROV — "bu xodim kimning ma'lumotini ko'radi".
 *
 * ⚠️ QAMROV SERVERDA QO'LLANADI, FRONTENDDA EMAS. Panel so'rovga
 * `districtId` qo'shishi mumkin (filtr sifatida), lekin ishonch unga
 * BERILMAYDI: so'rovni qo'lda yasash mumkin. Shuning uchun har
 * ro'yxat so'rovida `where` ga SERVER qo'shadigan shart bor va u
 * foydalanuvchining so'rovidagi filtr bilan BIRGA ishlaydi (AND),
 * uning o'rnini bosmaydi.
 *
 * ⚠️ `district` QAMROVLI XODIMDA `districtId` BO'LMASA — HECH NARSA
 * KO'RSATILMAYDI. Bu ataylab: "qamrov belgilangan, lekin tuman
 * ko'rsatilmagan" holati ma'lumot to'liq emasligini bildiradi va
 * o'shanda hammasini ochib qo'yish eng xavfli tanlov bo'lardi.
 * `impossible` filtri aynan shuni beradi.
 */

import { ScopeKind } from "@prisma/client";

/** So'rov egasining qamrov ma'lumoti — JWT'dan emas, BAZADAN keladi. */
export interface ScopeContext {
  userId: string;
  role: string;
  scopeKind: ScopeKind;
  districtId: string | null;
}

/**
 * HECH NARSA TOPILMAYDIGAN SHART.
 *
 * ⚠️ `{ id: "" }` kabi tasodifiy narsa EMAS, `districtId: { in: [] }`:
 * Prisma bo'sh `in` ni "hech narsa" deb to'g'ri tarjima qiladi
 * (`IN (NULL)` emas, `false`) va so'rov indeksdan ham chiqmaydi.
 */
const IMPOSSIBLE = { in: [] as string[] } as const;

/**
 * Xodim butun viloyatni ko'radimi.
 *
 * ⚠️ `owner` har doim ko'radi — `scopeKind` dan QAT'IY NAZAR. Egani
 * tumanga qamab qo'yish mumkin emas: u tizimni sozlaydigan odam va
 * o'zini bexosdan qulflab qo'yishi mumkin bo'lardi.
 */
export const isProvinceWide = (scope: ScopeContext): boolean =>
  scope.role === "owner" || scope.scopeKind === ScopeKind.province;

/**
 * `Mahalla` BO'YICHA filtrlanadigan jadval uchun shart
 * (`Issue.mahallaId`, `TelegramGroup.mahallaId`).
 *
 * ⚠️ `null` MAHALLA — ALOHIDA SAVOL va shuning uchun parametr bor.
 * MFY biriktirilmagan guruh HECH QAYSI tumanga tegishli emas, ya'ni
 * tuman xodimi uni ko'rmasligi mantiqiy. Lekin natijada bu guruhlarni
 * HECH KIM ko'rmay qolishi mumkin edi (viloyat xodimi kirmasa) va
 * ular jim turib, xabar ham to'plamay qolardi. Shu sababli
 * biriktirilmaganlarni ko'rsatish VILOYAT darajasining ishi va u
 * `includeUnassigned` bilan ochiladi.
 *
 * @returns Prisma `where` ga QO'SHILADIGAN bo'lak (bo'sh obyekt = cheklov yo'q)
 */
export const mahallaScopeWhere = (
  scope: ScopeContext,
  options: { includeUnassigned?: boolean } = {},
): Record<string, unknown> => {
  if (isProvinceWide(scope)) {
    // Viloyat xodimi hammasini ko'radi — biriktirilmaganlarni ham.
    return {};
  }

  if (!scope.districtId) {
    // Qamrov tuman, lekin tuman ko'rsatilmagan — hech narsa.
    return { mahallaId: IMPOSSIBLE };
  }

  const inDistrict = { mahalla: { districtId: scope.districtId } };

  if (options.includeUnassigned) {
    return { OR: [inDistrict, { mahallaId: null }] };
  }

  return inDistrict;
};

/**
 * `District` BO'YICHA filtrlanadigan jadval uchun shart
 * (`Mahalla.districtId`, `User.districtId`).
 */
export const districtScopeWhere = (
  scope: ScopeContext,
): Record<string, unknown> => {
  if (isProvinceWide(scope)) return {};

  if (!scope.districtId) return { districtId: IMPOSSIBLE };

  return { districtId: scope.districtId };
};

/**
 * `GroupSignal` UCHUN SHART.
 *
 * ⚠️ SIGNAL O'ZIDA HUDUD SAQLAMAYDI — u guruh orqali keladi
 * (`signal.group.mahalla.districtId`). Signalga `districtId` ustunini
 * qo'shish vasvasasi bor, lekin u guruhning MFY biriktirishi
 * O'ZGARGANDA eskirib qolardi: signal hali YANGI, hech kim ko'rmagan,
 * lekin allaqachon noto'g'ri tumanda turgan bo'lardi. Muammoda
 * (`Issue.mahallaId`) esa aksincha — u MUHRLANADI, chunki muammo
 * TARIXGA aylanadi va o'tgan hisobot o'zgarmasligi kerak.
 */
export const signalScopeWhere = (
  scope: ScopeContext,
  options: { includeUnassigned?: boolean } = {},
): Record<string, unknown> => {
  if (isProvinceWide(scope)) return {};

  if (!scope.districtId) return { chatId: IMPOSSIBLE };

  const inDistrict = {
    group: { mahalla: { districtId: scope.districtId } },
  };

  if (options.includeUnassigned) {
    return { OR: [inDistrict, { group: { mahallaId: null } }] };
  }

  return inDistrict;
};

/**
 * BITTA YOZUVNI TEKSHIRADI — "bu xodim shu yozuvga tega oladimi".
 *
 * ⚠️ RO'YXAT FILTRI YETARLI EMAS: `GET /signals/:id/attach` kabi
 * amallar id bilan keladi va u ro'yxatdan O'TMAYDI. Filtr va bu
 * tekshiruv — ikki ALOHIDA himoya va ikkalasi ham kerak.
 *
 * @param districtId Yozuv tegishli bo'lgan tuman (`null` = biriktirilmagan)
 */
export const canTouchDistrict = (
  scope: ScopeContext,
  districtId: string | null,
): boolean => {
  if (isProvinceWide(scope)) return true;
  if (!scope.districtId) return false;

  // ⚠️ BIRIKTIRILMAGAN YOZUVGA TUMAN XODIMI TEGMAYDI: u qaysi tumanga
  // tegishli ekani ma'lum emas va "menikidir" deb qabul qilish boshqa
  // tumanning ishiga aralashish bo'lardi.
  if (!districtId) return false;

  return districtId === scope.districtId;
};
