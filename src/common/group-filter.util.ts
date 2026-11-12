/**
 * GURUH RO'YXATI FILTRI — YAGONA TA'RIF.
 *
 * ⚠️ NIMA UCHUN `GroupsService` ICHIDA EMAS: bu filtrni IKKI modul
 * ishlatadi — `groups` (kuzatuv) va `security` (qalqon). Ikkalasi
 * ham panelning AYNI ro'yxati ustida ommaviy amal bajaradi va
 * operator ikkisidan ham "ekranda ko'rinayotgan guruhlarga" degan
 * bir xil va'dani kutadi.
 *
 * Nusxalansa, ikkisi albatta ajralib ketardi: masalan qidiruvga
 * `chatId` qo'shilsa, bir amal uni hisobga olib, ikkinchisi
 * olmasdi — va qalqon operator ko'rmagan guruhga tushib ketardi.
 *
 * ⚠️ MODULLARNI BIR-BIRIGA ULASH O'RNIGA SHU YO'L TANLANDI:
 * `SecurityModule` ga `GroupsService` ni import qilish ikki modulni
 * bog'lab, "qalqon kuzatuvga bog'liq" degan noto'g'ri taassurot
 * berardi — holbuki ular ATAYLAB mustaqil (`security.service.ts`
 * boshidagi doktrina).
 *
 * ⚠️ QAMROV SHARTI HAR DOIM BIRINCHI va uni mijozning filtri BEKOR
 * QILA OLMAYDI (`scope.util.ts` izohi).
 */

import {
  isProvinceWide,
  mahallaScopeWhere,
  type ScopeContext,
} from "./scope.util";

export interface GroupListFilter {
  isOfficial?: boolean;
  /**
   * ⚠️ TUMAN FILTRI MFY FILTRIDAN ALOHIDA va u KERAK: viloyatda
   * BIR XIL NOMLI MFY lar bor (har tumanda "Turon", "Birlik") va
   * ro'yxatda faqat MFY nomi ko'rsatilsa, operator qaysi biri
   * ekanini bilmasdi. Tumanni tanlab, MFY ro'yxatini toraytirish —
   * eng oddiy yechim.
   */
  districtId?: string;
  mahallaId?: string;
  unassigned?: boolean;
  search?: string;
}

/**
 * Panel ro'yxati uchun Prisma `where`.
 *
 * ⚠️ `includeUnassigned` VILOYAT DARAJASIDA OCHILADI: MFY
 * biriktirilmagan guruh hech qaysi tumanga tegishli emas, lekin u
 * ko'rinmasa hech kim uni biriktirmasdi (`scope.util.ts` izohi).
 */
export const groupListWhere = (
  scope: ScopeContext,
  filter: GroupListFilter,
) => ({
  ...mahallaScopeWhere(scope, { includeUnassigned: isProvinceWide(scope) }),
  ...(filter.isOfficial !== undefined ? { isOfficial: filter.isOfficial } : {}),
  // ⚠️ ANIQ MFY TANLANGAN BO'LSA TUMAN FILTRI ORTIQCHA: MFY
  // allaqachon bitta tumanga tegishli. Ikkalasi birga qo'yilsa va
  // mos kelmasa, natija jim bo'sh chiqardi.
  ...(filter.districtId && !filter.mahallaId
    ? { mahalla: { districtId: filter.districtId } }
    : {}),
  ...(filter.mahallaId ? { mahallaId: filter.mahallaId } : {}),
  ...(filter.unassigned ? { mahallaId: null } : {}),
  ...(filter.search
    ? {
        OR: [
          { title: { contains: filter.search, mode: "insensitive" as const } },
          { username: { contains: filter.search, mode: "insensitive" as const } },
          { chatId: { contains: filter.search } },
        ],
      }
    : {}),
});
