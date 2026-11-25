/**
 * HISOBOTLAR — "nima bo'lyapti" degan savolga raqam bilan javob.
 *
 * ⚠️ HAMMA RAQAM BIR MANBADAN. Panelda bir nechta kesim bor
 * (hudud, kategoriya, manba, vaqt) va ularning JAMI bir xil
 * bo'lishi shart. Shuning uchun har kesim AYNI `where` ustiga
 * quriladi: `baseWhere()` bitta joyda yasaladi va hamma yerda
 * ishlatiladi. Aks holda ikki tab ikki xil "jami" ko'rsatardi.
 *
 * ⚠️ HISOBOT `Issue.mahallaId` BO'YICHA, guruhdan jonli
 * O'QILMAYDI. Muammoda hudud MUHRLANGAN (schema izohi): guruhning
 * MFY biriktirishi keyin o'zgarsa, o'tgan oy hisoboti
 * O'ZGARMASLIGI kerak.
 *
 * ⚠️ SIGNAL VA MUAMMO ALOHIDA SANALADI. "Nechta muammo bor" degan
 * savolga signallar qo'shilmaydi: signal — AI taxmini, muammo esa
 * rasmiy fakt. Ularni qo'shib ko'rsatish hisobotni ishonchsiz
 * qilardi.
 */

import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../prisma/prisma.service";
import {
  districtScopeWhere,
  isProvinceWide,
  mahallaScopeWhere,
  signalScopeWhere,
  type ScopeContext,
} from "../../common/scope.util";
import { TASHKENT_OFFSET_MINUTES, tashkentDayStart } from "../../common/date.util";
import {
  IssueSource,
  IssueStatus,
  SignalSeverity,
  SignalStatus,
  type Prisma,
} from "@prisma/client";
import type { ReportQuery } from "./dto/reports.dto";

const CLOSED: IssueStatus[] = [IssueStatus.resolved, IssueStatus.rejected];

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * UMUMIY KO'RSATKICHLAR.
   *
   * ⚠️ `avgResolutionHours` FAQAT YOPILGANLAR BO'YICHA. Ochiq
   * muammolarni qo'shsak ("hozirgacha qancha turdi"), raqam har
   * yangi muammo kelganda pasayib, hech narsa ko'rsatmay qolardi.
   */
  async overview(scope: ScopeContext, query: ReportQuery) {
    const where = this.baseWhere(scope, query);

    const [byStatus, bySource, resolved, overdue] = await Promise.all([
      this.prisma.issue.groupBy({
        by: ["status"],
        where,
        _count: { _all: true },
      }),
      // ⚠️ MANBA KESIMI — AI'NING FOYDASINI O'LCHASHNING YAGONA
      // YO'LI: "signal" nechta muammoga aylandi va u "bot"/"manual"
      // ga nisbatan qancha.
      this.prisma.issue.groupBy({
        by: ["source"],
        where,
        _count: { _all: true },
      }),
      this.prisma.issue.findMany({
        where: { ...where, status: { in: CLOSED }, reviewedAt: { not: null } },
        select: { createdAt: true, reviewedAt: true },
      }),
      this.prisma.issue.count({
        where: { ...where, dueAt: { lt: new Date() }, status: { notIn: CLOSED } },
      }),
    ]);

    const statusCounts: Record<string, number> = {
      new: 0,
      in_progress: 0,
      resolved: 0,
      rejected: 0,
    };
    for (const row of byStatus) statusCounts[row.status] = row._count._all;

    const sourceCounts: Record<string, number> = { signal: 0, bot: 0, manual: 0, mobile: 0 };
    for (const row of bySource) sourceCounts[row.source] = row._count._all;

    const total = Object.values(statusCounts).reduce((sum, count) => sum + count, 0);

    // O'rtacha hal qilish vaqti (soat).
    const avgResolutionHours =
      resolved.length > 0
        ? Math.round(
            (resolved.reduce(
              (sum, issue) =>
                sum + (issue.reviewedAt!.getTime() - issue.createdAt.getTime()),
              0,
            ) /
              resolved.length /
              3_600_000) *
              10,
          ) / 10
        : null;

    return {
      total,
      status: statusCounts,
      open: statusCounts.new! + statusCounts.in_progress!,
      source: sourceCounts,
      overdue,
      avgResolutionHours,
      // ⚠️ HAL QILISH ULUSHI — `rejected` MAXRAJDA, lekin SURATDA
      // EMAS: rad etilgan murojaat "hal qilingan" emas, lekin
      // ko'rib chiqilgan. Maxrajdan chiqarilsa, hamma narsani rad
      // etib 100% ko'rsatish mumkin bo'lardi.
      resolutionRate:
        total > 0 ? Math.round((statusCounts.resolved! / total) * 1000) / 10 : null,
    };
  }

  /**
   * HUDUD KESIMI — qaysi tumanda/MFY da ko'proq murojaat.
   *
   * ⚠️ `population` BO'LGANDA 1000 AHOLIGA NISBATAN ham beriladi:
   * katta MFY da ko'proq murojaat bo'lishi tabiiy va faqat xom
   * sanoq "eng muammoli MFY" ni noto'g'ri ko'rsatardi.
   */
  async byTerritory(scope: ScopeContext, query: ReportQuery) {
    const where = this.baseWhere(scope, query);

    const rows = await this.prisma.issue.groupBy({
      by: ["mahallaId"],
      where,
      _count: { _all: true },
    });

    const mahallaIds = rows
      .map((row) => row.mahallaId)
      .filter((id): id is string => id !== null);

    const mahallas = mahallaIds.length
      ? await this.prisma.mahalla.findMany({
          where: { id: { in: mahallaIds } },
          select: {
            id: true,
            name: true,
            population: true,
            district: { select: { id: true, name: true } },
          },
        })
      : [];

    const byId = new Map(mahallas.map((mahalla) => [mahalla.id, mahalla]));

    const items = rows
      .map((row) => {
        const mahalla = row.mahallaId ? byId.get(row.mahallaId) : null;
        const count = row._count._all;

        return {
          mahallaId: row.mahallaId,
          // ⚠️ HUDUDI YO'Q MUAMMOLAR ALOHIDA SATR, tashlanmaydi:
          // ularning soni "MFY biriktirish ishi qoldi" degan
          // signalning o'zi.
          mahallaName: mahalla?.name ?? "Hududi belgilanmagan",
          district: mahalla?.district ?? null,
          population: mahalla?.population ?? null,
          count,
          per1000:
            mahalla?.population && mahalla.population > 0
              ? Math.round((count / mahalla.population) * 1000 * 10) / 10
              : null,
        };
      })
      .sort((a, b) => b.count - a.count);

    // Tuman bo'yicha yig'ma.
    const districtMap = new Map<string, { id: string; name: string; count: number }>();
    for (const item of items) {
      if (!item.district) continue;
      const existing = districtMap.get(item.district.id);
      if (existing) existing.count += item.count;
      else
        districtMap.set(item.district.id, {
          id: item.district.id,
          name: item.district.name,
          count: item.count,
        });
    }

    /**
     * ── TUMAN AHOLISI — NISBIY KO'RSATKICH UCHUN ──────────────────
     *
     * ⚠️ "Ulug'norda 50 ta, Asakada 450 ta murojaat" degan raqam HECH
     * NARSA aytmaydi — Asaka shunchaki kattaroq. "Har 1000 kishiga
     * 20 ta va 18 ta" esa ikkisini SOLISHTIRIB bo'ladigan qiladi va
     * ko'rsatkich ma'noga ega bo'ladi.
     *
     * ⚠️ IKKI MANBA: tumanning O'Z soni (aniqroq) yoki MFY lar
     * yig'indisi (zaxira). MFY aholisi to'liq to'ldirilmagan bo'lsa,
     * yig'indi tumanni sun'iy "kichik" ko'rsatib, nisbiy sonni
     * osmonga ko'tarardi — shuning uchun to'g'ridan-to'g'ri qiymat
     * USTUN turadi.
     */
    const districtIds = [...districtMap.keys()];

    const [districtRows, mahallaSums] = districtIds.length
      ? await Promise.all([
          this.prisma.district.findMany({
            where: { id: { in: districtIds } },
            select: { id: true, population: true },
          }),
          this.prisma.mahalla.groupBy({
            by: ["districtId"],
            where: { districtId: { in: districtIds }, isArchived: false },
            _sum: { population: true },
          }),
        ])
      : [[], []];

    const explicit = new Map(districtRows.map((row) => [row.id, row.population]));
    const summed = new Map(
      mahallaSums.map((row) => [row.districtId, row._sum.population]),
    );

    const districts = [...districtMap.values()]
      .map((district) => {
        const population = explicit.get(district.id) ?? summed.get(district.id) ?? null;

        return {
          ...district,
          population,
          /**
           * ⚠️ Aholi ma'lumoti yo'q bo'lsa `null` — `0` EMAS: nol
           * "bu yerda hech kim yashamaydi" degan ma'noni berardi va
           * panel uni "0 murojaat" bilan adashtirardi.
           */
          per1000:
            population && population > 0
              ? Math.round((district.count / population) * 1000 * 10) / 10
              : null,
          /** Son qayerdan olingani — panel buni izoh qilib ko'rsatadi. */
          populationSource: explicit.get(district.id)
            ? ("district" as const)
            : summed.get(district.id)
              ? ("mahallas" as const)
              : null,
        };
      })
      .sort((a, b) => b.count - a.count);

    return { mahallas: items, districts };
  }

  /**
   * TIZIMLI (TAKRORLANUVCHI) MUAMMOLAR — MFY × YO'NALISH.
   *
   * ── NIMA UCHUN KERAK ───────────────────────────────────────────
   *
   * ⚠️ BITTA MUROJAAT — HODISA, O'NTASI — TIZIMLI MUAMMO. "Bobur MFY
   * da ichimlik suvi bo'yicha oyiga 14 ta murojaat" degan satr
   * quvurni almashtirish kerakligini aytadi; o'sha 14 ta murojaatni
   * birma-bir yopish esa muammoni HECH QACHON hal qilmaydi.
   *
   * ⚠️ KICHIK YO'NALISH KESIMIDA: "Kommunal xizmatlar" degan uyum
   * hech narsa bermasdi — aynan shuning uchun yo'nalishlar ikki
   * darajali qilindi.
   *
   * ⚠️ TAKRORIYLAR (`duplicateOfId`) HAM SANALADI: ommaviy hodisada
   * 20 ta yozuv bo'ladi va ularni chiqarib tashlash muammoning
   * HAQIQIY ko'lamini yashirardi. Lekin ular ALOHIDA ham
   * ko'rsatiladi — "14 ta hodisa" va "14 ta yozuv" boshqa-boshqa
   * narsa.
   */
  async recurring(scope: ScopeContext, query: ReportQuery) {
    const where = this.baseWhere(scope, query);

    const rows = await this.prisma.issue.groupBy({
      by: ["mahallaId", "categoryId"],
      where: { ...where, mahallaId: { not: null } },
      _count: { _all: true },
      _min: { createdAt: true },
      _max: { createdAt: true },
    });

    /**
     * ⚠️ YAKKA MUROJAAT TIZIMLI MUAMMO EMAS: chegara qo'yilmasa
     * ro'yxat butun jadvalning nusxasi bo'lib, hech narsa
     * ko'rsatmasdi.
     */
    const MIN_COUNT = 3;
    const candidates = rows.filter((row) => row._count._all >= MIN_COUNT);

    if (candidates.length === 0) return { items: [] };

    const mahallaIds = [
      ...new Set(
        candidates.map((row) => row.mahallaId).filter((id): id is string => Boolean(id)),
      ),
    ];
    const categoryIds = [...new Set(candidates.map((row) => row.categoryId))];

    const [mahallas, categories, duplicateRows] = await Promise.all([
      this.prisma.mahalla.findMany({
        where: { id: { in: mahallaIds } },
        select: {
          id: true,
          name: true,
          population: true,
          district: { select: { id: true, name: true } },
        },
      }),
      this.prisma.issueCategory.findMany({
        where: { id: { in: categoryIds } },
        select: {
          id: true,
          name: true,
          color: true,
          parent: { select: { id: true, name: true } },
        },
      }),
      this.prisma.issue.groupBy({
        by: ["mahallaId", "categoryId"],
        where: {
          ...where,
          mahallaId: { in: mahallaIds },
          duplicateOfId: { not: null },
        },
        _count: { _all: true },
      }),
    ]);

    const mahallaById = new Map(mahallas.map((item) => [item.id, item]));
    const categoryById = new Map(categories.map((item) => [item.id, item]));
    const duplicatesByKey = new Map(
      duplicateRows.map((row) => [`${row.mahallaId}|${row.categoryId}`, row._count._all]),
    );

    const items = candidates
      .map((row) => {
        const mahalla = row.mahallaId ? mahallaById.get(row.mahallaId) : null;
        const category = categoryById.get(row.categoryId);
        const duplicates = duplicatesByKey.get(`${row.mahallaId}|${row.categoryId}`) ?? 0;

        /**
         * ⚠️ ORALIQ KUNLARDA: "14 ta murojaat 3 kunda" va "14 ta
         * murojaat 6 oyda" BUTUNLAY boshqa narsa — birinchisi
         * avariya, ikkinchisi eskirgan quvur. Oyiga nechta
         * to'g'ri kelishi shundan hisoblanadi.
         */
        const first = row._min.createdAt?.getTime() ?? 0;
        const last = row._max.createdAt?.getTime() ?? 0;
        const spanDays = Math.max(1, Math.round((last - first) / 86_400_000));

        return {
          mahallaId: row.mahallaId,
          mahallaName: mahalla?.name ?? "—",
          district: mahalla?.district ?? null,
          categoryId: row.categoryId,
          categoryName: category?.name ?? "—",
          parentName: category?.parent?.name ?? null,
          color: category?.color ?? null,
          total: row._count._all,
          /** Ommaviy hodisadagi takroriy yozuvlar soni. */
          duplicates,
          /** Takroriylarni chiqarib tashlagandagi HODISALAR soni. */
          incidents: row._count._all - duplicates,
          firstAt: row._min.createdAt,
          lastAt: row._max.createdAt,
          spanDays,
          /** Oyiga nechta murojaat — "tizimlilik" o'lchovi. */
          perMonth: Math.round((row._count._all / spanDays) * 30 * 10) / 10,
        };
      })
      .sort((a, b) => b.total - a.total);

    return { items };
  }

  /** KATEGORIYA KESIMI — nima haqida ko'proq yozyapti. */
  async byCategory(scope: ScopeContext, query: ReportQuery) {
    const where = this.baseWhere(scope, query);

    /**
     * ⚠️ MUDDATI O'TGANLAR AYNI KESIMDA SANALADI va bu TIRIK
     * sinovda topilgan bo'shliq edi: hisobot yordamchisiga
     * "muddati o'tganlar qaysi yo'nalishda ko'p" deb savol
     * berilganda, u "jadvalda bu kesim yo'q" deb javob berdi —
     * to'g'ri qildi, lekin savol eng ko'p so'raladiganlardan
     * biri.
     *
     * ⚠️ IKKINCHI `groupBy`, `where` GA SHART QO'SHISH EMAS:
     * ikkisi BIR VAQTDA kerak ("jami" va "undan muddati
     * o'tgani"). Bitta so'rovga shart qo'shilsa, jami son
     * yo'qolardi.
     */
    const [rows, overdueRows] = await Promise.all([
      this.prisma.issue.groupBy({
        by: ["categoryId"],
        where,
        _count: { _all: true },
      }),
      this.prisma.issue.groupBy({
        by: ["categoryId"],
        // ⚠️ `overview` DAGI AYNI SHART: "muddati o'tgan" degani
        // — muddat o'tgan VA hali yopilmagan. Yopilganini
        // qo'shish "kech bo'lsa ham hal qilindi" ni muammo deb
        // ko'rsatardi.
        where: { ...where, dueAt: { lt: new Date() }, status: { notIn: CLOSED } },
        _count: { _all: true },
      }),
    ]);

    const overdueById = new Map(
      overdueRows.map((row) => [row.categoryId, row._count._all]),
    );

    const categories = await this.prisma.issueCategory.findMany({
      where: { id: { in: rows.map((row) => row.categoryId) } },
      // ⚠️ `icon` HAM: boshqaruv paneli yo'nalishlarni belgisi
      // bilan ko'rsatadi (xarita va ilova bilan AYNI belgi).
      //
      // ⚠️ `parent` HAM: yakka "Ichimlik suvi" kontekstsiz qolardi
      // va uni "Tozalik" bilan adashtirish mumkin edi (AI
      // promptidagi ayni sabab).
      select: {
        id: true,
        name: true,
        color: true,
        icon: true,
        parent: { select: { name: true } },
      },
    });
    const byId = new Map(categories.map((category) => [category.id, category]));

    return rows
      .map((row) => ({
        categoryId: row.categoryId,
        name: byId.get(row.categoryId)?.name ?? "—",
        parentName: byId.get(row.categoryId)?.parent?.name ?? null,
        color: byId.get(row.categoryId)?.color ?? null,
        icon: byId.get(row.categoryId)?.icon ?? null,
        count: row._count._all,
        overdue: overdueById.get(row.categoryId) ?? 0,
      }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * SIGNAL KO'RSATKICHLARI — AI qanchalik foydali.
   *
   * ⚠️ `attachRate` — AI ANIQLIGINING O'LCHOVI: biriktirilgan /
   * (biriktirilgan + e'tiborsiz). `new` MAXRAJDA EMAS: hali
   * ko'rilmagan signal AI to'g'ri yoki xato topganini
   * BILDIRMAYDI, va uni qo'shsak ko'rsatkich navbat uzunligiga
   * qarab o'zgarib turardi.
   */
  async signalMetrics(scope: ScopeContext, query: ReportQuery) {
    const where: Prisma.GroupSignalWhereInput = {
      ...signalScopeWhere(scope, { includeUnassigned: isProvinceWide(scope) }),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };

    const [byStatus, byKind, bySeverity, byCategory] = await Promise.all([
      this.prisma.groupSignal.groupBy({ by: ["status"], where, _count: { _all: true } }),
      this.prisma.groupSignal.groupBy({ by: ["kind"], where, _count: { _all: true } }),
      this.prisma.groupSignal.groupBy({ by: ["severity"], where, _count: { _all: true } }),
      /**
       * YO'NALISH KESIMI — "qaysi yo'nalishda muammo ko'p".
       *
       * ⚠️ `status` VA `severity` HAM GURUHLANADI, faqat
       * `categoryId` emas. Sabab: yalang'och "Kommunal — 40
       * signal" degan son HECH NARSA aytmaydi, chunki ichida
       * "muammo emas" deb yopilganlari ham bor. Kesim ma'noli
       * bo'lishi uchun uchtasi BIRGA kerak:
       *
       *   jami 40 / 30 tasi muammoga aylandi  → haqiqiy muammo o'chog'i
       *   jami 40 / 2 tasi muammoga aylandi   → AI shu yo'nalishda
       *                                         yanglishayapti
       *
       * Ikkinchi holatda xulosa "Kommunalda muammo ko'p" EMAS,
       * balki "promptni tuzatish kerak" bo'ladi — va bu farqni
       * faqat `status` kesimi ko'rsatadi.
       */
      this.prisma.groupSignal.groupBy({
        by: ["categoryId", "status", "severity"],
        where,
        _count: { _all: true },
      }),
    ]);

    const status: Record<string, number> = { new: 0, attached: 0, dismissed: 0 };
    for (const row of byStatus) status[row.status] = row._count._all;

    const kind: Record<string, number> = { complaint: 0, suggestion: 0, question: 0 };
    for (const row of byKind) kind[row.kind] = row._count._all;

    const severity: Record<string, number> = { low: 0, normal: 0, high: 0 };
    for (const row of bySeverity) severity[row.severity] = row._count._all;

    const reviewed = status.attached! + status.dismissed!;

    return {
      total: status.new! + reviewed,
      status,
      kind,
      severity,
      byCategory: await this.buildSignalCategoryRows(byCategory),
      attachRate:
        reviewed > 0 ? Math.round((status.attached! / reviewed) * 1000) / 10 : null,
    };
  }

  /**
   * YO'NALISH KESIMINI ODAM O'QIYDIGAN QATORLARGA AYLANTIRADI.
   *
   * ⚠️ NOMLAR ALOHIDA SO'ROVDA olinadi, `include` bilan emas:
   * `groupBy` relation'ni qo'shib bera olmaydi. Faqat KERAKLI
   * id'lar so'raladi — butun jadval emas (`byCategory` dagi ayni
   * mantiq).
   *
   * ⚠️ YO'NALISHSIZ SIGNALLAR YO'QOTILMAYDI, alohida qator bo'lib
   * chiqadi (`categoryId: null`). Ularni jim tashlab yuborish
   * "jami" ni ustunlar yig'indisidan KATTA qilib qo'yardi va
   * hisobotga ishonchni buzardi. Bu qator o'zi ham xabar beradi:
   * ko'p bo'lsa — AI yo'nalishni aniqlay olmayapti.
   */
  private async buildSignalCategoryRows(
    rows: {
      categoryId: string | null;
      status: SignalStatus;
      severity: SignalSeverity;
      _count: { _all: number };
    }[],
  ) {
    const ids = [
      ...new Set(
        rows
          .map((row) => row.categoryId)
          .filter((id): id is string => id !== null),
      ),
    ];

    const categories =
      ids.length > 0
        ? await this.prisma.issueCategory.findMany({
            where: { id: { in: ids } },
            select: {
              id: true,
              name: true,
              color: true,
              icon: true,
              parent: { select: { name: true } },
            },
          })
        : [];

    const byId = new Map(categories.map((category) => [category.id, category]));

    interface Bucket {
      total: number;
      newCount: number;
      attached: number;
      dismissed: number;
      high: number;
    }

    const buckets = new Map<string, Bucket>();

    for (const row of rows) {
      // ⚠️ `null` KALITI BO'SH SATR BO'LIB saqlanadi: `Map` kaliti
      // sifatida `null` ishlaydi, lekin keyin `byId.get(null)` ni
      // tekshirish kerak bo'lardi. Bo'sh satr bu farqni bitta
      // joyda ushlab turadi.
      const key = row.categoryId ?? "";
      const bucket =
        buckets.get(key) ??
        { total: 0, newCount: 0, attached: 0, dismissed: 0, high: 0 };

      const count = row._count._all;
      bucket.total += count;

      if (row.status === SignalStatus.new) bucket.newCount += count;
      if (row.status === SignalStatus.attached) bucket.attached += count;
      if (row.status === SignalStatus.dismissed) bucket.dismissed += count;
      if (row.severity === SignalSeverity.high) bucket.high += count;

      buckets.set(key, bucket);
    }

    return [...buckets.entries()]
      .map(([key, bucket]) => {
        const category = key ? byId.get(key) : undefined;
        const reviewed = bucket.attached + bucket.dismissed;

        return {
          categoryId: key || null,
          // ⚠️ YO'NALISHSIZ QATOR ANIQ NOMLANADI: "—" qo'yilsa
          // operator uni "nomi yo'q yo'nalish" deb o'qib, sozlamada
          // izlab yurardi.
          name: key ? (category?.name ?? "—") : "Yo'nalish aniqlanmagan",
          parentName: category?.parent?.name ?? null,
          color: category?.color ?? null,
          icon: category?.icon ?? null,
          total: bucket.total,
          new: bucket.newCount,
          attached: bucket.attached,
          dismissed: bucket.dismissed,
          high: bucket.high,
          /**
           * ⚠️ YO'NALISH KESIMIDAGI ANIQLIK — umumiy `attachRate`
           * bilan AYNI maxraj (`new` hisobga olinmaydi): ko'rilmagan
           * signal AI to'g'ri topganini BILDIRMAYDI.
           *
           * Bu ustun savolni ikkiga ajratadi: "bu yo'nalishda
           * muammo ko'pmi" (→ `total`) yoki "AI shu yo'nalishda
           * yanglishayaptimi" (→ past `attachRate`).
           */
          attachRate:
            reviewed > 0
              ? Math.round((bucket.attached / reviewed) * 1000) / 10
              : null,
        };
      })
      // ⚠️ JAMI BO'YICHA: savol "qaysi yo'nalishda signal KO'P".
      .sort((a, b) => b.total - a.total);
  }

  /**
   * KUNLIK DINAMIKA — oxirgi N kun.
   *
   * ⚠️ `$queryRaw` ISHLATILADI, chunki Prisma `groupBy` sana
   * bo'yicha KUNGA kesishni qo'llab-quvvatlamaydi. Qiymatlar
   * PARAMETR sifatida uzatiladi (`Prisma.sql`), satrga
   * qo'shilmaydi — SQL injection imkoni yo'q.
   *
   * ⚠️ `AT TIME ZONE 'Asia/Tashkent'`: `date_trunc` ni UTC'da
   * qilsak, kechqurun 20:00 dan keyingi murojaatlar ERTANGI kunga
   * tushardi (Toshkent UTC+5).
   */
  async daily(scope: ScopeContext, days: number) {
    const from = tashkentDayStart(-(days - 1));

    const scopeWhere = mahallaScopeWhere(scope, {
      includeUnassigned: isProvinceWide(scope),
    });

    // Qamrovni raw so'rovda takrorlamaslik uchun id'lar oldin
    // olinadi. Tuman xodimida bu bir necha o'nlab MFY — kichik
    // ro'yxat.
    const allowed = isProvinceWide(scope)
      ? null
      : await this.prisma.mahalla.findMany({
          where: { districtId: scope.districtId ?? "__none__" },
          select: { id: true },
        });

    const issues = await this.prisma.issue.findMany({
      where: {
        ...scopeWhere,
        createdAt: { gte: from },
        ...(allowed ? { mahallaId: { in: allowed.map((row) => row.id) } } : {}),
      },
      select: { createdAt: true, status: true },
    });

    // ⚠️ GURUHLASH KODDA, SQL'DA EMAS: kun soni 90 dan oshmaydi
    // (DTO chegarasi) va bu hajmda xotirada guruhlash raw
    // so'rovdan ko'ra oddiy va xavfsiz.
    const buckets = new Map<string, { date: string; total: number; resolved: number }>();

    /**
     * TOSHKENT KUNI KALITI — IKKALA TOMON UCHUN BITTA FUNKSIYA.
     *
     * ⚠️ AVVAL IKKI XIL HISOBLANARDI va kalitlar HAR DOIM bir
     * kunga farq qilardi: savat `tashkentDayStart()` qaytargan
     * INSTANT'ni (`...T19:00Z` — Toshkent yarim tunining UTC
     * ko'rinishi) kesib olardi, ya'ni "kecha"ni; murojaat esa
     * `+5 soat` bilan to'g'ri "bugun"ni berardi.
     *
     * Natijasi: bugungi murojaatlar hech qanday savatga
     * tushmasdi va grafikda JIMGINA yo'qolardi — xato emas,
     * shunchaki doim nol.
     */
    const tashkentDayKey = (value: Date): string =>
      new Date(value.getTime() + TASHKENT_OFFSET_MINUTES * 60_000)
        .toISOString()
        .slice(0, 10);

    for (let offset = 0; offset < days; offset += 1) {
      // ⚠️ `tashkentDayStart` INSTANT qaytaradi — uni ham AYNI
      // funksiya bilan kalitga aylantiramiz.
      const key = tashkentDayKey(tashkentDayStart(-(days - 1 - offset)));
      buckets.set(key, { date: key, total: 0, resolved: 0 });
    }

    for (const issue of issues) {
      const key = tashkentDayKey(issue.createdAt);
      const bucket = buckets.get(key);
      if (!bucket) continue;

      bucket.total += 1;
      if (issue.status === IssueStatus.resolved) bucket.resolved += 1;
    }

    return [...buckets.values()];
  }

  /**
   * MINI APP ANALITIKASI — fuqaro murojaatlari kesimi.
   *
   * ⚠️ FAQAT `source=mobile`: bu hisobot ilovadan kelgan oqimni
   * o'lchaydi, bot/signal/manual EMAS. Fuqaro faolligi, yo'nalishlar,
   * SLA bajarilishi va fuqaroga javob vaqti shu yerda.
   */
  async mobileMetrics(scope: ScopeContext, query: ReportQuery) {
    const where: Prisma.IssueWhereInput = {
      ...this.baseWhere(scope, query),
      source: IssueSource.mobile,
    };

    const [byStatus, resolved, overdue, byCategory, citizenAgg, topCitizens] =
      await Promise.all([
        this.prisma.issue.groupBy({ by: ["status"], where, _count: { _all: true } }),
        // Hal qilingan mobil murojaatlar — javob vaqti + SLA uchun.
        this.prisma.issue.findMany({
          where: { ...where, status: { in: CLOSED }, reviewedAt: { not: null } },
          select: { createdAt: true, reviewedAt: true, dueAt: true },
        }),
        this.prisma.issue.count({
          where: { ...where, dueAt: { lt: new Date() }, status: { notIn: CLOSED } },
        }),
        this.prisma.issue.groupBy({ by: ["categoryId"], where, _count: { _all: true } }),
        // ⚠️ FUQARO SANOG'I QAMROVGA BOG'LANMAYDI: fuqaro hududiy
        // obyekt emas (`Citizen` da MFY/tuman ixtiyoriy). Jami /
        // bloklangan sanoq butun tizim bo'yicha.
        this.prisma.citizen.aggregate({ _count: { _all: true } }),
        this.prisma.citizen.findMany({
          where: { points: { gt: 0 }, isBlocked: false },
          orderBy: { points: "desc" },
          take: 5,
          select: {
            id: true,
            firstName: true,
            lastName: true,
            points: true,
            _count: { select: { issues: true } },
          },
        }),
      ]);

    /**
     * ⚠️ "OBUNACHI" DEGAN BITTA SON YO'Q va bo'lishi ham mumkin
     * emas — shuning uchun bu yerda UCHTA alohida sanoq:
     *
     *   total     — ro'yxatdan o'tganlar (botga ham, ilovaga ham)
     *   telegram  — Telegram orqali XABAR YUBORSA BO'LADIGANLAR
     *   recent    — oxirgi 30 kunda ishlatganlar
     *
     * ⚠️ `telegram` ≠ `total`: Google bilan kirgan fuqaroda
     * `telegramId` YO'Q va unga tarqatma bormaydi
     * (`broadcasts.service.ts` dagi filtr bilan ayni sabab).
     *
     * ⚠️ `recent` KERAK, CHUNKI `total` MA'NOSINI YO'QOTADI: botni
     * bir marta ochib tashlab ketgan odam ro'yxatda abadiy qoladi va
     * son yildan-yilga o'sib boradi.
     */
    const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [blockedCitizens, activeCitizens, telegramCitizens, recentCitizens] =
      await Promise.all([
        this.prisma.citizen.count({ where: { isBlocked: true } }),
        // "Faol" — kamida bitta murojaat yuborgan.
        this.prisma.citizen.count({ where: { issues: { some: {} } } }),
        this.prisma.citizen.count({
          where: { telegramId: { not: null }, isBlocked: false, deletedAt: null },
        }),
        this.prisma.citizen.count({
          where: { lastSeenAt: { gte: since30d }, deletedAt: null },
        }),
      ]);

    const statusCounts: Record<string, number> = {
      new: 0,
      in_progress: 0,
      resolved: 0,
      rejected: 0,
    };
    for (const row of byStatus) statusCounts[row.status] = row._count._all;
    const total = Object.values(statusCounts).reduce((sum, c) => sum + c, 0);

    // Fuqaroga javob vaqti (soat) + SLA ichida bajarilgani.
    let onTime = 0;
    const avgResponseHours =
      resolved.length > 0
        ? Math.round(
            (resolved.reduce((sum, issue) => {
              if (issue.dueAt && issue.reviewedAt! <= issue.dueAt) onTime += 1;
              return sum + (issue.reviewedAt!.getTime() - issue.createdAt.getTime());
            }, 0) /
              resolved.length /
              3_600_000) *
              10,
          ) / 10
        : null;

    // Yo'nalish nomlarini biriktiramiz.
    const categoryIds = byCategory.map((row) => row.categoryId);
    const categories = await this.prisma.issueCategory.findMany({
      where: { id: { in: categoryIds } },
      select: { id: true, name: true, color: true, icon: true, slaHours: true },
    });
    const catMap = new Map(categories.map((c) => [c.id, c]));

    return {
      total,
      status: statusCounts,
      open: statusCounts.new! + statusCounts.in_progress!,
      overdue,
      resolutionRate:
        total > 0 ? Math.round((statusCounts.resolved! / total) * 1000) / 10 : null,
      avgResponseHours,
      // SLA ichida bajarilgan ulush (hal qilinganlar orasida).
      slaOnTimeRate:
        resolved.length > 0 ? Math.round((onTime / resolved.length) * 1000) / 10 : null,
      citizens: {
        total: citizenAgg._count._all,
        active: activeCitizens,
        blocked: blockedCitizens,
        /** Telegram orqali xabar yuborsa bo'ladiganlar — yuqoridagi izoh. */
        telegram: telegramCitizens,
        /** Oxirgi 30 kunda botni yoki ilovani ishlatganlar. */
        recent: recentCitizens,
      },
      categories: byCategory
        .map((row) => ({
          id: row.categoryId,
          name: catMap.get(row.categoryId)?.name ?? "—",
          color: catMap.get(row.categoryId)?.color ?? null,
          icon: catMap.get(row.categoryId)?.icon ?? null,
          count: row._count._all,
        }))
        .sort((a, b) => b.count - a.count),
      topCitizens: topCitizens.map((c) => ({
        id: c.id,
        name: [c.firstName, c.lastName].filter(Boolean).join(" "),
        points: c.points,
        appeals: c._count.issues,
      })),
    };
  }

  /**
   * XARITA NUQTALARI — koordinatasi bor murojaatlar.
   *
   * ⚠️ QAMROVGA BO'YSUNADI (`baseWhere`): tuman xodimi faqat o'z
   * tumanidagi nuqtalarni ko'radi. Koordinata asosan `mobile`
   * murojaatlarda bor (fuqaro xaritada belgilaydi).
   *
   * ⚠️ CHEGARA BOR (2000): butun jadvalni xaritaga tortish brauzerni
   * yiqitardi. Eng yangilari olinadi.
   */
  /**
   * MFY KESIMI — XARITADAGI ISSIQLIK VA POLIGONLAR UCHUN.
   *
   * ── NIMA UCHUN ALOHIDA SO'ROV ───────────────────────────
   *
   * ⚠️ NUQTALARDAN HISOBLAB BO'LMAYDI. Xaritadagi nuqtalar FAQAT
   * koordinatasi bor murojaatlar (asosan ilovadan kelgani) va ular
   * 2000 ta bilan cheklangan. "Qaysi MFY da muammo ko'p" degan
   * savolga javob esa HAMMA murojaatni sanashni talab qiladi —
   * koordinatasizlarini ham, chunki ular ham MFY ga biriktirilgan.
   *
   * ⚠️ YO'NALISH KESIMI SHU YERDA: "har yo'nalish bo'yicha MFY
   * kesimida filtr" talabi uchun mijozga har MFY ning har yo'nalish
   * bo'yicha soni kerak. Shuning uchun sanoq YO'NALISH BO'YICHA
   * bo'lingan holda qaytadi va filtr mijozda, so'rovsiz ishlaydi.
   *
   * ⚠️ GEOMETRIYA IXTIYORIY: MFY chegaralari rasmiy manbadan
   * keladi va hamma MFY uchun birdan topilmaydi. Chegara bo'lmasa
   * xarita DOIRA chizadi (`lat`/`lng` bo'yicha), ya'ni savol
   * baribir javobsiz qolmaydi.
   */
  async mahallaMap(scope: ScopeContext, query: ReportQuery) {
    const where = this.baseWhere(scope, query);

    const [mahallas, grouped] = await Promise.all([
      this.prisma.mahalla.findMany({
        where: { isArchived: false, ...districtScopeWhere(scope) },
        orderBy: [{ districtId: "asc" }, { sortOrder: "asc" }],
        select: {
          id: true,
          name: true,
          lat: true,
          lng: true,
          geoJson: true,
          district: { select: { id: true, name: true } },
        },
      }),
      this.prisma.issue.groupBy({
        by: ["mahallaId", "categoryId"],
        where: {
          ...where,
          mahallaId: { not: null },
          ...(query.status ? { status: query.status } : {}),
        },
        _count: { _all: true },
      }),
    ]);

    /**
     * ── MARKAZ ZAXIRASI ──────────────────────────────────
     *
     * ⚠️ MFY CHEGARALARI RASMIY MANBADAN KELADI va ular hali
     * import qilinmagan bo'lishi mumkin. Markazsiz MFY xaritada
     * UMUMAN ko'rinmasdi — ya'ni butun kesim bo'sh bo'lib qolardi
     * va mijoz "ishlamayapti" deb o'ylardi.
     *
     * ⚠️ ZAXIRA — O'SHA MFY DAGI MUROJAATLARNING O'RTACHA
     * KOORDINATASI. Bu TAXMINIY markaz va u chegaraning o'rnini
     * bosmaydi, lekin "qaysi mahallada ko'p" savoliga BUGUN javob
     * beradi. Chegara import qilingach, `Mahalla.lat`/`lng` ustun
     * turadi.
     *
     * ⚠️ FAQAT MARKAZI YO'Q MFY LAR UCHUN so'raladi: hammasi
     * uchun hisoblash ortiqcha ish bo'lardi.
     */
    const needCenter = mahallas
      .filter((mahalla) => mahalla.lat === null || mahalla.lng === null)
      .map((mahalla) => mahalla.id);

    const derived = new Map<string, { lat: number; lng: number }>();

    if (needCenter.length > 0) {
      const centers = await this.prisma.issue.groupBy({
        by: ["mahallaId"],
        where: {
          mahallaId: { in: needCenter },
          lat: { not: null },
          lng: { not: null },
        },
        _avg: { lat: true, lng: true },
      });

      for (const row of centers) {
        if (!row.mahallaId || row._avg.lat === null || row._avg.lng === null) continue;
        derived.set(row.mahallaId, { lat: row._avg.lat, lng: row._avg.lng });
      }
    }

    /**
     * ⚠️ YIG'INDI SERVERDA HISOBLANADI: panel yo'nalish bo'yicha
     * filtrlaganda sonni qayta yig'adi, lekin "hammasi" holatidagi
     * son ham kerak — uni har renderda qayta hisoblash ortiqcha ish.
     */
    const byMahalla = new Map<
      string,
      { total: number; byCategory: Record<string, number> }
    >();

    for (const row of grouped) {
      if (!row.mahallaId) continue;

      const entry = byMahalla.get(row.mahallaId) ?? { total: 0, byCategory: {} };
      entry.total += row._count._all;
      entry.byCategory[row.categoryId] =
        (entry.byCategory[row.categoryId] ?? 0) + row._count._all;
      byMahalla.set(row.mahallaId, entry);
    }

    return mahallas.map((mahalla) => {
      const counts = byMahalla.get(mahalla.id);

      const fallback = derived.get(mahalla.id);

      return {
        id: mahalla.id,
        name: mahalla.name,
        district: mahalla.district,
        lat: mahalla.lat ?? fallback?.lat ?? null,
        lng: mahalla.lng ?? fallback?.lng ?? null,
        /**
         * ⚠️ MARKAZ TAXMINIYMI — PANEL BUNI KO'RSATADI (uzuk
         * chiziq): aniq chegara bilan taxminiy nuqtani bir xil
         * ko'rsatish xaritaga ortiqcha ishonch berardi.
         *
         * ⚠️ CHEGARA BOR BO'LSA — TAXMINIY EMAS: xarita o'shanda
         * POLIGONNI chizadi va markaz umuman ishlatilmaydi. Aks
         * holda aniq chegarali MFY ham "taxminiy" deb
         * belgilanardi — ya'ni yozuv yolg'on bo'lardi.
         */
        isApproximate:
          mahalla.geoJson === null &&
          mahalla.lat === null &&
          fallback !== undefined,
        /** GeoJSON `Polygon`/`MultiPolygon` geometriyasi yoki `null`. */
        geoJson: mahalla.geoJson,
        total: counts?.total ?? 0,
        byCategory: counts?.byCategory ?? {},
      };
    });
  }

  async mapPoints(scope: ScopeContext, query: ReportQuery) {
    const rows = await this.prisma.issue.findMany({
      where: {
        ...this.baseWhere(scope, query),
        lat: { not: null },
        lng: { not: null },
        ...(query.status ? { status: query.status } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 2000,
      select: {
        id: true,
        publicNo: true,
        title: true,
        lat: true,
        lng: true,
        status: true,
        source: true,
        createdAt: true,
        category: { select: { id: true, name: true, color: true, icon: true } },
      },
    });

    return rows;
  }

  // ───────────────────────────────────────────────────────────────

  /**
   * ⚠️ BITTA JOYDA YASALADI va hamma kesimda ishlatiladi — fayl
   * boshidagi izoh. Bu yerda qamrov ham, vaqt oynasi ham, panel
   * filtrlari ham birga.
   */
  /**
   * TUMANLAR KESIMI — XARITA UCHUN ("qaysi tumanda nima bo'lyapti").
   *
   * ⚠️ UCH OQIM BIR SO'ROVDA, LEKIN QO'SHILMAYDI: muammo, signal va
   * xavfsizlik hodisasi har biri ALOHIDA raqam bo'lib qaytadi.
   * Ularni bitta "muammolilik" soniga qo'shish doktrinani buzardi —
   * signal AI TAXMINI, muammo RASMIY FAKT, xavfsizlik hodisasi esa
   * QAT'IY QOIDA natijasi. Bitta songa aylantirilsa, xaritadagi
   * rang nimani bildirishini hech kim ayta olmasdi.
   *
   * ⚠️ HAR OQIM O'Z QAMROV FUNKSIYASI BILAN: muammo `Issue.mahallaId`
   * (MUHRLANGAN) bo'yicha, signal va xavfsizlik esa GURUH orqali
   * (jonli) — `scope.util.ts` dagi ayni ajratish. Bitta filtrni
   * hammasiga qo'llash signalni ham "muhrlangan" deb ko'rsatardi.
   *
   * ⚠️ ARXIVLANGAN TUMAN HAM QAYTADI (bayrog'i bilan): uning o'tgan
   * davrdagi murojaatlari tarixda qoladi va xaritadan yo'qolsa, jami
   * raqam tumanlar yig'indisiga teng kelmasdi.
   */
  async byDistrictMap(scope: ScopeContext, query: ReportQuery) {
    const issueWhere = this.baseWhere(scope, query);

    /*
     * ⚠️ SIGNAL/XAVFSIZLIK `categoryId` NI BILMAYDI — u faqat
     * muammoda bor. Kategoriya tanlanganda ularni AYNI filtr bilan
     * cheklab bo'lmaydi, cheklanmagan holda qoldirish esa
     * "kategoriya tanladim, lekin signal soni o'zgarmadi" degan
     * chalkashlik berardi. Shuning uchun ular NOL qaytadi va panel
     * buni foydalanuvchiga AYTADI (`categoryFiltered`).
     */
    const categoryFiltered = Boolean(query.categoryId);

    const period = {
      ...(query.from ? { gte: new Date(query.from) } : {}),
      ...(query.to
        ? {
            // ⚠️ KUN OXIRIGACHA (`security.service.ts` bilan ayni):
            // aks holda oxirgi kun tushib qolardi.
            lte: (() => {
              const end = new Date(query.to);
              end.setUTCHours(23, 59, 59, 999);
              return end;
            })(),
          }
        : {}),
    };
    const hasPeriod = Boolean(query.from || query.to);

    const groupFilter = query.mahallaId
      ? { group: { mahallaId: query.mahallaId } }
      : query.districtId
        ? { group: { mahalla: { districtId: query.districtId } } }
        : {};

    const signalWhere: Prisma.GroupSignalWhereInput = {
      ...signalScopeWhere(scope, { includeUnassigned: isProvinceWide(scope) }),
      ...(hasPeriod ? { createdAt: period } : {}),
      ...groupFilter,
    };

    const securityWhere: Prisma.SecurityEventWhereInput = {
      ...signalScopeWhere(scope, { includeUnassigned: true }),
      ...(hasPeriod ? { createdAt: period } : {}),
      ...groupFilter,
    };

    const now = new Date();

    const [
      districts,
      issuesByMahalla,
      overdueByMahalla,
      resolvedRows,
      signalRows,
      securityRows,
    ] = await Promise.all([
      this.prisma.district.findMany({
        orderBy: { sortOrder: "asc" },
        select: { id: true, code: true, name: true, isArchived: true },
      }),

      this.prisma.issue.groupBy({
        by: ["mahallaId", "status"],
        where: issueWhere,
        _count: { _all: true },
      }),

      this.prisma.issue.groupBy({
        by: ["mahallaId"],
        where: { ...issueWhere, dueAt: { lt: now }, status: { notIn: CLOSED } },
        _count: { _all: true },
      }),

      /*
       * ⚠️ O'RTACHA VAQT UCHUN XOM QATORLAR: Prisma `groupBy` ikki
       * ustun AYIRMASI bo'yicha o'rtacha hisoblay olmaydi
       * (`reviewedAt - createdAt`). To'plam yopilganlar bilan
       * cheklangani uchun kichik qoladi.
       */
      this.prisma.issue.findMany({
        where: { ...issueWhere, status: { in: CLOSED }, reviewedAt: { not: null } },
        select: { mahallaId: true, createdAt: true, reviewedAt: true },
      }),

      categoryFiltered
        ? Promise.resolve([])
        : this.prisma.groupSignal.findMany({
            where: signalWhere,
            select: {
              status: true,
              severity: true,
              group: { select: { mahalla: { select: { districtId: true } } } },
            },
          }),

      categoryFiltered
        ? Promise.resolve([])
        : this.prisma.securityEvent.findMany({
            where: securityWhere,
            select: {
              group: { select: { mahalla: { select: { districtId: true } } } },
            },
          }),
    ]);

    /* MFY → tuman: muammolar mahalla bo'yicha guruhlangan. */
    const mahallaIds = new Set<string>();
    for (const row of issuesByMahalla) if (row.mahallaId) mahallaIds.add(row.mahallaId);
    for (const row of overdueByMahalla) if (row.mahallaId) mahallaIds.add(row.mahallaId);
    for (const row of resolvedRows) if (row.mahallaId) mahallaIds.add(row.mahallaId);

    const mahallas = mahallaIds.size
      ? await this.prisma.mahalla.findMany({
          where: { id: { in: [...mahallaIds] } },
          select: { id: true, districtId: true },
        })
      : [];
    const districtOfMahalla = new Map(mahallas.map((m) => [m.id, m.districtId]));

    interface Bucket {
      issues: number;
      open: number;
      inProgress: number;
      resolved: number;
      rejected: number;
      overdue: number;
      signals: number;
      signalsNew: number;
      signalsHigh: number;
      security: number;
      resolutionMs: number;
      resolutionCount: number;
    }

    const empty = (): Bucket => ({
      issues: 0,
      open: 0,
      inProgress: 0,
      resolved: 0,
      rejected: 0,
      overdue: 0,
      signals: 0,
      signalsNew: 0,
      signalsHigh: 0,
      security: 0,
      resolutionMs: 0,
      resolutionCount: 0,
    });

    const buckets = new Map<string, Bucket>();
    for (const district of districts) buckets.set(district.id, empty());

    /*
     * ⚠️ HUDUDI YO'Q YOZUVLAR ALOHIDA JAMLANADI, TASHLANMAYDI:
     * ularning soni "MFY biriktirish ishi qoldi" degan signalning
     * o'zi (`byTerritory` dagi ayni qaror). Xaritada ular hech
     * qaysi tumanni bo'yamaydi, lekin raqam bo'lib ko'rinadi.
     */
    const unassigned = empty();
    const bucketFor = (districtId: string | null | undefined): Bucket =>
      districtId ? (buckets.get(districtId) ?? unassigned) : unassigned;

    for (const row of issuesByMahalla) {
      const bucket = bucketFor(
        row.mahallaId ? districtOfMahalla.get(row.mahallaId) : null,
      );
      const count = row._count._all;
      bucket.issues += count;
      if (row.status === IssueStatus.new) {
        bucket.open += count;
      } else if (row.status === IssueStatus.in_progress) {
        bucket.open += count;
        bucket.inProgress += count;
      } else if (row.status === IssueStatus.resolved) {
        bucket.resolved += count;
      } else if (row.status === IssueStatus.rejected) {
        bucket.rejected += count;
      }
    }

    for (const row of overdueByMahalla) {
      bucketFor(row.mahallaId ? districtOfMahalla.get(row.mahallaId) : null).overdue +=
        row._count._all;
    }

    for (const row of resolvedRows) {
      const bucket = bucketFor(
        row.mahallaId ? districtOfMahalla.get(row.mahallaId) : null,
      );
      bucket.resolutionMs += row.reviewedAt!.getTime() - row.createdAt.getTime();
      bucket.resolutionCount += 1;
    }

    for (const row of signalRows) {
      const bucket = bucketFor(row.group?.mahalla?.districtId ?? null);
      bucket.signals += 1;
      if (row.status === SignalStatus.new) bucket.signalsNew += 1;
      if (row.severity === SignalSeverity.high) bucket.signalsHigh += 1;
    }

    for (const row of securityRows) {
      bucketFor(row.group?.mahalla?.districtId ?? null).security += 1;
    }

    const toRow = (bucket: Bucket) => ({
      issues: bucket.issues,
      open: bucket.open,
      inProgress: bucket.inProgress,
      resolved: bucket.resolved,
      rejected: bucket.rejected,
      overdue: bucket.overdue,
      signals: bucket.signals,
      signalsNew: bucket.signalsNew,
      signalsHigh: bucket.signalsHigh,
      security: bucket.security,
      avgResolutionHours:
        bucket.resolutionCount > 0
          ? Math.round((bucket.resolutionMs / bucket.resolutionCount / 3_600_000) * 10) /
            10
          : null,
      resolutionRate:
        bucket.issues > 0
          ? Math.round((bucket.resolved / bucket.issues) * 1000) / 10
          : null,
    });

    return {
      /**
       * ⚠️ KATEGORIYA FILTRI SIGNAL/XAVFSIZLIKKA TEGMAYDI va panel
       * buni AYTISHI kerak — shuning uchun bayroq javobda.
       */
      categoryFiltered,
      districts: districts.map((district) => ({
        id: district.id,
        code: district.code,
        name: district.name,
        isArchived: district.isArchived,
        ...toRow(buckets.get(district.id)!),
      })),
      unassigned: toRow(unassigned),
    };
  }

  /**
   * ⚠️ EKSPORT UCHUN AYNI FILTR: yuklab olingan fayl EKRANDAGI
   * kesim bilan bir xil bo'lishi kerak. Nusxalansa, hisobotdagi son
   * bilan fayldagi son ajralib ketardi — va qaysi biri to'g'ri
   * ekanini bilib bo'lmasdi.
   */
  exportWhere(scope: ScopeContext, query: ReportQuery): Prisma.IssueWhereInput {
    return this.baseWhere(scope, query);
  }

  private baseWhere(scope: ScopeContext, query: ReportQuery): Prisma.IssueWhereInput {
    return {
      ...mahallaScopeWhere(scope, { includeUnassigned: isProvinceWide(scope) }),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
      ...(query.districtId ? { mahalla: { districtId: query.districtId } } : {}),
      ...(query.mahallaId ? { mahallaId: query.mahallaId } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    };
  }
}
