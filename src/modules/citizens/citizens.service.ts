/**
 * FUQAROLAR — panel tomoni.
 *
 * ⚠️ FUQARO — XODIM EMAS: bu yerda parol, ruxsat, qamrov yo'q. Panel
 * faqat ro'yxatni ko'radi va kerak bo'lsa BLOKLAYDI (sabab bilan).
 *
 * ⚠️ BLOK — QATTIQ CHORA (`citizens.manage`). U fuqaroni butunlay
 * yopadi va shuning uchun operatorга berilmaydi (`security.guard` bilan
 * ayni sabab).
 */

import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { IssueStatus, type Prisma } from "@prisma/client";

import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../common/audit.service";
import { activeCitizenWhere } from "../../common/citizen-deleted";
import { paginate } from "../../common/dto/pagination.dto";
import { districtScopeWhere, type ScopeContext } from "../../common/scope.util";
import type {
  BlockCitizenDto,
  ListCitizensQuery,
  RatingQuery,
} from "./dto/citizens.dto";


@Injectable()
export class CitizensService {
  private readonly logger = new Logger(CitizensService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListCitizensQuery) {
    const where: Prisma.CitizenWhereInput = {
      ...(query.districtId ? { districtId: query.districtId } : {}),
      ...(query.blocked !== undefined ? { isBlocked: query.blocked } : {}),
      ...(query.search
        ? {
            OR: [
              { firstName: { contains: query.search, mode: "insensitive" } },
              { lastName: { contains: query.search, mode: "insensitive" } },
              { username: { contains: query.search, mode: "insensitive" } },
              { phone: { contains: query.search } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.citizen.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: query.skip,
        take: query.limit,
        include: {
          district: { select: { name: true } },
          _count: { select: { issues: true } },
        },
      }),
      this.prisma.citizen.count({ where }),
    ]);

    return paginate(
      items.map((c) => ({
        id: c.id,
        telegramId: c.telegramId,
        name: [c.firstName, c.lastName].filter(Boolean).join(" "),
        username: c.username,
        phone: c.phone,
        photoUrl: c.photoUrl,
        districtName: c.district?.name ?? null,
        points: c.points,
        appeals: c._count.issues,
        isBlocked: c.isBlocked,
        blockReason: c.blockReason,
        // ⚠️ PANELDA "O'CHIRILGAN" DEB KO'RINADI: qator qoladi
        // (murojaatlari hisobotda kerak), lekin xodim uning ortida
        // ODAM YO'Q ekanini bilishi kerak — aks holda "nega bu
        // fuqaroga javob bormayapti" degan savol tug'ilardi.
        isDeleted: c.deletedAt !== null,
        deletedAt: c.deletedAt,
        createdAt: c.createdAt,
      })),
      total,
      query,
    );
  }

  async findOne(id: string) {
    const citizen = await this.prisma.citizen.findUnique({
      where: { id },
      include: {
        district: { select: { name: true } },
        mahalla: { select: { name: true } },
      },
    });
    if (!citizen) throw new NotFoundException("Fuqaro topilmadi");

    const [total, open, resolved] = await Promise.all([
      this.prisma.issue.count({ where: { citizenId: id } }),
      this.prisma.issue.count({
        where: { citizenId: id, status: { in: [IssueStatus.new, IssueStatus.in_progress] } },
      }),
      this.prisma.issue.count({ where: { citizenId: id, status: IssueStatus.resolved } }),
    ]);

    return {
      id: citizen.id,
      telegramId: citizen.telegramId,
      name: [citizen.firstName, citizen.lastName].filter(Boolean).join(" "),
      username: citizen.username,
      phone: citizen.phone,
      photoUrl: citizen.photoUrl,
      languageCode: citizen.languageCode,
      districtName: citizen.district?.name ?? null,
      mahallaName: citizen.mahalla?.name ?? null,
      points: citizen.points,
      isBlocked: citizen.isBlocked,
      blockReason: citizen.blockReason,
      // ⚠️ O'CHIRILGAN HISOB — ro'yxat bilan ayni belgi (yuqoridagi
      // izoh). Murojaatlari KO'RINADI, muallifi esa anonim.
      isDeleted: citizen.deletedAt !== null,
      deletedAt: citizen.deletedAt,
      createdAt: citizen.createdAt,
      stats: { total, open, resolved },
    };
  }

  /**
   * FAOL FUQAROLAR REYTINGI (panel).
   *
   * ⚠️ BALL "KIM KO'P YOZGAN" EMAS: yuborilganiga
   * `POINTS.APPEAL_CREATED`, hal qilinganiga qo'shimcha
   * `POINTS.APPEAL_RESOLVED` (`common/points.ts` — YAGONA MANBA).
   * Shuning uchun bu yerda ball QAYTA HISOBLANMAYDI, faqat
   * `Citizen.points` o'qiladi: ikkinchi formula qo'yilsa, ikkisi
   * ajralib ketib, ilovada va panelda BOSHQA-BOSHQA o'rin
   * ko'rsatilardi.
   *
   * ⚠️ ILOVADAGI REYTING BILAN AYNI RO'YXAT, lekin BOSHQA
   * ENDPOINT: u fuqaro tokeni bilan ishlaydi (`/mobile/rating`) va
   * qamrovni BILMAYDI. Bu yerda esa xodimning hududiy qamrovi
   * QO'LLANADI — tuman xodimi butun viloyat ro'yxatini ko'rmaydi.
   *
   * ⚠️ BLOKLANGAN FUQARO RO'YXATDA YO'Q: reyting — RAG'BAT ro'yxati
   * va bloklangan odam unda turishi "chora ko'rilgan" degan
   * ma'lumotga zid bo'lardi.
   */
  async rating(query: RatingQuery, scope: ScopeContext) {
    /*
     * ⚠️ QAMROV VA FILTR BIRGA ISHLAYDI (AND), biri ikkinchisining
     * o'rnini BOSMAYDI: tuman xodimi so'rovga boshqa tumanning
     * `districtId` sini qo'lda yozsa, qamrov shartidan o'tolmay
     * bo'sh ro'yxat oladi.
     */
    const where: Prisma.CitizenWhereInput = {
      points: { gt: 0 },
      isBlocked: false,
      // ⚠️ O'CHIRILGAN HISOB REYTINGDA YO'Q — ilovadagi reyting bilan
      // AYNI qoida (`mobile.service.ts#rating`). Ikkisi ajralsa,
      // panelda va ilovada BOSHQA-BOSHQA o'rin ko'rsatilardi.
      ...activeCitizenWhere,
      ...districtScopeWhere(scope),
      ...(query.districtId ? { districtId: query.districtId } : {}),
    };

    const rows = await this.prisma.citizen.findMany({
      where,
      // ⚠️ IKKINCHI TARTIB (`createdAt`) MAJBURIY: ball teng
      // bo'lganda Postgres tartibni kafolatlamaydi va har
      // yangilashda o'rinlar sababsiz ALMASHIB turardi.
      orderBy: [{ points: "desc" }, { createdAt: "asc" }],
      take: query.limit,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        username: true,
        photoUrl: true,
        points: true,
        createdAt: true,
        district: { select: { name: true } },
        _count: { select: { issues: true } },
      },
    });

    /*
     * ⚠️ JAMI — RO'YXATDAN EMAS, BAZADAN: ro'yxat TOP-50 bilan
     * cheklangan va uning yig'indisi "viloyatda nechta faol
     * fuqaro bor" degan savolga NOTO'G'RI javob berardi.
     */
    const [totalActive, aggregate] = await Promise.all([
      this.prisma.citizen.count({ where }),
      this.prisma.citizen.aggregate({ where, _sum: { points: true } }),
    ]);

    return {
      items: rows.map((c, index) => ({
        rank: index + 1,
        id: c.id,
        name: [c.firstName, c.lastName].filter(Boolean).join(" "),
        username: c.username,
        photoUrl: c.photoUrl,
        points: c.points,
        appeals: c._count.issues,
        districtName: c.district?.name ?? null,
        createdAt: c.createdAt,
      })),
      totalActive,
      totalPoints: aggregate._sum.points ?? 0,
    };
  }

  async setBlocked(id: string, dto: BlockCitizenDto, userId: string) {
    const citizen = await this.prisma.citizen.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!citizen) throw new NotFoundException("Fuqaro topilmadi");

    // ⚠️ BLOKLASHDA SABAB MAJBURIY (DTO ixtiyoriy — bu yerda
    // majburlanadi): fuqaroga ilovada shu sabab ko'rinadi.
    if (dto.blocked && !dto.reason?.trim()) {
      throw new BadRequestException("Bloklash uchun sabab ko'rsating");
    }

    await this.prisma.citizen.update({
      where: { id },
      data: {
        isBlocked: dto.blocked,
        blockReason: dto.blocked ? dto.reason!.trim() : null,
      },
    });

    await this.audit.record({
      userId,
      action: dto.blocked ? "citizen.block" : "citizen.unblock",
      entity: "Citizen",
      entityId: id,
      meta: dto.blocked ? { reason: dto.reason } : undefined,
    });

    return { ok: true };
  }

  /**
   * ⚠️ TARQATMA BU YERDAN OLIB TASHLANDI — `modules/broadcasts/`.
   *
   * Sabab: u faqat fuqarolarga va faqat matn yubora olardi. Tuman/MFY
   * kesimi, MFY guruhlari va botdan uzatilgan xabar qo'shilgach, u
   * "fuqarolar bo'limi"ning ishi bo'lmay qoldi — va Telegram'ga
   * yuborish kodining UCHINCHI nusxasi paydo bo'lardi
   * (`common/telegram.ts` endi yagona manba).
   */

  /** `parse_mode: HTML` uchun — `issue-notify.service.ts` bilan ayni. */
  private escapeHtml(value: string): string {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
}
