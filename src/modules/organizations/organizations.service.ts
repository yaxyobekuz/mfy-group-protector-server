/**
 * TASHKILOTLAR — REYESTR, HISOB VA YO'NALTIRISH QOIDASI.
 *
 * ⚠️ TASHKILOT XODIMI — `User`, UCHINCHI JADVAL EMAS. `Citizen` va
 * `User` ajratilgan sabab ("`permissions` butun aholiga tarqalardi")
 * bu yerga tegishli emas: tashkilot xodimi PANELGA KIRADI, ya'ni
 * unga login, parol, sessiya va ruxsat ro'yxati KERAK. Uchinchi
 * jadval uchinchi sir, uchinchi guard va uchinchi sessiya jadvalini
 * talab qilardi — barchasi ayni ishni qilib.
 *
 * ⚠️ HISOB TASHKILOT BILAN BIRGA YARATILADI, "Xodimlar" sahifasida
 * EMAS: `organizationId` siz `org` qamrovli xodim HECH NARSA
 * ko'rmaydi (`issueScopeWhere`) va u jimgina ishlamas hisob bo'lib
 * qolardi (`users.service.ts#assertScopeFields` dagi taqiq).
 */

import { randomBytes } from "node:crypto";

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ScopeKind } from "@prisma/client";

import { AuditService } from "../../common/audit.service";
import { normalizePhone } from "../../common/phone";
import { ROLE_DEFAULT_PERMISSIONS } from "../../common/permissions";
import {
  canTouchDistrict,
  isProvinceWide,
  type ScopeContext,
} from "../../common/scope.util";
import { PrismaService } from "../../prisma/prisma.service";
import { AuthService } from "../auth/auth.service";
import type {
  ArchiveOrganizationDto,
  CreateOrgLoginDto,
  CreateOrganizationDto,
  ListOrgRoutesQuery,
  ListOrganizationsQuery,
  SaveOrgRouteDto,
  UpdateOrganizationDto,
} from "./dto/organizations.dto";

/**
 * ⚠️ ADASHTIRILMAYDIGAN ALIFBO: `0`/`O` va `1`/`l`/`I` CHIQARILGAN.
 * Parol va ulanish kodi QOG'OZDA beriladi va qo'lda ko'chiriladi —
 * "nol bo'ldi, harf O bo'ldi" degan savol har tashkilotda qayta
 * paydo bo'lardi va yordam so'rovlariga aylanardi.
 */
const SAFE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const randomFrom = (length: number): string => {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += SAFE_ALPHABET[bytes[i]! % SAFE_ALPHABET.length];
  }
  return out;
};

/**
 * ⚠️ 12 BELGI: qog'ozdan ko'chirish uchun uzun, lekin `SAFE_ALPHABET`
 * (32 belgi) bilan ~60 bit entropiya beradi. Qisqasi (8 belgi) tayyor
 * parollar ro'yxati uchun yetarli emas edi, uzunrog'i (20) esa qo'lda
 * kiritishni jazoga aylantirardi.
 */
const PASSWORD_LENGTH = 12;

/** Ulanish kodi — botga bir marta yoziladi, qisqa bo'lishi kerak. */
const LINK_CODE_LENGTH = 6;

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ═══════════════════════════════════════════════════════════════
  //  REYESTR
  // ═══════════════════════════════════════════════════════════════

  /**
   * ⚠️ QAMROV MAJBURIY, LEKIN VILOYAT TASHKILOTLARI HAMMAGA
   * KO'RINADI: tuman xodimi "Andijon viloyat gaz ta'minoti" ni
   * ko'rmasa, o'z tumanining gaz murojaati qayerga ketganini
   * tushuntirib bera olmasdi — panelda esa murojaat "yo'naltirilgan"
   * bo'lib turardi.
   *
   * ⚠️ BU QAMROVNI KENGAYTIRISH EMAS: viloyat tashkiloti hech
   * qaysi tumanga tegishli emas, ya'ni uni ko'rsatish begona
   * hududga kirish ham emas (`canTouchUnassigned` dagi ayni
   * mantiq).
   */
  async list(scope: ScopeContext, query: ListOrganizationsQuery) {
    /**
     * ⚠️ QAMROVI TUMAN, LEKIN TUMANI KO'RSATILMAGAN XODIM HECH NARSA
     * KO'RMAYDI — `districtScopeWhere` dagi `impossible` filtri bilan
     * AYNI qaror ("ochib qo'yishdan xavfsizroq"). Zaxira `OR` ga
     * to'g'ridan-to'g'ri qo'shilsa, bunday xodim viloyat
     * tashkilotlarini KO'RARDI — holbuki uning ma'lumoti to'liq
     * emasligi aniq va o'shanda hech narsa ko'rsatmaslik to'g'ri.
     */
    const districtWhere = isProvinceWide(scope)
      ? {}
      : scope.districtId
        ? { districtId: scope.districtId }
        : null;

    const where = {
      ...(query.includeArchived ? {} : { isArchived: false }),
      ...(districtWhere === null
        ? { id: { in: [] as string[] } }
        : Object.keys(districtWhere).length > 0
          ? /**
             * ⚠️ VILOYAT TASHKILOTLARI TUMAN XODIMIGA HAM
             * KO'RINADI: u "mening tumanimning gaz murojaati
             * qayerga ketdi" degan savolga javob olishi kerak va
             * javob ko'pincha aynan viloyat tashkiloti bo'ladi.
             * Bu qamrovni kengaytirish emas — viloyat tashkiloti
             * hech qaysi tumanga tegishli emas
             * (`canTouchUnassigned` dagi ayni mantiq).
             */
            { OR: [districtWhere, { districtId: null }] }
          : {}),
      ...(query.districtId ? { districtId: query.districtId } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: "insensitive" as const } },
              { shortName: { contains: query.search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const rows = await this.prisma.organization.findMany({
      where,
      orderBy: [{ isArchived: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        shortName: true,
        phone: true,
        address: true,
        isActive: true,
        isArchived: true,
        createdAt: true,
        district: { select: { id: true, name: true } },
        /**
         * ⚠️ MANZIL BOR-YO'QLIGI KO'RSATILADI, QIYMATI EMAS: chat id
         * panelda hech kimga kerak emas va uni ko'rsatish begona
         * odamga "shu chatga yozsa bo'ladi" degan ma'lumot
         * berardi.
         */
        telegramChatId: true,
        linkCode: true,
        _count: {
          select: {
            routes: { where: { isActive: true } },
            users: { where: { isArchived: false } },
            issues: true,
          },
        },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      shortName: row.shortName,
      phone: row.phone,
      address: row.address,
      district: row.district,
      isActive: row.isActive,
      isArchived: row.isArchived,
      createdAt: row.createdAt,
      /** ⚠️ `true`/`false`, chat id EMAS (yuqoridagi izoh). */
      hasTelegram: row.telegramChatId !== null,
      /**
       * ⚠️ KUTAYOTGAN KOD KO'RSATILADI: admin uni tashkilotga
       * aytishi kerak va u bir martalik — qayta so'ralsa, eskisi
       * bekor bo'ladi.
       */
      pendingLinkCode: row.linkCode,
      routeCount: row._count.routes,
      userCount: row._count.users,
      issueCount: row._count.issues,
    }));
  }

  async create(dto: CreateOrganizationDto, scope: ScopeContext) {
    const districtId = await this.assertDistrict(dto.districtId ?? null, scope);

    const name = dto.name.trim();

    const existing = await this.prisma.organization.findUnique({ where: { name } });
    if (existing) throw new ConflictException("Bu nomli tashkilot allaqachon mavjud");

    const org = await this.prisma.organization.create({
      data: {
        name,
        shortName: dto.shortName?.trim() || null,
        districtId,
        // ⚠️ `normalizePhone` — YAGONA MANBA (`common/phone.ts`): bir
        // odam raqamini besh xil yozadi va normallashtirilmasa
        // bazada bir tashkilotning raqami ikki xil satr bo'lardi.
        phone: normalizePhone(dto.phone),
        address: dto.address?.trim() || null,
      },
      select: { id: true, name: true },
    });

    await this.audit.record({
      userId: scope.userId,
      action: "organization.create",
      entity: "Organization",
      entityId: org.id,
      meta: { name: org.name, districtId },
    });

    return org;
  }

  async update(id: string, dto: UpdateOrganizationDto, scope: ScopeContext) {
    const org = await this.loadForWrite(id, scope);

    const districtId =
      dto.districtId !== undefined
        ? await this.assertDistrict(dto.districtId || null, scope)
        : undefined;

    const updated = await this.prisma.organization.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.shortName !== undefined ? { shortName: dto.shortName?.trim() || null } : {}),
        ...(districtId !== undefined ? { districtId } : {}),
        ...(dto.phone !== undefined ? { phone: normalizePhone(dto.phone) } : {}),
        ...(dto.address !== undefined ? { address: dto.address?.trim() || null } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
      select: { id: true, name: true, isActive: true },
    });

    await this.audit.record({
      userId: scope.userId,
      action: "organization.update",
      entity: "Organization",
      entityId: id,
      meta: { before: org.name, after: updated.name },
    });

    return updated;
  }

  /**
   * ⚠️ ARXIVLANADI, O'CHIRILMAYDI: unga yo'naltirilgan murojaatlar
   * tarixi qoladi (`Issue.organizationId` — muhrlangan nusxa).
   * O'chirilsa, "o'tgan oy qaysi tashkilot nechta murojaat olgan"
   * degan hisobot buzilardi.
   *
   * ⚠️ XODIMLARI HAM ARXIVLANADI: arxivlangan tashkilotning hisobi
   * panelga kirib turishi mumkin bo'lmasligi kerak — u yangi
   * murojaat olmaydi, lekin eskilarini ko'rib, javob yozib
   * yuraverardi.
   */
  async archive(id: string, dto: ArchiveOrganizationDto, scope: ScopeContext) {
    await this.loadForWrite(id, scope);

    await this.prisma.$transaction([
      this.prisma.organization.update({
        where: { id },
        data: {
          isArchived: dto.archived,
          archivedAt: dto.archived ? new Date() : null,
        },
      }),
      this.prisma.user.updateMany({
        where: { organizationId: id },
        data: {
          isArchived: dto.archived,
          archivedAt: dto.archived ? new Date() : null,
        },
      }),
    ]);

    await this.audit.record({
      userId: scope.userId,
      action: dto.archived ? "organization.archive" : "organization.restore",
      entity: "Organization",
      entityId: id,
    });

    return { ok: true };
  }

  // ═══════════════════════════════════════════════════════════════
  //  YO'NALTIRISH QOIDASI
  // ═══════════════════════════════════════════════════════════════

  /**
   * QOIDALAR RO'YXATI.
   *
   * ⚠️ YO'NALISHLARDAN BOSHLANADI, QOIDALARDAN EMAS
   * (`AssignmentRulesService.list` dagi ayni qaror): panel "qaysi
   * yo'nalish TASHKILOTSIZ qolgan" degan savolga javob berishi
   * kerak. Faqat mavjud qoidalar ko'rsatilsa, BO'SH joylar
   * ko'rinmay qolardi — aynan ular esa muammo.
   *
   * ⚠️ FAQAT ENG ANIQ YO'NALISHLAR: ichida kichik yo'nalishlari bor
   * yo'nalishga murojaat YOZILMAYDI (`mobile.service.ts#create`
   * rad etadi), ya'ni unga qoida qo'yish ham ma'nosiz va u panelda
   * "tashkilotsiz" bo'lib turib, hech qachon tuzalmaydigan
   * bo'shliqqa o'xshardi.
   */
  async listRoutes(scope: ScopeContext, query: ListOrgRoutesQuery) {
    if (query.districtId && !canTouchDistrict(scope, query.districtId)) {
      throw new ForbiddenException("Bu tuman sizning qamrovingizda emas");
    }

    const categories = await this.prisma.issueCategory.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        icon: true,
        orgName: true,
        parent: { select: { id: true, name: true } },
        _count: { select: { children: true } },
      },
    });

    const leaves = categories.filter((category) => category._count.children === 0);

    const routes = await this.prisma.organizationRoute.findMany({
      where: {
        isActive: true,
        ...(query.organizationId ? { organizationId: query.organizationId } : {}),
        /**
         * ⚠️ TUMAN FILTRIDA VILOYAT ZAXIRASI HAM QOLADI: xodim
         * "mening tumanimda suv murojaati qayerga ketadi" degan
         * savolga javob olishi kerak va javob ko'pincha aynan
         * zaxira qoidasi bo'ladi. Faqat tumanga qo'yilgan qoidalar
         * ko'rsatilsa, jadval bo'sh ko'rinib, "hech qayerga
         * ketmaydi" degan noto'g'ri xulosa chiqardi.
         */
        ...(query.districtId
          ? { OR: [{ districtId: query.districtId }, { districtId: null }] }
          : {}),
      },
      select: {
        id: true,
        categoryId: true,
        districtId: true,
        createdAt: true,
        district: { select: { id: true, name: true } },
        organization: {
          select: { id: true, name: true, shortName: true, isActive: true, isArchived: true },
        },
      },
    });

    return {
      categories: leaves.map((category) => ({
        id: category.id,
        name: category.name,
        icon: category.icon,
        parent: category.parent,
        /** ⚠️ Qoida yo'q bo'lsa ilova shu matnni ko'rsatadi (zaxira). */
        orgName: category.orgName,
      })),
      routes: routes.map((route) => ({
        id: route.id,
        categoryId: route.categoryId,
        districtId: route.districtId,
        district: route.district,
        organization: route.organization,
        /**
         * ⚠️ "TASHKILOT FAOL EMAS" KO'RSATILADI: qoida bazada
         * turibdi, lekin ishlamaydi (`OrgRoutingService.resolve`
         * uni o'tkazmaydi). Yashirilsa, ma'muriyat "yo'naltirish
         * belgilangan" deb o'ylab yuraverardi
         * (`MahallaAssignee.isBroken` bilan ayni sabab).
         */
        isBroken: !route.organization.isActive || route.organization.isArchived,
      })),
    };
  }

  /**
   * QOIDANI QO'YADI YOKI O'ZGARTIRADI.
   *
   * ⚠️ `upsert` ISHLATILMAYDI va bu sxemadagi tuzoq bilan bog'liq:
   * `@@unique([categoryId, districtId])` viloyat zaxirasini
   * (`districtId: null`) himoya qilmaydi — PostgreSQL `UNIQUE` da
   * `NULL` lar teng emas, ya'ni `upsert` ning `where` i uni hech
   * qachon TOPMASDI va har saqlashda YANGI qator yaratardi.
   * Shuning uchun avval `findFirst`, keyin `update` yoki `create`.
   */
  async saveRoute(dto: SaveOrgRouteDto, scope: ScopeContext) {
    const districtId = dto.districtId || null;

    /**
     * ⚠️ VILOYAT ZAXIRASINI FAQAT VILOYAT QAMROVLI XODIM QO'YADI:
     * tuman operatori qo'ysa, u BARCHA tumanlarning murojaatlarini
     * o'z tanlagan tashkilotiga burib yuborardi.
     */
    if (districtId === null && !isProvinceWide(scope)) {
      throw new ForbiddenException(
        "Viloyat bo'ylab zaxira qoidasini faqat viloyat qamrovli xodim qo'yadi",
      );
    }

    if (districtId !== null && !canTouchDistrict(scope, districtId)) {
      throw new ForbiddenException("Bu tuman sizning qamrovingizda emas");
    }

    const category = await this.prisma.issueCategory.findUnique({
      where: { id: dto.categoryId },
      select: { id: true, name: true, isActive: true, _count: { select: { children: true } } },
    });
    if (!category) throw new NotFoundException("Yo'nalish topilmadi");
    if (!category.isActive) throw new BadRequestException("Yo'nalish faol emas");

    /**
     * ⚠️ ICHIDA KICHIK YO'NALISHLARI BOR YO'NALISHGA QOIDA
     * QO'YILMAYDI: unga murojaat umuman yozilmaydi
     * (`mobile.service.ts#create` rad etadi), ya'ni qoida hech
     * qachon ishlamasdi — panelda esa "yo'naltirish qo'yilgan"
     * bo'lib turardi.
     */
    if (category._count.children > 0) {
      throw new BadRequestException(
        "Bu yo'nalish ichida kichik yo'nalishlar bor — qoida ularning har biriga qo'yiladi",
      );
    }

    const org = await this.prisma.organization.findUnique({
      where: { id: dto.organizationId },
      select: { id: true, name: true, isActive: true, isArchived: true },
    });
    if (!org) throw new NotFoundException("Tashkilot topilmadi");
    if (!org.isActive || org.isArchived) {
      throw new BadRequestException("Bu tashkilot faol emas");
    }

    const existing = await this.prisma.organizationRoute.findFirst({
      where: { categoryId: dto.categoryId, districtId },
      select: { id: true },
    });

    const route = existing
      ? await this.prisma.organizationRoute.update({
          where: { id: existing.id },
          data: { organizationId: org.id, isActive: true },
          select: { id: true, organizationId: true },
        })
      : await this.prisma.organizationRoute.create({
          data: {
            organizationId: org.id,
            categoryId: dto.categoryId,
            districtId,
            createdBy: scope.userId,
          },
          select: { id: true, organizationId: true },
        });

    await this.audit.record({
      userId: scope.userId,
      action: "organization.route.save",
      entity: "OrganizationRoute",
      entityId: route.id,
      meta: {
        category: category.name,
        organization: org.name,
        /** ⚠️ `null` — viloyat zaxirasi; auditda bu farq ko'rinishi kerak. */
        districtId,
      },
    });

    return route;
  }

  /**
   * ⚠️ HAQIQIY O'CHIRISH, `isActive: false` EMAS: qoida — SOZLAMA,
   * dalil emas (`AssignmentRulesService.remove` bilan ayni qoida).
   * "Kim qachon qo'ygan, kim olib tashlagan" javobi `AuditLog` da
   * qoladi.
   */
  async removeRoute(id: string, scope: ScopeContext) {
    const route = await this.prisma.organizationRoute.findUnique({
      where: { id },
      select: {
        id: true,
        districtId: true,
        category: { select: { name: true } },
        organization: { select: { name: true } },
      },
    });
    if (!route) throw new NotFoundException("Qoida topilmadi");

    if (route.districtId === null && !isProvinceWide(scope)) {
      throw new ForbiddenException(
        "Viloyat bo'ylab zaxira qoidasini faqat viloyat qamrovli xodim olib tashlaydi",
      );
    }

    if (route.districtId !== null && !canTouchDistrict(scope, route.districtId)) {
      throw new ForbiddenException("Bu tuman sizning qamrovingizda emas");
    }

    await this.prisma.organizationRoute.delete({ where: { id } });

    await this.audit.record({
      userId: scope.userId,
      action: "organization.route.remove",
      entity: "OrganizationRoute",
      entityId: id,
      meta: {
        category: route.category.name,
        organization: route.organization.name,
        districtId: route.districtId,
      },
    });

    return { ok: true };
  }

  // ═══════════════════════════════════════════════════════════════
  //  TAYYOR LOGIN-PAROL
  // ═══════════════════════════════════════════════════════════════

  /**
   * TASHKILOT HISOBINI YARATADI.
   *
   * ⚠️ PAROL JAVOBDA BIR MARTA QAYTARILADI va bazada OCHIQ
   * SAQLANMAYDI (faqat argon2id hash). Saqlansa, bazani o'qigan
   * odam yuzlab tashkilotning paroliga birdan ega bo'lardi.
   *
   * ⚠️ `mustChangePassword: true`: parol QOG'OZDA beriladi va u
   * almashtirilmasa tizimda abadiy qolardi — ro'yxat bir marta
   * tarqalsa, hammasi birdan ochilib ketardi.
   *
   * ⚠️ RUXSATLAR KODDAN OLINADI (`ROLE_DEFAULT_PERMISSIONS.
   * org_staff`), mijozdan EMAS: admin tasodifan `issues.resolve`
   * qo'shib qo'ysa, tashkilot fuqaroga to'g'ridan-to'g'ri rasmiy
   * javob yozib yuborardi va uni qaytarib bo'lmasdi.
   */
  async createLogin(id: string, dto: CreateOrgLoginDto, scope: ScopeContext) {
    const org = await this.loadForWrite(id, scope);

    if (org.isArchived) {
      throw new BadRequestException("Arxivlangan tashkilotga hisob yaratilmaydi");
    }

    const username = await this.uniqueUsername(dto.username?.trim() || org.name);
    const password = randomFrom(PASSWORD_LENGTH);

    const user = await this.prisma.user.create({
      data: {
        username,
        passwordHash: await AuthService.hashPassword(password),
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        phone: normalizePhone(dto.phone),
        /**
         * ⚠️ ROL `operator` BO'LIB QOLADI, YANGI ROL OCHILMADI:
         * `UserRole` ga qiymat qo'shish `PermissionsGuard`, panel
         * filtri va `ROLE_DEFAULT_PERMISSIONS` ning uchalasiga
         * tegishli bo'lardi. Haqiqiy chegara — QAMROV
         * (`scopeKind: org`) va RUXSAT ro'yxati, rol emas
         * (`permissions.ts` fayli boshidagi izoh).
         */
        role: "operator",
        scopeKind: ScopeKind.org,
        /** ⚠️ Hududiy qamrov YO'Q: tashkilot qamrovi hududiy emas. */
        districtId: null,
        organizationId: org.id,
        permissions: ROLE_DEFAULT_PERMISSIONS.org_staff ?? [],
        mustChangePassword: true,
      },
      select: { id: true, username: true, firstName: true, lastName: true },
    });

    await this.audit.record({
      userId: scope.userId,
      action: "organization.login.create",
      entity: "User",
      entityId: user.id,
      /** ⚠️ PAROL AUDITGA YOZILMAYDI — audit o'qiladigan jurnal. */
      meta: { organization: org.name, username: user.username },
    });

    return {
      ...user,
      /** ⚠️ FAQAT SHU JAVOBDA: qayta so'rab bo'lmaydi, parol tiklanadi. */
      password,
    };
  }

  /**
   * TASHKILOT HISOBLARI RO'YXATI.
   *
   * ⚠️ PANELDA KERAK: admin "bu tashkilotga hisob berilganmi, kim
   * kirgan" degan savolga javob olishi kerak — aks holda u har
   * safar yangi hisob yaratib, bir tashkilotda besh login paydo
   * bo'lardi.
   */
  async listUsers(id: string, scope: ScopeContext) {
    await this.loadForWrite(id, scope);

    return this.prisma.user.findMany({
      where: { organizationId: id },
      orderBy: [{ isArchived: "asc" }, { lastName: "asc" }],
      select: {
        id: true,
        username: true,
        firstName: true,
        lastName: true,
        phone: true,
        telegramId: true,
        isActive: true,
        isArchived: true,
        mustChangePassword: true,
        lastLoginAt: true,
      },
      // ⚠️ `passwordHash` TANLANMAYDI (`users.service.ts` dagi ayni
      // sabab): `include` bilan butun qator kelib, hash API
      // javobiga tushib ketardi.
    });
  }

  /**
   * PAROLNI TIKLAYDI — yangisini yasaydi va bir marta qaytaradi.
   *
   * ⚠️ `users.service.ts#resetPassword` DAN FARQI: u yerda parolni
   * ADMIN o'ylab topadi, bu yerda SERVER yasaydi. Tashkilotlar ko'p
   * va "Parol123" kabi qiymatlar aynan shunday paytda tug'iladi.
   */
  async resetLogin(id: string, userId: string, scope: ScopeContext) {
    await this.loadForWrite(id, scope);

    const user = await this.prisma.user.findFirst({
      where: { id: userId, organizationId: id },
      select: { id: true, username: true },
    });
    if (!user) throw new NotFoundException("Hisob topilmadi");

    const password = randomFrom(PASSWORD_LENGTH);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: await AuthService.hashPassword(password),
        mustChangePassword: true,
      },
    });

    /**
     * ⚠️ BARCHA SESSIYALAR YOPILADI: parol tiklanganining sababi
     * ko'pincha "kimdir kirib qoldi" bo'ladi va eski refresh token
     * amalda qolsa, tiklash hech narsani to'xtatmasdi.
     */
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await this.audit.record({
      userId: scope.userId,
      action: "organization.login.reset",
      entity: "User",
      entityId: userId,
      meta: { username: user.username },
    });

    return { username: user.username, password };
  }

  // ═══════════════════════════════════════════════════════════════
  //  TELEGRAM ULANISHI
  // ═══════════════════════════════════════════════════════════════

  /**
   * ULANISH KODINI BERADI.
   *
   * ⚠️ CHAT ID PANELDA QO'LDA YOZILMAYDI: oddiy odam o'z chat
   * id'sini bilmaydi va uni topish yo'li ham oson emas. Kod bilan
   * esa manzilni TELEGRAM aytadi (`message.from.id`) — ya'ni xato
   * yozish imkoni yo'q.
   *
   * ⚠️ ESKI KOD BEKOR BO'LADI: qayta so'ralgan kod oldingisini
   * o'rniga yozadi, aks holda tarqalgan eski kod bilan begona odam
   * tashkilotning xabarnomalarini o'z chatiga burib yuborardi.
   */
  async issueLinkCode(id: string, scope: ScopeContext) {
    const org = await this.loadForWrite(id, scope);

    if (org.isArchived) {
      throw new BadRequestException("Arxivlangan tashkilotga kod berilmaydi");
    }

    /**
     * ⚠️ TO'QNASHUV QAYTA URINISH BILAN HAL QILINADI: kod qisqa (6
     * belgi) va `@unique`. Cheksiz tsikl emas — bir necha urinish,
     * keyin xato: jim takrorlanadigan urinish bazani bekorga
     * yuklardi.
     */
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const linkCode = randomFrom(LINK_CODE_LENGTH);

      const taken = await this.prisma.organization.findUnique({
        where: { linkCode },
        select: { id: true },
      });
      if (taken) continue;

      await this.prisma.organization.update({
        where: { id },
        data: { linkCode },
      });

      await this.audit.record({
        userId: scope.userId,
        action: "organization.link_code",
        entity: "Organization",
        entityId: id,
        meta: { organization: org.name },
      });

      return { linkCode };
    }

    throw new ConflictException("Kod yasash muvaffaqiyatsiz — qayta urinib ko'ring");
  }

  /**
   * TELEGRAM MANZILINI UZADI — BOT ORQALI.
   *
   * ⚠️ BOT AYTGAN `organizationId` QABUL QILINMAYDI, faqat kod:
   * `X-Bot-Key` tarqalgan holatda u begona tashkilotning
   * xabarnomalarini o'z chatiga burish yo'li bo'lardi
   * (`bot-citizens` va `bot-admin` dagi ayni qoida).
   *
   * ⚠️ `telegramId` — TELEGRAM TASDIQLAGAN qiymat
   * (`message.from.id`), bot o'ylab topgani emas.
   */
  async linkTelegram(input: { telegramId: string; code: string }) {
    const code = input.code.trim().toUpperCase();

    const org = await this.prisma.organization.findUnique({
      where: { linkCode: code },
      select: { id: true, name: true, isActive: true, isArchived: true },
    });

    /**
     * ⚠️ "KOD XATO" VA "TASHKILOT ARXIVLANGAN" — AYNI JAVOB: ikkisini
     * ajratib ko'rsatish begona odamga "bu kod tizimda bor" degan
     * ma'lumot berardi (`bot-admin.service.ts#resolve` dagi ayni
     * qoida).
     */
    if (!org || !org.isActive || org.isArchived) {
      throw new NotFoundException("Kod topilmadi yoki muddati o'tgan");
    }

    /**
     * ⚠️ MFY GURUHINING CHAT ID'SI RAD ETILADI. Aks holda bot
     * KUZATILADIGAN guruhga xabarnoma yozib, "bot guruhda hech
     * narsa yozmaydi" doktrinasini buzardi — va o'sha xabar
     * keyingi AI tahlilida SIGNALGA aylanib, panelda "guruhda
     * muammo bor" bo'lib paydo bo'lardi.
     */
    const registered = await this.prisma.telegramGroup.findUnique({
      where: { chatId: input.telegramId },
      select: { chatId: true },
    });
    if (registered) {
      throw new BadRequestException(
        "Bu chat MFY guruhi/kanali sifatida ro'yxatda — xabarnoma u yerga yuborilmaydi",
      );
    }

    /**
     * ⚠️ BOSHQA TASHKILOTNING MANZILI BO'LSA — RAD ETILADI
     * (`telegramChatId @unique`). Jim bosib o'tilsa, o'sha chat
     * ikki tashkilotning murojaatlarini olib turardi va egasi
     * begona murojaatlarni ko'rardi.
     */
    const busy = await this.prisma.organization.findUnique({
      where: { telegramChatId: input.telegramId },
      select: { id: true },
    });
    if (busy && busy.id !== org.id) {
      throw new ConflictException("Bu chat boshqa tashkilotga ulangan");
    }

    await this.prisma.organization.update({
      where: { id: org.id },
      data: {
        telegramChatId: input.telegramId,
        // ⚠️ KOD BIR MARTALIK: ishlatilgandan keyin tozalanadi.
        linkCode: null,
      },
    });

    await this.audit.record({
      /** ⚠️ `null` — bu amalni XODIM qilmagan, tashkilot o'zi ulangan. */
      userId: null,
      action: "organization.telegram_linked",
      entity: "Organization",
      entityId: org.id,
      meta: { organization: org.name },
    });

    return { organizationName: org.name };
  }

  // ───────────────────────────────────────────────────────────────

  /**
   * ⚠️ VILOYAT TASHKILOTIGA FAQAT VILOYAT QAMROVLI XODIM TEGADI:
   * tuman operatori uni tahrirlasa, o'zgarish BARCHA tumanlarga
   * ta'sir qilardi.
   */
  private async loadForWrite(id: string, scope: ScopeContext) {
    const org = await this.prisma.organization.findUnique({
      where: { id },
      select: { id: true, name: true, districtId: true, isArchived: true },
    });
    if (!org) throw new NotFoundException("Tashkilot topilmadi");

    if (org.districtId === null) {
      if (!isProvinceWide(scope)) {
        throw new ForbiddenException(
          "Viloyat darajasidagi tashkilotni faqat viloyat qamrovli xodim boshqaradi",
        );
      }
      return org;
    }

    if (!canTouchDistrict(scope, org.districtId)) {
      throw new ForbiddenException("Bu tashkilot sizning qamrovingizda emas");
    }

    return org;
  }

  private async assertDistrict(
    districtId: string | null,
    scope: ScopeContext,
  ): Promise<string | null> {
    if (districtId === null) {
      if (!isProvinceWide(scope)) {
        throw new ForbiddenException(
          "Viloyat darajasidagi tashkilotni faqat viloyat qamrovli xodim yaratadi",
        );
      }
      return null;
    }

    const district = await this.prisma.district.findUnique({
      where: { id: districtId },
      select: { id: true },
    });
    if (!district) throw new NotFoundException("Tuman topilmadi");

    if (!canTouchDistrict(scope, districtId)) {
      throw new ForbiddenException("Bu tuman sizning qamrovingizda emas");
    }

    return districtId;
  }

  /**
   * LOGIN YASAYDI — tashkilot nomidan.
   *
   * ⚠️ LOTIN HARFLARIGA O'TKAZILADI: `User.username` bilan kiriladi
   * va u klaviaturada oson yozilishi kerak. O'zbek lotin alifbosidagi
   * `'` va `o'`/`g'` tashlanadi — login "suv ta'minoti" kabi
   * ko'rinsa, uni kiritish har safar xatoga olib kelardi.
   */
  private async uniqueUsername(source: string): Promise<string> {
    const base =
      source
        .toLowerCase()
        .replace(/[''`]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40) || "tashkilot";

    for (let suffix = 0; suffix < 100; suffix += 1) {
      const candidate = suffix === 0 ? base : `${base}-${suffix}`;

      const taken = await this.prisma.user.findUnique({
        where: { username: candidate },
        select: { id: true },
      });
      if (!taken) return candidate;
    }

    throw new ConflictException(
      "Login yasash muvaffaqiyatsiz — loginni qo'lda ko'rsating",
    );
  }
}
