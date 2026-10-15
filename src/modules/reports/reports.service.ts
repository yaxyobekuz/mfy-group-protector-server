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
  isProvinceWide,
  mahallaScopeWhere,
  signalScopeWhere,
  type ScopeContext,
} from "../../common/scope.util";
import { tashkentDayStart } from "../../common/date.util";
import { IssueStatus, type Prisma } from "@prisma/client";
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

    const sourceCounts: Record<string, number> = { signal: 0, bot: 0, manual: 0 };
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

    return {
      mahallas: items,
      districts: [...districtMap.values()].sort((a, b) => b.count - a.count),
    };
  }

  /** KATEGORIYA KESIMI — nima haqida ko'proq yozyapti. */
  async byCategory(scope: ScopeContext, query: ReportQuery) {
    const where = this.baseWhere(scope, query);

    const rows = await this.prisma.issue.groupBy({
      by: ["categoryId"],
      where,
      _count: { _all: true },
    });

    const categories = await this.prisma.issueCategory.findMany({
      where: { id: { in: rows.map((row) => row.categoryId) } },
      select: { id: true, name: true, color: true },
    });
    const byId = new Map(categories.map((category) => [category.id, category]));

    return rows
      .map((row) => ({
        categoryId: row.categoryId,
        name: byId.get(row.categoryId)?.name ?? "—",
        color: byId.get(row.categoryId)?.color ?? null,
        count: row._count._all,
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

    const [byStatus, byKind, bySeverity] = await Promise.all([
      this.prisma.groupSignal.groupBy({ by: ["status"], where, _count: { _all: true } }),
      this.prisma.groupSignal.groupBy({ by: ["kind"], where, _count: { _all: true } }),
      this.prisma.groupSignal.groupBy({ by: ["severity"], where, _count: { _all: true } }),
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
      attachRate:
        reviewed > 0 ? Math.round((status.attached! / reviewed) * 1000) / 10 : null,
    };
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

    for (let offset = 0; offset < days; offset += 1) {
      const day = tashkentDayStart(-(days - 1 - offset));
      const key = day.toISOString().slice(0, 10);
      buckets.set(key, { date: key, total: 0, resolved: 0 });
    }

    for (const issue of issues) {
      // Toshkent kuni: +5 soat qo'shib, ISO sanasini olamiz.
      const key = new Date(issue.createdAt.getTime() + 5 * 3_600_000)
        .toISOString()
        .slice(0, 10);
      const bucket = buckets.get(key);
      if (!bucket) continue;

      bucket.total += 1;
      if (issue.status === IssueStatus.resolved) bucket.resolved += 1;
    }

    return [...buckets.values()];
  }

  // ───────────────────────────────────────────────────────────────

  /**
   * ⚠️ BITTA JOYDA YASALADI va hamma kesimda ishlatiladi — fayl
   * boshidagi izoh. Bu yerda qamrov ham, vaqt oynasi ham, panel
   * filtrlari ham birga.
   */
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
