/**
 * YO'NALTIRISH QOIDASI — TUMAN × YO'NALISH → TASHKILOT.
 *
 * ── MUAMMO ────────────────────────────────────────────────────────────
 *
 * Avval tashkilot faqat MATN edi (`IssueCategory.orgName`): ilovada
 * "Mas'ul tashkilot: Andijon suv ta'minoti" deb yozilardi, lekin bu
 * MANZIL emasdi. Murojaat unga bormasdi, xabar ketmasdi, u panelga kira
 * olmasdi — ya'ni "mas'ul" so'zi fuqaro uchun ko'rinish, tashkilot
 * uchun esa hech narsa edi. Shtab xodimi har murojaatni o'qib,
 * tashkilotga QO'LDA (telefon yoki qog'oz bilan) uzatardi.
 *
 * ── NIMA UCHUN KALIT TUMAN, MFY EMAS ──────────────────────────────────
 *
 * ⚠️ `MahallaAssignee` MFY × YO'NALISH bo'yicha ishlaydi va u shtab
 * XODIMI uchun to'g'ri: bitta operator o'n MFY ni yuritadi. Tashkilot
 * esa TUMAN darajasida ishlaydi — "Asaka suv ta'minoti" o'sha tumanning
 * hamma mahallasiga xizmat qiladi. MFY bo'yicha kalit qo'yilsa, 500
 * MFY × 22 yo'nalish = 11 000 qatorni QO'LDA to'ldirish kerak bo'lardi
 * va tizim o'sha ish bitmaguncha ishlamasdi.
 *
 * ⚠️ VILOYAT ZAXIRASI (`districtId: null`) AYNAN SHU SABABDAN BOR:
 * 22 ta qator butun viloyatni DARHOL ishga tushiradi, keyin tumanlar
 * birma-bir aniqlashtiriladi. Mijozning "hammani ro'yxatdan o'tkazish
 * shart emas" talabi ham shu.
 *
 * ── `MahallaAssignee` BILAN TO'QNASHMAYDI ─────────────────────────────
 *
 * ⚠️ IKKISI IKKI BOSHQA USTUNNI to'ldiradi va ikki boshqa savolga
 * javob beradi:
 *
 *   MahallaAssignee   → Issue.assigneeId     → shtabda KIM kuzatadi
 *   OrganizationRoute → Issue.organizationId → KIM bajaradi
 *
 * Shuning uchun "qaysi biri ustun" degan savol paydo bo'lmaydi: ikkisi
 * ham bir vaqtda qo'llanadi. Bitta ustunga sig'dirilsa, "murojaat
 * Suvoqovaga ketdi, lekin uni shtabda kim kuzatyapti" degan savol
 * javobsiz qolardi.
 */

import { Injectable, Logger } from "@nestjs/common";

import { PrismaService } from "../../prisma/prisma.service";

/** Topilgan tashkilot — murojaat yaratishda ishlatiladigan qism. */
export interface ResolvedOrganization {
  organizationId: string;
  /** Panel va ilova ko'rsatadigan nom. */
  name: string;
}

@Injectable()
export class OrgRoutingService {
  private readonly logger = new Logger(OrgRoutingService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * MUROJAAT QAYSI TASHKILOTGA KETADI.
   *
   * ⚠️ `null` — QOIDA YO'Q va bu BUTUNLAY NORMAL holat: murojaat
   * avvalgidek shtab navbatida qoladi. Yo'naltirish — QULAYLIK,
   * oqimning sharti emas (`AssignmentRulesService.resolve` dagi ayni
   * qoida).
   *
   * ⚠️ MFY BO'LMASA ZAXIRA BARIBIR QIDIRILADI — va bu
   * `MahallaAssignee` dan FARQLI. U yerda hududsiz murojaatni
   * biriktirish uni BEGONA tuman xodimiga yuborardi; bu yerda esa
   * viloyat darajasidagi tashkilot aynan shu holat uchun bor
   * ("Andijon viloyat gaz ta'minoti" butun viloyatga xizmat qiladi).
   */
  async resolve(
    mahallaId: string | null | undefined,
    categoryId: string,
  ): Promise<ResolvedOrganization | null> {
    try {
      const districtId = mahallaId ? await this.districtOf(mahallaId) : null;

      /**
       * ⚠️ IKKI QIDIRUV, BITTA `in` EMAS: aniq tuman qoidasi viloyat
       * zaxirasidan USTUN turishi kerak. Bitta so'rovda ikkisi ham
       * kelib, tartiblash `districtId` ning `null` ligiga bog'lansa,
       * ustunlik SQL'dagi NULL tartibiga tayanib qolardi — va u
       * PostgreSQL versiyasi/`NULLS FIRST` sozlamasiga qarab
       * o'zgarishi mumkin.
       */
      const route =
        (districtId ? await this.findRoute(categoryId, districtId) : null) ??
        (await this.findRoute(categoryId, null));

      if (!route) return null;

      // ⚠️ ARXIVLANGAN/NOFAOL TASHKILOTGA YO'NALTIRILMAYDI: u
      // murojaatni ko'rmaydi va xabar ham yetib bormaydi —
      // murojaat esa panelda "yo'naltirilgan" bo'lib turardi
      // (arxivlangan xodimga biriktirish bilan ayni sabab).
      if (!route.organization.isActive || route.organization.isArchived) return null;

      return {
        organizationId: route.organization.id,
        name: route.organization.name,
      };
    } catch (error) {
      /**
       * ⚠️ XATO YUTILADI: yo'naltirish MUROJAATNI YO'QOTMASLIGI
       * kerak. Qoida o'qilmasa, murojaat tashkilotsiz yaratiladi va
       * shtab xodimi uni qo'lda uzatadi — bu eski, ishlaydigan yo'l.
       */
      this.logger.warn(
        `Tashkilot qoidasi o'qilmadi (${mahallaId ?? "MFYsiz"}/${categoryId}): ${(error as Error).message}`,
      );
      return null;
    }
  }

  // ───────────────────────────────────────────────────────────────

  private async districtOf(mahallaId: string): Promise<string | null> {
    const mahalla = await this.prisma.mahalla.findUnique({
      where: { id: mahallaId },
      select: { districtId: true },
    });
    return mahalla?.districtId ?? null;
  }

  /**
   * ⚠️ `findFirst`, `findUnique` EMAS — VA TARTIB ANIQ. Sxemadagi
   * `@@unique([categoryId, districtId])` viloyat zaxirasini himoya
   * QILMAYDI: PostgreSQL `UNIQUE` da `NULL` larni teng deb
   * hisoblamaydi, ya'ni ayni yo'nalish uchun ikkita zaxira qatori
   * bazaga jim o'tib ketishi mumkin (sxemadagi batafsil izoh).
   * `createdAt` bo'yicha tartib bunday holatda ham "qaysi biri
   * ishlayapti" savoliga TUSHUNTIRIB BERILADIGAN javob qoldiradi —
   * aks holda natija har so'rovda o'zgarib turardi.
   */
  private findRoute(categoryId: string, districtId: string | null) {
    return this.prisma.organizationRoute.findFirst({
      where: { categoryId, districtId, isActive: true },
      orderBy: { createdAt: "asc" },
      select: {
        organization: {
          select: { id: true, name: true, isActive: true, isArchived: true },
        },
      },
    });
  }
}
