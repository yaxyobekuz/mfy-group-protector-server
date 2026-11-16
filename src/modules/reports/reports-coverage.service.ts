/**
 * QAMROV HISOBOTI — BOT QAYSI MFY LARGA KIRGAN, QAYSILARIGA KIRMAGAN.
 *
 * ── NIMA UCHUN ALOHIDA HISOBOT ────────────────────────────────────────
 *
 * ⚠️ PANELDA FAQAT TESKARI YO'NALISH BOR EDI: "MFY si yo'q guruhlar"
 * (`GroupStats.unassigned`). Bu BOSHQA savol va u osonroq: biriktirmani
 * xodim bir bosishda tuzatadi.
 *
 * ⚠️ HAQIQIY BO'SHLIQ ESA TESKARISI: "guruhi yo'q MFY lar". Bunday
 * mahalla BUTUNLAY kuzatuvsiz — u yerdan na signal, na xavfsizlik
 * hodisasi keladi. Va bu panelda **hech qanday raqam bilan
 * ko'rinmasdi**: "Signallar: 0" degan ko'rsatkich "mahallada muammo
 * yo'q" degan xulosaga o'xshaydi, holbuki sabab — bot u yerda yo'q.
 *
 * ── UCH BOSHQA HOLAT, UCH BOSHQA CHORA ────────────────────────────────
 *
 *   bot guruhda YO'Q          → raisga murojaat qilib, botni qo'shish
 *   bot bor, ADMIN emas       → guruh egasiga admin huquqi so'rash
 *   admin, O'CHIRISH yo'q     → admin huquqlarini to'g'rilash
 *
 * ⚠️ BULAR BIR USTUNGA YIG'ILMAYDI: "qamrov 60%" degan yakka son
 * ma'muriyatga NIMA QILISHNI aytmasdi. Har holat boshqa odamga,
 * boshqa so'rov bilan boriladi.
 *
 * ── MFY DARAJASIDA SANALADI, GURUH DARAJASIDA EMAS ────────────────────
 *
 * ⚠️ BITTA MFY DA BIR NECHTA GURUH BO'LISHI MUMKIN (rasmiy guruh,
 * yoshlar guruhi, ko'cha guruhi). Savol esa "mahalla qoplanganmi" —
 * ya'ni **kamida bittasida** bot bormi. Guruhlarni sanash
 * "10 guruhdan 4 tasida bot bor" degan ma'nosiz raqam berardi.
 */

import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../prisma/prisma.service";
import {
  isProvinceWide,
  type ScopeContext,
} from "../../common/scope.util";

/**
 * BOT GURUH ICHIDA DEB HISOBLANADIGAN HOLATLAR.
 *
 * ⚠️ `groups.service.ts#PRESENT_STATUSES` BILAN AYNI RO'YXAT va u
 * shu sababdan takrorlanadi: qamrov "bot ichidami" degan savolga
 * javob beradi va ikki joyda boshqa-boshqa ro'yxat bo'lsa, panelda
 * "guruh bor" deb ko'rinib, kuzatuv ishlamayotgan holat chiqardi.
 */
const PRESENT_STATUSES = ["administrator", "member", "restricted"];

/** Bot to'liq huquqli — xabar o'chira oladi. */
const ADMIN_STATUS = "administrator";

export interface CoverageRow {
  districtId: string;
  districtName: string;

  /** Tumandagi arxivlanmagan MFY lar soni. */
  mahallaTotal: number;

  /** Kamida bitta guruhida bot BOR MFY lar. */
  covered: number;

  /**
   * BOT UMUMAN KIRMAGAN MFY LAR.
   *
   * ⚠️ IKKI HOLATNI BIRLASHTIRADI: guruh reyestrda umuman yo'q, va
   * guruh bor-u bot undan chiqarib tashlangan. Ma'muriyat uchun
   * ikkisi AYNI chora: raisga murojaat qilib, botni qo'shish.
   */
  notAttached: number;

  /**
   * BOT BOR, LEKIN ADMIN EMAS.
   *
   * ⚠️ `notAttached` GA QO'SHILMAYDI: bu yerda bot guruhda turadi va
   * xabarlarni O'QIYDI (kuzatuv ishlaydi), lekin zararli xabarni
   * o'chira olmaydi. Chora ham boshqa: guruhni qayta qo'shish emas,
   * mavjud botga huquq berish.
   */
  notAdmin: number;

  /**
   * ADMIN, LEKIN O'CHIRISH HUQUQI YO'Q.
   *
   * ⚠️ ENG JIM HOLAT: Telegram'da admin huquqlari ALOHIDA
   * belgilanadi va "Xabarlarni o'chirish" belgisi o'chirilgan
   * bo'lishi mumkin. Panelda bot admin bo'lib ko'rinadi, qalqon
   * esa ishlamaydi (`GroupStats.guardBlind` bilan ayni sabab).
   */
  adminNoDelete: number;

  /** Qoplanganlik ulushi (%) — `covered / mahallaTotal`. */
  coverageRate: number | null;
}

export interface CoverageReport {
  districts: CoverageRow[];
  /**
   * MFY BIRIKTIRILMAGAN GURUHLAR SONI.
   *
   * ⚠️ TUMAN KESIMIDA KO'RSATILMAYDI va ko'rsatib ham bo'lmaydi: bu
   * guruhlarning qaysi tumanga tegishli ekani NOMA'LUM — aynan
   * shuning uchun ular biriktirilmagan. Jadvaldan TASHQARIDA, alohida
   * son bo'lib turadi va ro'yxatini Excel qilib olish mumkin.
   */
  unassignedGroups: number;
  totals: {
    mahallaTotal: number;
    covered: number;
    notAttached: number;
    notAdmin: number;
    adminNoDelete: number;
    coverageRate: number | null;
  };
}

@Injectable()
export class ReportsCoverageService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * TUMAN KESIMIDAGI QAMROV.
   *
   * ⚠️ UCHTA SO'ROV, HAR MFY UCHUN BITTA EMAS: viloyatda yuzlab MFY
   * bor va har biri uchun guruhlarini so'rash sahifani ochilmaydigan
   * qilardi. Guruhlar BITTA so'rovda olinadi va MFY lar bo'yicha
   * XOTIRADA guruhlanadi.
   */
  async coverage(scope: ScopeContext): Promise<CoverageReport> {
    /**
     * ⚠️ QAMROV TEKSHIRUVI: tuman xodimi butun viloyat qamrovini
     * ko'rmasligi kerak — u faqat o'z tumani uchun javobgar va
     * boshqa tumanlarning bo'shliqlari uning ishi emas.
     *
     * ⚠️ `districtScopeWhere` ISHLATILMAYDI: u `districtId` kaliti
     * bilan ishlaydi, bu yerda esa jadvalning O'ZI tuman — shuning
     * uchun `id` (`territory.service.ts#listDistricts` dagi ayni
     * holat).
     */
    const districtWhere = isProvinceWide(scope)
      ? { isArchived: false }
      : { isArchived: false, id: scope.districtId ?? "__hech-qanday-tuman__" };

    const [districts, mahallas, groups, unassignedGroups] = await Promise.all([
      this.prisma.district.findMany({
        where: districtWhere,
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: { id: true, name: true },
      }),
      /**
       * ⚠️ ARXIVLANGAN MFY HISOBGA OLINMAYDI: u ishlatilmaydi va
       * "qoplanmagan" ro'yxatida turib, hech qachon tuzalmaydigan
       * bo'shliq bo'lib ko'rinardi.
       */
      this.prisma.mahalla.findMany({
        where: { isArchived: false },
        select: { id: true, districtId: true },
      }),
      /**
       * ⚠️ FAQAT MFY GA BIRIKTIRILGANLARI: biriktirilmagan guruh
       * qaysi MFY ni qoplayotgani NOMA'LUM va uni qoplangan deb
       * hisoblash eng yomon xato bo'lardi — panelda mahalla
       * kuzatuvda ko'rinib, amalda hech narsa kelmasdi.
       */
      this.prisma.telegramGroup.findMany({
        where: { mahallaId: { not: null } },
        select: {
          mahallaId: true,
          status: true,
          canDeleteMessages: true,
        },
      }),
      this.prisma.telegramGroup.count({
        where: {
          mahallaId: null,
          // ⚠️ CHIQIB KETGANLARI SANALMAYDI: ularni biriktirishning
          // ma'nosi yo'q va ro'yxatni bekorga shishirardi.
          status: { in: PRESENT_STATUSES },
        },
      }),
    ]);

    /** MFY → uning guruhlaridagi eng YUQORI holat. */
    const byMahalla = new Map<
      string,
      { present: boolean; admin: boolean; canDelete: boolean }
    >();

    for (const group of groups) {
      if (!group.mahallaId) continue;

      const present = PRESENT_STATUSES.includes(group.status);
      const admin = group.status === ADMIN_STATUS;

      const current = byMahalla.get(group.mahallaId);

      /**
       * ⚠️ ENG YAXSHI HOLAT OLINADI (`||`), oxirgisi emas: bitta
       * MFY da bir necha guruh bo'lsa va ulardan BITTASIDA bot
       * admin bo'lsa, mahalla himoyalangan hisoblanadi. Oxirgi
       * guruhga qarab xulosa chiqarish tasodifiy natija berardi.
       */
      byMahalla.set(group.mahallaId, {
        present: (current?.present ?? false) || present,
        admin: (current?.admin ?? false) || admin,
        canDelete: (current?.canDelete ?? false) || (admin && group.canDeleteMessages),
      });
    }

    const rows: CoverageRow[] = districts.map((district) => {
      const own = mahallas.filter((mahalla) => mahalla.districtId === district.id);

      let covered = 0;
      let notAdmin = 0;
      let adminNoDelete = 0;

      for (const mahalla of own) {
        const state = byMahalla.get(mahalla.id);

        if (!state?.present) continue;

        covered += 1;

        if (!state.admin) {
          notAdmin += 1;
          continue;
        }

        if (!state.canDelete) adminNoDelete += 1;
      }

      return {
        districtId: district.id,
        districtName: district.name,
        mahallaTotal: own.length,
        covered,
        notAttached: own.length - covered,
        notAdmin,
        adminNoDelete,
        /**
         * ⚠️ MFY SI YO'Q TUMANDA `null`, `0` EMAS: nol "qamrov
         * yo'q" degan ma'noni berib, tuman eng yomon ko'rinardi —
         * holbuki unda hisoblanadigan narsa ham yo'q (reyestr
         * hali to'ldirilmagan).
         */
        coverageRate:
          own.length > 0 ? Math.round((covered / own.length) * 1000) / 10 : null,
      };
    });

    const totals = rows.reduce(
      (sum, row) => ({
        mahallaTotal: sum.mahallaTotal + row.mahallaTotal,
        covered: sum.covered + row.covered,
        notAttached: sum.notAttached + row.notAttached,
        notAdmin: sum.notAdmin + row.notAdmin,
        adminNoDelete: sum.adminNoDelete + row.adminNoDelete,
        coverageRate: null as number | null,
      }),
      {
        mahallaTotal: 0,
        covered: 0,
        notAttached: 0,
        notAdmin: 0,
        adminNoDelete: 0,
        coverageRate: null as number | null,
      },
    );

    /**
     * ⚠️ JAMI ULUSH TUMANLAR O'RTACHASIDAN EMAS, JAMI SONDAN
     * hisoblanadi: 2 MFY li tuman va 60 MFY li tuman o'rtacha
     * olinganda bir xil og'irlik olardi va viloyat qamrovi
     * noto'g'ri chiqardi.
     */
    totals.coverageRate =
      totals.mahallaTotal > 0
        ? Math.round((totals.covered / totals.mahallaTotal) * 1000) / 10
        : null;

    return { districts: rows, unassignedGroups, totals };
  }

  /**
   * MFY BIRIKTIRILMAGAN GURUHLAR RO'YXATI.
   *
   * ⚠️ XOM RO'YXAT, KESIM EMAS: bu hisobot O'QISH uchun emas,
   * ISHLASH uchun — xodim uni ochib, har guruhni qaysi MFY ga
   * tegishliligini aniqlaydi va panelda biriktiradi. Shuning uchun
   * `username` va a'zolar soni ham bor: guruhni TANIB OLISH uchun
   * nom yetarli emas ("Mahalla", "Guruh", "Yoshlar" kabi nomlar
   * o'nlab).
   *
   * ⚠️ QAMROV TEKSHIRUVI YO'Q va bu ataylab: biriktirilmagan guruh
   * HECH QAYSI tumanga tegishli emas, ya'ni tuman bo'yicha filtrlab
   * bo'lmaydi. Tuman xodimiga bo'sh ro'yxat ko'rsatish esa "hammasi
   * joyida" degan noto'g'ri xulosa berardi — shuning uchun ro'yxat
   * to'liq ko'rinadi (ruxsat `groups.view` bilan himoyalangan).
   */
  async unassignedGroups() {
    return this.prisma.telegramGroup.findMany({
      where: { mahallaId: null, status: { in: PRESENT_STATUSES } },
      orderBy: [{ memberCount: "desc" }, { title: "asc" }],
      select: {
        chatId: true,
        title: true,
        username: true,
        type: true,
        status: true,
        memberCount: true,
        isOfficial: true,
        guardEnabled: true,
        canDeleteMessages: true,
        joinedAt: true,
      },
    });
  }
}
