/**
 * HUDUD — tuman va MFY reyestri.
 *
 * ⚠️ O'CHIRISH YO'Q, ARXIVLASH BOR. Tumanga biriktirilgan MFY,
 * guruhlar, signallar va muammolar tarixi qoladi: tumanni o'chirish
 * o'sha tarixni ham olib ketardi (yoki FK tufayli umuman ishlamasdi).
 * Arxivlangan yozuv ro'yxatdan chiqadi, lekin eski muammoda nomi
 * ko'rinib turadi.
 *
 * ⚠️ QAMROV: tuman xodimi FAQAT O'Z TUMANINI ko'radi
 * (`scope.util.ts`). Bu ro'yxatga ham tegishli — u boshqa tumanlar
 * nomini ham bilmasligi kerak emas, lekin ularning MFY ro'yxatini,
 * guruhlarini va murojaatlarini ko'rmasligi kerak.
 */

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../common/audit.service";
import {
  canTouchDistrict,
  districtScopeWhere,
  isProvinceWide,
  type ScopeContext,
} from "../../common/scope.util";
import type {
  CreateDistrictDto,
  CreateMahallaDto,
  UpdateDistrictDto,
  UpdateMahallaDto,
} from "./dto/territory.dto";

@Injectable()
export class TerritoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ═══════════════════════════════════════════════════════════════
  //  TUMANLAR
  // ═══════════════════════════════════════════════════════════════

  /**
   * ⚠️ `includeArchived` STANDART HOLDA `false`: arxivlangan tuman
   * tanlov ro'yxatlarida ko'rinmasligi kerak, aks holda yangi MFY
   * yopilgan tumanga biriktirilib qolardi.
   */
  async listDistricts(
    scope: ScopeContext,
    options: { includeArchived?: boolean } = {},
  ) {
    const districts = await this.prisma.district.findMany({
      where: {
        ...(options.includeArchived ? {} : { isArchived: false }),
        // ⚠️ `districtScopeWhere` `districtId` kaliti bilan ishlaydi,
        // bu yerda esa jadvalning O'ZI tuman — shuning uchun `id`.
        ...(isProvinceWide(scope)
          ? {}
          : { id: scope.districtId ?? "__hech-qanday-tuman__" }),
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: {
        _count: { select: { mahallas: { where: { isArchived: false } } } },
      },
    });

    return districts.map((district) => ({
      id: district.id,
      code: district.code,
      name: district.name,
      sortOrder: district.sortOrder,
      isArchived: district.isArchived,
      mahallaCount: district._count.mahallas,
      createdAt: district.createdAt,
    }));
  }

  async createDistrict(dto: CreateDistrictDto, scope: ScopeContext) {
    // ⚠️ TUMAN YARATISH — FAQAT VILOYAT DARAJASI. Tuman xodimi
    // yangi tuman ocha olmasligi kerak: u o'z tumanidan tashqariga
    // chiqish yo'li bo'lardi (yangi tuman ochib, o'zini unga
    // biriktirish).
    if (!isProvinceWide(scope)) {
      throw new BadRequestException("Tuman yaratish — viloyat darajasidagi amal");
    }

    const district = await this.prisma.district.create({
      data: {
        code: this.normalizeCode(dto.code),
        name: dto.name.trim(),
        sortOrder: dto.sortOrder ?? 0,
      },
    });

    await this.audit.record({
      userId: scope.userId,
      action: "territory.district_create",
      entity: "District",
      entityId: district.id,
      meta: { code: district.code, name: district.name },
    });

    return district;
  }

  async updateDistrict(id: string, dto: UpdateDistrictDto, scope: ScopeContext) {
    const existing = await this.prisma.district.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Tuman topilmadi");

    if (!canTouchDistrict(scope, id)) {
      throw new BadRequestException("Bu tuman sizning qamrovingizda emas");
    }

    const district = await this.prisma.district.update({
      where: { id },
      data: {
        ...(dto.code !== undefined ? { code: this.normalizeCode(dto.code) } : {}),
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      },
    });

    await this.audit.record({
      userId: scope.userId,
      action: "territory.district_update",
      entity: "District",
      entityId: id,
      meta: { before: { code: existing.code, name: existing.name }, after: dto },
    });

    return district;
  }

  /**
   * ARXIVLASH / QAYTARISH.
   *
   * ⚠️ ICHIDAGI MFY'LAR AVTOMATIK ARXIVLANMAYDI. Sabab: qaytarishda
   * "qaysilari avval ham arxivda edi" degan ma'lumot yo'qolardi va
   * tuman qaytganda hammasi birdan ochilib ketardi. Shuning uchun
   * tuman arxivlanganda uning MFY'lari RO'YXATDA QOLADI, lekin
   * tuman ro'yxatidan chiqadi — va panel buni ko'rsatadi.
   */
  async archiveDistrict(id: string, archived: boolean, scope: ScopeContext) {
    if (!isProvinceWide(scope)) {
      throw new BadRequestException("Tumanni arxivlash — viloyat darajasidagi amal");
    }

    const district = await this.prisma.district.findUnique({
      where: { id },
      include: { _count: { select: { users: true } } },
    });
    if (!district) throw new NotFoundException("Tuman topilmadi");

    // ⚠️ XODIMI BOR TUMANNI ARXIVLASH BLOKLANADI: o'sha xodimlar
    // `scopeKind: district` bilan qolib, HECH NARSA ko'rmaydigan
    // holatga tushardi va buni ular o'zlari tushuntirib bera
    // olmasdi ("kecha ishlayotgan edi").
    if (archived && district._count.users > 0) {
      throw new ConflictException(
        `Bu tumanga ${district._count.users} xodim biriktirilgan — avval ularni boshqa tumanga o'tkazing`,
      );
    }

    const updated = await this.prisma.district.update({
      where: { id },
      data: { isArchived: archived, archivedAt: archived ? new Date() : null },
    });

    await this.audit.record({
      userId: scope.userId,
      action: archived ? "territory.district_archive" : "territory.district_restore",
      entity: "District",
      entityId: id,
    });

    return updated;
  }

  // ═══════════════════════════════════════════════════════════════
  //  MFY
  // ═══════════════════════════════════════════════════════════════

  async listMahallas(
    scope: ScopeContext,
    query: { districtId?: string; search?: string; includeArchived?: boolean } = {},
  ) {
    const mahallas = await this.prisma.mahalla.findMany({
      where: {
        ...(query.includeArchived ? {} : { isArchived: false }),
        // ⚠️ QAMROV VA FOYDALANUVCHI FILTRI BIRGA (AND): panel
        // `districtId` yuborishi mumkin, lekin u qamrovni
        // KENGAYTIRA olmaydi — faqat ichida toraytiradi.
        ...districtScopeWhere(scope),
        ...(query.districtId ? { districtId: query.districtId } : {}),
        ...(query.search
          ? {
              OR: [
                { name: { contains: query.search, mode: "insensitive" as const } },
                { code: { contains: query.search, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: {
        district: { select: { id: true, name: true } },
        _count: { select: { groups: true, issues: true } },
      },
    });

    return mahallas.map((mahalla) => ({
      id: mahalla.id,
      code: mahalla.code,
      name: mahalla.name,
      district: mahalla.district,
      chairmanName: mahalla.chairmanName,
      chairmanPhone: mahalla.chairmanPhone,
      population: mahalla.population,
      sortOrder: mahalla.sortOrder,
      isArchived: mahalla.isArchived,
      groupCount: mahalla._count.groups,
      issueCount: mahalla._count.issues,
    }));
  }

  async createMahalla(dto: CreateMahallaDto, scope: ScopeContext) {
    const district = await this.prisma.district.findUnique({
      where: { id: dto.districtId },
      select: { id: true, isArchived: true },
    });
    if (!district) throw new NotFoundException("Tuman topilmadi");

    // ⚠️ ARXIVLANGAN TUMANGA YANGI MFY QO'SHILMAYDI: u ro'yxatda
    // ko'rinmaydi, ya'ni yangi MFY jimgina ko'rinmas joyga tushardi.
    if (district.isArchived) {
      throw new BadRequestException("Arxivlangan tumanga MFY qo'shib bo'lmaydi");
    }

    if (!canTouchDistrict(scope, dto.districtId)) {
      throw new BadRequestException("Bu tuman sizning qamrovingizda emas");
    }

    const mahalla = await this.prisma.mahalla.create({
      data: {
        districtId: dto.districtId,
        code: this.normalizeCode(dto.code),
        name: dto.name.trim(),
        chairmanName: dto.chairmanName?.trim() || null,
        chairmanPhone: dto.chairmanPhone?.trim() || null,
        population: dto.population ?? null,
        sortOrder: dto.sortOrder ?? 0,
      },
      include: { district: { select: { id: true, name: true } } },
    });

    await this.audit.record({
      userId: scope.userId,
      action: "territory.mahalla_create",
      entity: "Mahalla",
      entityId: mahalla.id,
      meta: { code: mahalla.code, name: mahalla.name, districtId: dto.districtId },
    });

    return mahalla;
  }

  async updateMahalla(id: string, dto: UpdateMahallaDto, scope: ScopeContext) {
    const existing = await this.prisma.mahalla.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("MFY topilmadi");

    if (!canTouchDistrict(scope, existing.districtId)) {
      throw new BadRequestException("Bu MFY sizning qamrovingizda emas");
    }

    // ⚠️ TUMANNI O'ZGARTIRISH — YANGI TUMAN HAM QAMROVDA bo'lishi
    // kerak. Aks holda tuman xodimi o'z MFY'sini boshqa tumanga
    // "jo'natib", uni o'z ko'rinishidan chiqarib tashlardi.
    if (dto.districtId && dto.districtId !== existing.districtId) {
      if (!canTouchDistrict(scope, dto.districtId)) {
        throw new BadRequestException("Yangi tuman sizning qamrovingizda emas");
      }
    }

    const mahalla = await this.prisma.mahalla.update({
      where: { id },
      data: {
        ...(dto.districtId !== undefined ? { districtId: dto.districtId } : {}),
        ...(dto.code !== undefined ? { code: this.normalizeCode(dto.code) } : {}),
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.chairmanName !== undefined
          ? { chairmanName: dto.chairmanName?.trim() || null }
          : {}),
        ...(dto.chairmanPhone !== undefined
          ? { chairmanPhone: dto.chairmanPhone?.trim() || null }
          : {}),
        ...(dto.population !== undefined ? { population: dto.population } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      },
      include: { district: { select: { id: true, name: true } } },
    });

    await this.audit.record({
      userId: scope.userId,
      action: "territory.mahalla_update",
      entity: "Mahalla",
      entityId: id,
    });

    return mahalla;
  }

  async archiveMahalla(id: string, archived: boolean, scope: ScopeContext) {
    const existing = await this.prisma.mahalla.findUnique({
      where: { id },
      include: { _count: { select: { groups: true } } },
    });
    if (!existing) throw new NotFoundException("MFY topilmadi");

    if (!canTouchDistrict(scope, existing.districtId)) {
      throw new BadRequestException("Bu MFY sizning qamrovingizda emas");
    }

    // ⚠️ GURUHLAR AVTOMATIK UZILMAYDI: biriktirish qo'lda qilingan va
    // uni qo'lda yechish kerak. Avtomatik uzilsa, MFY qaytganda
    // guruhlar qaytmay, kuzatuv jimgina to'xtab qolardi.
    if (archived && existing._count.groups > 0) {
      throw new ConflictException(
        `Bu MFY ga ${existing._count.groups} guruh biriktirilgan — avval biriktirishni yechib oling`,
      );
    }

    const mahalla = await this.prisma.mahalla.update({
      where: { id },
      data: { isArchived: archived, archivedAt: archived ? new Date() : null },
    });

    await this.audit.record({
      userId: scope.userId,
      action: archived ? "territory.mahalla_archive" : "territory.mahalla_restore",
      entity: "Mahalla",
      entityId: id,
    });

    return mahalla;
  }

  /**
   * ⚠️ KOD NORMALLASHTIRILADI: kichik harf, bo'shliq o'rniga defis.
   * Aks holda "Chilonzor" va "chilonzor" ikki ALOHIDA kod bo'lib,
   * `@unique` ularni o'tkazib yuborardi — keyin esa import va URL
   * da chalkashlik chiqardi.
   */
  private normalizeCode(code: string): string {
    return code
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");
  }
}
