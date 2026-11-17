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

import { CHANNEL_TYPE } from "./chat-type";
import {
  canTouchUnassigned,
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

  /**
   * CHAT TURI — `group` yoki `channel`.
   *
   * ⚠️ NIMA UCHUN FILTR KERAK: reyestrda guruh ham, kanal ham
   * turadi, lekin ularga QILINADIGAN ISH boshqa. Qalqonni
   * ommaviy yoqayotgan operator ro'yxatda kanallarni ko'rib,
   * "nega ularga tegmadi" deb hayron bo'lardi — endi u
   * ro'yxatning o'zini guruhlarga toraytiradi.
   *
   * ⚠️ `supergroup` ALOHIDA QIYMAT EMAS: Telegram oddiy guruhni
   * a'zo soni oshganda jimgina supergroup'ga aylantiradi va
   * operator uchun ikkisi BIR XIL narsa. Ikki qiymat berilsa,
   * "Guruh" filtri o'sib ketgan guruhlarni yashirib qo'yardi.
   */
  chatType?: "group" | "channel";
}

/**
 * Panel ro'yxati uchun Prisma `where`.
 *
 * ⚠️ BIRIKTIRILMAGANLARNI BIRIKTIRADIGAN ODAM KO'RADI
 * (`canTouchUnassigned`), faqat viloyat xodimi emas. Avval shart
 * `isProvinceWide` edi va u tuman operatorini BOSHI BERK KO'CHAGA
 * olib borardi: biriktirish huquqi berilgan, lekin biriktiriladigan
 * chatlar undan yashirilgan — panelda shunchaki bo'sh ro'yxat
 * turardi va sababni hech narsa tushuntirmasdi (`scope.util.ts`
 * dagi tirik holat).
 *
 * ⚠️ RO'YXAT VA OMMAVIY AMAL AYNI SHARTNI ISHLATADI va bu ataylab:
 * operator "ekranda ko'rinayotgan chatlarga" degan va'dani kutadi.
 * Ikkisi ajralsa, ommaviy amal u KO'RMAGAN chatga tushib ketardi.
 */
export const groupListWhere = (
  scope: ScopeContext,
  filter: GroupListFilter,
) => ({
  ...mahallaScopeWhere(scope, { includeUnassigned: canTouchUnassigned(scope) }),
  ...(filter.isOfficial !== undefined ? { isOfficial: filter.isOfficial } : {}),
  // ⚠️ ANIQ MFY TANLANGAN BO'LSA TUMAN FILTRI ORTIQCHA: MFY
  // allaqachon bitta tumanga tegishli. Ikkalasi birga qo'yilsa va
  // mos kelmasa, natija jim bo'sh chiqardi.
  ...(filter.districtId && !filter.mahallaId
    ? { mahalla: { districtId: filter.districtId } }
    : {}),
  ...(filter.mahallaId ? { mahallaId: filter.mahallaId } : {}),
  ...(filter.unassigned ? { mahallaId: null } : {}),
  ...(filter.chatType === "channel"
    ? { type: CHANNEL_TYPE }
    : filter.chatType === "group"
      ? { type: { not: CHANNEL_TYPE } }
      : {}),
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
