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

import type { RequestUser } from "./decorators";

/** So'rov egasining qamrov ma'lumoti — JWT'dan emas, BAZADAN keladi. */
export interface ScopeContext {
  userId: string;
  role: string;
  scopeKind: ScopeKind;
  districtId: string | null;
  /**
   * XODIMNING RUXSATLARI.
   *
   * ⚠️ "RUXSAT ≠ QAMROV" DOKTRINASI BUZILMAYDI: ruxsat baribir
   * `@RequirePermissions` bilan tekshiriladi va bu maydon uning
   * o'rnini BOSMAYDI. U faqat bitta savol uchun kerak —
   * "biriktirilmagan chatni kim ko'rsin" (`canTouchUnassigned`):
   * javob xodimning ISHIGA bog'liq, hududiga emas.
   *
   * ⚠️ BAZADAN KELADI (`RequestUser`), tokendan emas — ruxsat olib
   * qo'yilganda u DARHOL amal qilishi kerak.
   */
  permissions: string[];

  /**
   * TASHKILOT — `scopeKind === "org"` bo'lganda.
   *
   * ⚠️ HUDUD EMAS: suv ta'minoti tashkiloti o'z tumanidagi HAMMA
   * murojaatni emas, faqat O'ZIGA yo'naltirilganini ko'radi. Shu
   * sababli u `districtId` ning yonida ALOHIDA maydon — ikkisini
   * bitta "qamrov id'si" ga birlashtirish "bu id tumanmi yoki
   * tashkilotmi" degan savolni har so'rovda qayta hal qilishga
   * majbur qilardi.
   */
  organizationId: string | null;
}

/**
 * `RequestUser` → `ScopeContext` — YAGONA MANBA.
 *
 * ⚠️ AVVAL BU FUNKSIYA TO'QQIZTA KONTROLLERDA NUSXA BO'LIB YOTARDI
 * va hammasi bir xil edi. Maydon qo'shilganda ularning bittasi
 * albatta unutilardi — o'shanda bitta modul eski (to'liqsiz)
 * qamrov bilan ishlab, buni HECH NARSA ko'rsatmasdi: so'rov xato
 * bermaydi, shunchaki boshqa natija qaytaradi.
 */
export const toScope = (user: RequestUser): ScopeContext => ({
  userId: user.id,
  role: user.role,
  scopeKind: user.scopeKind,
  districtId: user.districtId,
  permissions: user.permissions,
  organizationId: user.organizationId,
});

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
 * TASHKILOT XODIMIMI.
 *
 * ⚠️ `organizationId` HAM TEKSHIRILADI: "qamrov tashkilot, lekin
 * tashkilot ko'rsatilmagan" holati ma'lumot to'liq emasligini
 * bildiradi va o'shanda hammasini ochib qo'yish eng xavfli tanlov
 * bo'lardi (`districtScopeWhere` dagi ayni qoida). Bunday xodim
 * `false` oladi, ya'ni hududiy funksiyalarga tushadi — ular esa
 * `districtId` siz unga `impossible` filtri beradi.
 */
export const isOrgScope = (
  scope: ScopeContext,
): scope is ScopeContext & { organizationId: string } =>
  scope.role !== "owner" &&
  scope.scopeKind === ScopeKind.org &&
  Boolean(scope.organizationId);

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
 * ⚠️ LEKIN BU TUMAN OPERATORINI BOSHI BERK KO'CHAGA OLIB BORGAN EDI
 * (tirik holat): Baliqchi tumaniga biriktirish huquqi bilan admin
 * qo'yilgan xodim panelda 0 ta chat ko'rdi — chunki tumanda hali
 * BIRORTA ham biriktirilgan guruh yo'q edi, biriktirilmaganlari esa
 * undan YASHIRILGAN edi. Ya'ni unga berilgan `groups.assign`
 * ruxsati amalda HECH NARSA qila olmasdi va buni panel ham
 * tushuntirmasdi: ro'yxat shunchaki bo'sh turardi.
 *
 * ⚠️ YECHIM — QAMROVDA EMAS, ISHDA: biriktirilmagan chatni
 * BIRIKTIRADIGAN odam ko'radi (`canTouchUnassigned`). Qamrovni
 * kengaytirish (tuman xodimiga boshqa tumanning chatlarini ochish)
 * noto'g'ri bo'lardi — biriktirilmagan chat esa HECH QAYSI tumanniki
 * emas, ya'ni uni ko'rsatish begona hududga kirish ham emas.
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
 * MUROJAAT RO'YXATI UCHUN SHART — HUDUD YOKI TASHKILOT.
 *
 * ⚠️ `mahallaScopeWhere` NING O'RNINI BOSMAYDI, UNI O'RAYDI:
 * tashkilot xodimidan boshqa hamma uchun natija AVVALGIDEK. Ikki
 * alohida funksiya yozilsa, chaqiruvchi har joyda "bu xodim
 * tashkilotnikimi" deb o'zi tekshirishi kerak bo'lardi — va bitta
 * joyda u albatta unutilardi.
 *
 * ⚠️ TASHKILOT QAMROVI HUDUDIY EMAS: suv ta'minoti tashkiloti o'z
 * tumanidagi gaz va yo'l muammolarini KO'RMASLIGI kerak. Shuning
 * uchun filtr `organizationId` bo'yicha va hududiy shart UMUMAN
 * qo'shilmaydi: tashkilot bir necha tumanga xizmat qilishi mumkin
 * (viloyat darajasidagi tashkilot — butun viloyatga).
 *
 * ⚠️ XAVFSIZ STANDART: biror modul bu funksiyaga O'TKAZILMASA,
 * tashkilot xodimi `mahallaScopeWhere` ga tushadi va u yerda
 * `districtId` si yo'qligi uchun `impossible` filtrini oladi — ya'ni
 * HECH NARSA ko'rmaydi, hammasini emas. Xato "ochib qo'yish"
 * tomoniga emas, "yopib qo'yish" tomoniga og'adi.
 */
export const issueScopeWhere = (
  scope: ScopeContext,
  options: { includeUnassigned?: boolean } = {},
): Record<string, unknown> => {
  if (isOrgScope(scope)) return { organizationId: scope.organizationId };

  return mahallaScopeWhere(scope, options);
};

/**
 * BITTA MUROJAATGA TEGA OLADIMI.
 *
 * ⚠️ RO'YXAT FILTRI YETARLI EMAS (`canTouchDistrict` dagi ayni
 * sabab): `POST /issues/:id/org-done` id bilan keladi va ro'yxatdan
 * o'tmaydi.
 *
 * ⚠️ TASHKILOT XODIMI HUDUD BO'YICHA TEKSHIRILMAYDI: murojaatning
 * MFY si boshqa tumanda bo'lishi mumkin (viloyat darajasidagi
 * tashkilot), lekin u aynan SHU tashkilotga yo'naltirilgan.
 */
export const canTouchIssue = (
  scope: ScopeContext,
  issue: { organizationId: string | null; mahallaId: string | null; districtId: string | null },
): boolean => {
  if (isOrgScope(scope)) {
    return issue.organizationId === scope.organizationId;
  }

  if (isProvinceWide(scope)) return true;
  if (issue.mahallaId === null) return false;

  return canTouchDistrict(scope, issue.districtId);
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
  //
  // ⚠️ ISTISNO BU YERDA EMAS, `canTouchUnassigned` DA: shart o'nlab
  // joyda ishlatiladi (signal, murojaat, hudud, xavfsizlik) va uni
  // shu yerda yumshatish BARCHA modullarni birdan kengaytirib
  // yuborardi — holbuki gap faqat guruh biriktirish haqida.
  if (!districtId) return false;

  return districtId === scope.districtId;
};

/**
 * BIRIKTIRILMAGAN CHATGA TEGA OLADIMI.
 *
 * ⚠️ JAVOB HUDUDGA EMAS, ISHGA BOG'LIQ. MFY biriktirilmagan guruh
 * hech qaysi tumanga tegishli EMAS — ya'ni uni tuman xodimiga
 * ko'rsatish "begona hududga kirish" emas. Lekin uni HAMMAGA
 * ko'rsatish ham ortiqcha: ro'yxatda guruh nomlari va havolalari bor
 * va ular faqat BIRIKTIRADIGAN odamga kerak.
 *
 * ⚠️ SHUNING UCHUN KALIT — `groups.assign` RUXSATI: biriktirishni
 * kim bajaradi, biriktirilmaganlarni o'sha ko'radi. Aks holda
 * ruxsat berilgan-u, bajarish uchun hech narsa ko'rinmaydigan
 * holat chiqardi (fayl boshidagi `mahallaScopeWhere` izohi — tirik
 * holat).
 *
 * ⚠️ TUMANI KO'RSATILMAGAN XODIM BARIBIR HECH NARSA KO'RMAYDI:
 * `districtId` bo'sh bo'lsa `mahallaScopeWhere` uni `impossible`
 * filtriga tushiradi va bu funksiya ham `false` qaytaradi.
 */
export const canTouchUnassigned = (scope: ScopeContext): boolean => {
  if (isProvinceWide(scope)) return true;
  if (!scope.districtId) return false;

  return scope.permissions.includes("groups.assign");
};

/**
 * GURUH/KANAL YOZUVIGA TEGA OLADIMI — biriktirilmaganini ham hisobga
 * olib.
 *
 * ⚠️ ALOHIDA FUNKSIYA, `canTouchDistrict` GA PARAMETR EMAS: chaqiruv
 * joylari (`assignMahalla`, `setOfficial`, `setGuard`) shu bitta
 * nomni ko'rib, qoidani bir xil qo'llaydi. Parametr bo'lsa, uni
 * bittasida berib, boshqasida unutish oson bo'lardi — va o'shanda
 * panelda tugma ko'rinib, server 404 qaytarardi.
 */
export const canTouchGroup = (
  scope: ScopeContext,
  districtId: string | null,
): boolean =>
  districtId === null
    ? canTouchUnassigned(scope)
    : canTouchDistrict(scope, districtId);
