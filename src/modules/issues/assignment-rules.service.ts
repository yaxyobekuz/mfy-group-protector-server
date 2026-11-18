/**
 * IJROCHI QOIDASI — MFY × YO'NALISH → XODIM.
 *
 * ── MUAMMO ────────────────────────────────────────────────────────────
 *
 * Murojaat kelganda u NAVBATGA tushadi va kimdir uni ochib, ijrochi
 * tanlashi kerak. Amalda bu qadam KECHIKADI: MFY ko'p, yo'nalish ko'p
 * va "bu kimning ishi" degan savolga javob har safar qo'lda
 * izlanadi. SLA esa murojaat YARATILGAN paytdan hisoblanadi — ya'ni
 * kechikkan taqsimot muddatni yeb qo'yadi.
 *
 * ── YECHIM ────────────────────────────────────────────────────────────
 *
 * Javob aslida OLDINDAN MA'LUM: "Chilonzor 12-MFY dagi suv muammosi —
 * Aliyev". Shuning uchun u jadvalga yoziladi va murojaat yaratilishi
 * bilan ijrochi O'ZI qo'yiladi.
 *
 * ── NIMA UCHUN HOLAT `new` BO'LIB QOLADI ──────────────────────────────
 *
 * ⚠️ AVTOMATIK BIRIKTIRISH `in_progress` QILMAYDI, garchi QO'LDA
 * biriktirish shunday qilsa ham (`issues.service.ts#assign`). Farq
 * ma'noda: qo'lda biriktirishda ODAM murojaatni O'QIGAN va kimgadir
 * bergan — ya'ni ish boshlangan. Avtomatik biriktirishda esa uni hali
 * HECH KIM ko'rmagan. Holatni `in_progress` qilish "ish ketyapti"
 * degan YOLG'ON ko'rsatkich berardi va yangi murojaatlar ro'yxati
 * bo'sh bo'lib qolardi.
 *
 * ── NIMA UCHUN QOIDA JONLI O'QILMAYDI ─────────────────────────────────
 *
 * ⚠️ `Issue.assigneeId` — NUSXA. Qoida keyin o'zgartirilsa, ALLAQACHON
 * yaratilgan murojaatning ijrochisi O'ZGARMAYDI. Aks holda "o'tgan oy
 * kim ishlagan" degan savolga javob yo'qolardi (`Issue.mahallaId`
 * muhrlangani bilan AYNI sabab).
 */

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";

import { ScopeKind } from "@prisma/client";

import { AuditService } from "../../common/audit.service";
import {
  canTouchDistrict,
  districtScopeWhere,
  type ScopeContext,
} from "../../common/scope.util";
import { PrismaService } from "../../prisma/prisma.service";
import type {
  ListAssignmentRulesQuery,
  SaveAssignmentRuleDto,
} from "./dto/issues.dto";

/** Topilgan qoida — murojaat yaratishda ishlatiladigan qism. */
export interface ResolvedAssignment {
  userId: string;
  /** Qoidada ko'rsatilgan muddat (soat) — bo'lmasa yo'nalishniki. */
  slaHours: number | null;
}

@Injectable()
export class AssignmentRulesService {
  private readonly logger = new Logger(AssignmentRulesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * MFY va yo'nalish bo'yicha ijrochini topadi.
   *
   * ⚠️ `null` — QOIDA YO'Q va bu BUTUNLAY NORMAL holat: murojaat
   * avvalgidek navbatda qoladi. Avtomatik taqsimot — QULAYLIK, oqimning
   * sharti emas.
   *
   * ⚠️ MFY BO'LMASA QIDIRILMAYDI: botdan kelgan murojaatda hudud bo'sh
   * bo'lishi mumkin va o'shanda "qaysi MFY ning ijrochisi" degan savol
   * javobsiz. Taxmin qilib biriktirish murojaatni BEGONA xodimga
   * yuborardi.
   *
   * ⚠️ XODIM FAOLLIGI TEKSHIRILADI: arxivlangan xodim panelga kira
   * olmaydi va unga biriktirilgan murojaat hech kim ko'rmaydigan joyda
   * qolib ketardi (`issues.service.ts#assign` dagi ayni tekshiruv).
   */
  async resolve(
    mahallaId: string | null | undefined,
    categoryId: string,
  ): Promise<ResolvedAssignment | null> {
    if (!mahallaId) return null;

    try {
      const rule = await this.prisma.mahallaAssignee.findUnique({
        where: { mahallaId_categoryId: { mahallaId, categoryId } },
        select: {
          slaHours: true,
          isActive: true,
          user: { select: { id: true, isActive: true, isArchived: true } },
        },
      });

      if (!rule || !rule.isActive) return null;
      if (!rule.user.isActive || rule.user.isArchived) return null;

      return { userId: rule.user.id, slaHours: rule.slaHours };
    } catch (error) {
      /**
       * ⚠️ XATO YUTILADI: avtomatik taqsimot MUROJAATNI YO'QOTMASLIGI
       * kerak. Qoida o'qilmasa, murojaat ijrochisiz yaratiladi va
       * odam uni qo'lda biriktiradi — bu eski, ishlaydigan yo'l.
       */
      this.logger.warn(
        `Ijrochi qoidasi o'qilmadi (${mahallaId}/${categoryId}): ${(error as Error).message}`,
      );
      return null;
    }
  }

  /**
   * MUROJAAT YARATISHDA QO'YILADIGAN MAYDONLAR.
   *
   * ⚠️ MUDDAT SHU YERDA HISOBLANADI: qoidada o'z SLA'si bo'lsa, u
   * yo'nalishnikidan USTUN. Sabab amaliy — bir MFY da suv muammosi
   * 24 soatda, boshqasida 72 soatda hal bo'lishi mumkin.
   */
  async fieldsFor(
    mahallaId: string | null | undefined,
    categoryId: string,
    categorySlaHours: number,
  ): Promise<{ assigneeId: string; dueAt: Date } | null> {
    const rule = await this.resolve(mahallaId, categoryId);
    if (!rule) return null;

    const hours = rule.slaHours ?? categorySlaHours;

    return {
      assigneeId: rule.userId,
      dueAt: new Date(Date.now() + hours * 60 * 60 * 1000),
    };
  }

  // ═══════════════════════════════════════════════════════════════
  //  PANEL TOMONI — QOIDALARNI BOSHQARISH
  // ═══════════════════════════════════════════════════════════════

  /**
   * MFY LAR VA ULARGA QO'YILGAN QOIDALAR.
   *
   * ⚠️ RO'YXAT MFY DAN BOSHLANADI, QOIDADAN EMAS: panel "shu MFY da
   * qaysi yo'nalish KIMSIZ qolgan" degan savolga javob berishi kerak.
   * Faqat mavjud qoidalar ko'rsatilsa, BO'SH joylar ko'rinmay qolardi
   * — aynan ular esa muammo.
   *
   * ⚠️ QAMROV MAJBURIY: tuman xodimi boshqa tumanning taqsimotini
   * ko'rmasligi kerak (`districtScopeWhere`).
   */
  async list(scope: ScopeContext, query: ListAssignmentRulesQuery) {
    const where: Record<string, unknown> = {
      isArchived: false,
      ...districtScopeWhere(scope),
    };

    if (query.districtId) {
      /**
       * ⚠️ QAMROVDAN TASHQARI TUMAN SO'RALSA — RAD ETILADI, jim bo'sh
       * ro'yxat qaytarilmaydi: "ma'lumot yo'q" va "ruxsat yo'q" — ikki
       * boshqa javob va ularni aralashtirish xatoni yashirardi.
       */
      if (!canTouchDistrict(scope, query.districtId)) {
        throw new ForbiddenException("Bu tuman sizning qamrovingizda emas");
      }
      where.districtId = query.districtId;
    }

    if (query.mahallaId) where.id = query.mahallaId;

    const mahallas = await this.prisma.mahalla.findMany({
      where,
      orderBy: [{ districtId: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        district: { select: { id: true, name: true } },
        assignees: {
          where: { isActive: true },
          select: {
            id: true,
            categoryId: true,
            slaHours: true,
            category: { select: { id: true, name: true, icon: true, slaHours: true } },
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                isActive: true,
                isArchived: true,
              },
            },
          },
        },
      },
    });

    return mahallas.map((mahalla) => ({
      id: mahalla.id,
      name: mahalla.name,
      district: mahalla.district,
      rules: mahalla.assignees.map((rule) => ({
        id: rule.id,
        categoryId: rule.categoryId,
        category: rule.category,
        slaHours: rule.slaHours,
        user: rule.user,
        /**
         * ⚠️ "XODIM ARXIVLANGAN" HOLATI KO'RSATILADI: qoida bazada
         * turibdi, lekin ishlamaydi (`resolve` uni o'tkazmaydi).
         * Yashirilsa, ma'muriyat "ijrochi belgilangan" deb o'ylab
         * yuraverardi.
         */
        isBroken: !rule.user.isActive || rule.user.isArchived,
      })),
    }));
  }

  /**
   * QOIDANI QO'YADI YOKI O'ZGARTIRADI.
   *
   * ⚠️ `upsert`: bitta (MFY, yo'nalish) juftligiga BITTA ijrochi
   * (`@@unique`). Ikkitasi bo'lsa "qaysi biri" degan savol har
   * murojaatda TASODIFIY hal bo'lardi.
   *
   * ⚠️ MAVJUD MUROJAATLARGA TEGMAYDI: qoida KELAJAK uchun. O'tgan
   * murojaatlarni qayta taqsimlash "kim ishlagan" tarixini
   * o'chirardi.
   */
  async save(dto: SaveAssignmentRuleDto, scope: ScopeContext) {
    const mahalla = await this.prisma.mahalla.findUnique({
      where: { id: dto.mahallaId },
      select: { id: true, districtId: true, name: true },
    });
    if (!mahalla) throw new NotFoundException("MFY topilmadi");

    if (!canTouchDistrict(scope, mahalla.districtId)) {
      throw new ForbiddenException("Bu MFY sizning qamrovingizda emas");
    }

    const category = await this.prisma.issueCategory.findUnique({
      where: { id: dto.categoryId },
      select: { id: true, isActive: true, name: true },
    });
    if (!category) throw new NotFoundException("Yo'nalish topilmadi");
    if (!category.isActive) throw new BadRequestException("Yo'nalish faol emas");

    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
      select: {
        id: true,
        isActive: true,
        isArchived: true,
        districtId: true,
        scopeKind: true,
        role: true,
        firstName: true,
        lastName: true,
      },
    });
    if (!user) throw new NotFoundException("Xodim topilmadi");

    // ⚠️ ARXIVLANGAN XODIMGA QOIDA QO'YILMAYDI (`assign` bilan ayni
    // sabab): u panelga kira olmaydi va murojaat hech kim
    // ko'rmaydigan joyda qolib ketardi.
    if (!user.isActive || user.isArchived) {
      throw new BadRequestException("Bu xodim faol emas");
    }

    /**
     * ⚠️ XODIM O'SHA TUMANNI KO'RA OLADIMI — TEKSHIRILADI. Boshqa
     * tuman xodimiga biriktirilgan murojaat uning ro'yxatida
     * KO'RINMAYDI (`mahallaScopeWhere`): ya'ni ijrochi qo'yilgan,
     * lekin uni hech kim ochmaydi — eng yomon holat, chunki panelda
     * hammasi joyidek ko'rinadi.
     */
    const userSeesDistrict =
      user.role === "owner" ||
      user.scopeKind === ScopeKind.province ||
      user.districtId === mahalla.districtId;

    if (!userSeesDistrict) {
      throw new BadRequestException(
        "Bu xodimning qamrovi boshqa tuman — unga biriktirilgan murojaat ro'yxatida ko'rinmaydi",
      );
    }

    const rule = await this.prisma.mahallaAssignee.upsert({
      where: {
        mahallaId_categoryId: {
          mahallaId: dto.mahallaId,
          categoryId: dto.categoryId,
        },
      },
      create: {
        mahallaId: dto.mahallaId,
        categoryId: dto.categoryId,
        userId: dto.userId,
        slaHours: dto.slaHours ?? null,
        createdBy: scope.userId,
      },
      update: {
        userId: dto.userId,
        slaHours: dto.slaHours ?? null,
        isActive: true,
      },
      select: { id: true, userId: true, slaHours: true },
    });

    await this.audit.record({
      userId: scope.userId,
      action: "issue.assignment-rule.save",
      entity: "MahallaAssignee",
      entityId: rule.id,
      meta: {
        mahalla: mahalla.name,
        category: category.name,
        user: `${user.firstName} ${user.lastName}`.trim(),
        slaHours: dto.slaHours ?? null,
      },
    });

    return rule;
  }

  /**
   * QOIDANI OLIB TASHLAYDI.
   *
   * ⚠️ HAQIQIY O'CHIRISH, `isActive: false` EMAS: qoida — SOZLAMA,
   * dalil emas. "Kim qachon qo'ygan, kim olib tashlagan" savoliga
   * javob `AuditLog` da qoladi.
   */
  async remove(id: string, scope: ScopeContext) {
    const rule = await this.prisma.mahallaAssignee.findUnique({
      where: { id },
      select: {
        id: true,
        mahalla: { select: { districtId: true, name: true } },
        category: { select: { name: true } },
      },
    });
    if (!rule) throw new NotFoundException("Qoida topilmadi");

    if (!canTouchDistrict(scope, rule.mahalla.districtId)) {
      throw new ForbiddenException("Bu MFY sizning qamrovingizda emas");
    }

    await this.prisma.mahallaAssignee.delete({ where: { id } });

    await this.audit.record({
      userId: scope.userId,
      action: "issue.assignment-rule.remove",
      entity: "MahallaAssignee",
      entityId: id,
      meta: { mahalla: rule.mahalla.name, category: rule.category.name },
    });

    return { ok: true };
  }
}
