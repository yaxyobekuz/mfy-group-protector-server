/**
 * XODIMLAR — ruxsat va hududiy qamrov.
 *
 * ⚠️ IKKI ALOHIDA TUSHUNCHA (`common/permissions.ts` izohi):
 *
 *   permissions  — NIMA QILA OLADI
 *   scopeKind    — KIMNING MA'LUMOTINI KO'RADI
 *
 * Ularni aralashtirmang: tuman operatorida `signals.attach` ruxsati
 * BOR, lekin u faqat O'Z TUMANIDAGI guruhdan chiqqan signalni
 * biriktira oladi.
 *
 * ⚠️ O'CHIRISH YO'Q, ARXIVLASH BOR. Xodim yaratgan muammolar,
 * biriktirgan signallari va auditdagi izi qoladi: uni o'chirish
 * "bu qarorni kim qabul qildi" degan savolni javobsiz qoldirardi.
 */

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../common/audit.service";
import { AuthService } from "../auth/auth.service";
import {
  ROLE_DEFAULT_PERMISSIONS,
  findUnknownPermissions,
} from "../../common/permissions";
import {
  canTouchDistrict,
  districtScopeWhere,
  isProvinceWide,
  type ScopeContext,
} from "../../common/scope.util";
import { paginate, type Paginated } from "../../common/dto/pagination.dto";
import { ScopeKind, UserRole } from "@prisma/client";
import type {
  CreateUserDto,
  ListUsersQuery,
  ResetPasswordDto,
  UpdateUserDto,
} from "./dto/users.dto";

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
  ) {}

  async list(scope: ScopeContext, query: ListUsersQuery): Promise<Paginated<unknown>> {
    const where = {
      ...(query.includeArchived ? {} : { isArchived: false }),
      // ⚠️ TUMAN XODIMI FAQAT O'Z TUMANIDAGI XODIMLARNI KO'RADI.
      // Viloyat darajasidagi xodimlarni esa ko'rmaydi (`districtId`
      // ular uchun `null`) — bu to'g'ri: u ularni boshqarmaydi.
      ...districtScopeWhere(scope),
      ...(query.role ? { role: query.role } : {}),
      ...(query.districtId ? { districtId: query.districtId } : {}),
      ...(query.search
        ? {
            OR: [
              { firstName: { contains: query.search, mode: "insensitive" as const } },
              { lastName: { contains: query.search, mode: "insensitive" as const } },
              { username: { contains: query.search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: [{ isArchived: "asc" }, { lastName: "asc" }],
        skip: query.skip,
        take: query.limit,
        select: {
          id: true,
          username: true,
          firstName: true,
          lastName: true,
          phone: true,
          role: true,
          scopeKind: true,
          telegramId: true,
          permissions: true,
          isActive: true,
          isArchived: true,
          lastLoginAt: true,
          createdAt: true,
          district: { select: { id: true, name: true } },
          _count: { select: { assignedIssues: true } },
        },
        // ⚠️ `passwordHash` TANLANMAYDI. `select` ishlatilgani
        // aynan shu uchun: `include` bilan butun qator kelib, hash
        // API javobiga tushib ketardi.
      }),
      this.prisma.user.count({ where }),
    ]);

    return paginate(users, total, query);
  }

  async create(dto: CreateUserDto, scope: ScopeContext) {
    this.assertScopeFields(dto.scopeKind, dto.districtId ?? null);

    // ⚠️ `owner` YARATILMAYDI panel orqali: u seed bilan bir marta
    // paydo bo'ladi. Aks holda admin o'ziga owner yasab, butun
    // ruxsat tizimini aylanib o'tardi.
    if (dto.role === UserRole.owner) {
      throw new ForbiddenException("Tizim egasini panel orqali yaratish mumkin emas");
    }

    // ⚠️ TUMAN XODIMI VILOYAT DARAJASIDAGI XODIM YARATOLMAYDI: u
    // o'zi uchun cheksiz qamrovli hisob ochib, qamrovdan chiqib
    // ketardi.
    if (!isProvinceWide(scope) && dto.scopeKind === ScopeKind.province) {
      throw new ForbiddenException("Viloyat qamrovli xodim yaratish sizning huquqingizda emas");
    }

    if (dto.scopeKind === ScopeKind.district && !canTouchDistrict(scope, dto.districtId!)) {
      throw new ForbiddenException("Bu tuman sizning qamrovingizda emas");
    }

    const permissions = this.resolvePermissions(dto.role, dto.permissions);

    const username = dto.username.trim().toLowerCase();

    const existing = await this.prisma.user.findUnique({ where: { username } });
    if (existing) throw new ConflictException("Bu login allaqachon mavjud");

    const user = await this.prisma.user.create({
      data: {
        username,
        passwordHash: await AuthService.hashPassword(dto.password),
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        phone: dto.phone?.trim() || null,
        role: dto.role,
        scopeKind: dto.scopeKind,
        districtId: dto.scopeKind === ScopeKind.district ? dto.districtId! : null,
        permissions,
        telegramId: dto.telegramId?.trim() || null,
      },
      select: { id: true, username: true, firstName: true, lastName: true, role: true },
    });

    await this.audit.record({
      userId: scope.userId,
      action: "user.create",
      entity: "User",
      entityId: user.id,
      meta: { username: user.username, role: dto.role, scopeKind: dto.scopeKind },
    });

    return user;
  }

  async update(id: string, dto: UpdateUserDto, scope: ScopeContext) {
    const existing = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        role: true,
        scopeKind: true,
        districtId: true,
        permissions: true,
      },
    });
    if (!existing) throw new NotFoundException("Xodim topilmadi");

    // ⚠️ `owner` NI O'ZGARTIRIB BO'LMAYDI (o'zidan boshqa hech kim):
    // admin owner'ning ruxsatini olib tashlab, tizimni egasiz
    // qoldirishi mumkin bo'lardi.
    if (existing.role === UserRole.owner && scope.role !== "owner") {
      throw new ForbiddenException("Tizim egasining ma'lumotini o'zgartirish mumkin emas");
    }

    if (dto.role === UserRole.owner) {
      throw new ForbiddenException("Rolni `owner` ga o'zgartirish mumkin emas");
    }

    if (!canTouchDistrict(scope, existing.districtId) && !isProvinceWide(scope)) {
      throw new ForbiddenException("Bu xodim sizning qamrovingizda emas");
    }

    const scopeKind = dto.scopeKind ?? existing.scopeKind;
    const districtId =
      dto.districtId !== undefined ? dto.districtId : existing.districtId;

    this.assertScopeFields(scopeKind, districtId);

    if (!isProvinceWide(scope) && scopeKind === ScopeKind.province) {
      throw new ForbiddenException("Viloyat qamrovini berish sizning huquqingizda emas");
    }

    const permissions = dto.permissions
      ? this.resolvePermissions(dto.role ?? existing.role, dto.permissions)
      : undefined;

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.firstName !== undefined ? { firstName: dto.firstName.trim() } : {}),
        ...(dto.lastName !== undefined ? { lastName: dto.lastName.trim() } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone?.trim() || null } : {}),
        ...(dto.role !== undefined ? { role: dto.role } : {}),
        scopeKind,
        districtId: scopeKind === ScopeKind.district ? districtId : null,
        ...(permissions ? { permissions } : {}),
        ...(dto.telegramId !== undefined
          ? { telegramId: dto.telegramId?.trim() || null }
          : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
      select: { id: true, username: true, role: true, scopeKind: true, isActive: true },
    });

    await this.audit.record({
      userId: scope.userId,
      action: "user.update",
      entity: "User",
      entityId: id,
      meta: {
        before: {
          role: existing.role,
          scopeKind: existing.scopeKind,
          permissions: existing.permissions,
        },
        after: dto as Record<string, unknown>,
      },
    });

    // ⚠️ RUXSAT YOKI QAMROV O'ZGARSA SESSIYALAR YOPILMAYDI va bu
    // ataylab: `JwtAuthGuard` ruxsatni HAR SO'ROVDA bazadan o'qiydi,
    // ya'ni yangi ruxsat darhol amal qiladi. Sessiyani yopish esa
    // xodimni ishning o'rtasida tizimdan chiqarib yuborardi.
    //
    // Hisob O'CHIRILGANDA esa boshqa — pastdagi `archive`.
    return user;
  }

  /**
   * ARXIVLASH / QAYTARISH.
   *
   * ⚠️ BARCHA SESSIYALAR YOPILADI: arxivlangan xodim tizimga kira
   * olmasligi kerak va buni token muddati tugashini kutib
   * bo'lmaydi. `JwtAuthGuard` ham `isArchived` ni tekshiradi, lekin
   * sessiyani yopish — ikkinchi himoya qatlami.
   */
  async archive(id: string, archived: boolean, scope: ScopeContext) {
    const existing = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true, districtId: true, username: true },
    });
    if (!existing) throw new NotFoundException("Xodim topilmadi");

    if (existing.role === UserRole.owner) {
      throw new ForbiddenException("Tizim egasini arxivlash mumkin emas");
    }

    // ⚠️ O'ZINI ARXIVLASH BLOKLANADI: odam o'zini tizimdan
    // chiqarib qo'yib, qaytib kira olmasdi.
    if (id === scope.userId) {
      throw new BadRequestException("O'zingizni arxivlash mumkin emas");
    }

    if (!canTouchDistrict(scope, existing.districtId) && !isProvinceWide(scope)) {
      throw new ForbiddenException("Bu xodim sizning qamrovingizda emas");
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: { isArchived: archived, archivedAt: archived ? new Date() : null },
      select: { id: true, isArchived: true },
    });

    if (archived) await this.auth.revokeAll(id);

    await this.audit.record({
      userId: scope.userId,
      action: archived ? "user.archive" : "user.restore",
      entity: "User",
      entityId: id,
      meta: { username: existing.username },
    });

    return user;
  }

  /**
   * PAROLNI TIKLAYDI.
   *
   * ⚠️ BARCHA SESSIYALAR YOPILADI. Parol almashtirishning sababi
   * ko'pincha "parol o'g'irlangan/tarqalgan" bo'ladi va o'sha
   * paytda eski sessiyalarni tirik qoldirish parol almashtirishni
   * MA'NOSIZ qilardi.
   */
  async resetPassword(id: string, dto: ResetPasswordDto, scope: ScopeContext) {
    const existing = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true, districtId: true, username: true },
    });
    if (!existing) throw new NotFoundException("Xodim topilmadi");

    if (existing.role === UserRole.owner && scope.role !== "owner") {
      throw new ForbiddenException("Tizim egasining parolini o'zgartirish mumkin emas");
    }

    if (!canTouchDistrict(scope, existing.districtId) && !isProvinceWide(scope)) {
      throw new ForbiddenException("Bu xodim sizning qamrovingizda emas");
    }

    await this.prisma.user.update({
      where: { id },
      data: { passwordHash: await AuthService.hashPassword(dto.password) },
    });

    await this.auth.revokeAll(id);

    await this.audit.record({
      userId: scope.userId,
      action: "user.reset_password",
      entity: "User",
      entityId: id,
      meta: { username: existing.username },
    });

    return { ok: true as const };
  }

  // ───────────────────────────────────────────────────────────────

  /**
   * ⚠️ `district` QAMROVDA `districtId` MAJBURIY. Bazada buni
   * ifodalash mumkin emas (shartli NOT NULL), shuning uchun
   * tekshiruv shu yerda. Qo'yilmasa xodim HECH NARSA ko'rmaydi
   * (`scope.util.ts` dagi `impossible` filtri) — ochib
   * qo'yishdan ko'ra xavfsizroq, lekin uni bu yerda ushlash
   * yaxshiroq.
   */
  private assertScopeFields(scopeKind: ScopeKind, districtId: string | null): void {
    if (scopeKind === ScopeKind.district && !districtId) {
      throw new BadRequestException(
        "Tuman qamrovi uchun tuman ko'rsatilishi shart — aks holda xodim hech narsa ko'rmaydi",
      );
    }
  }

  /**
   * ⚠️ NOMA'LUM RUXSAT RAD ETILADI, jim tashlanmaydi: panel eskirgan
   * kalit yuborayotgan bo'lsa (katalog o'zgargan, panel yangilanmagan),
   * bu DARHOL bilinishi kerak. Jim tashlansa xodim ruxsatsiz qolib,
   * sababi topilmasdi.
   */
  private resolvePermissions(role: UserRole, requested?: string[]): string[] {
    if (!requested) return ROLE_DEFAULT_PERMISSIONS[role] ?? [];

    const unknown = findUnknownPermissions(requested);
    if (unknown.length > 0) {
      throw new BadRequestException(`Noma'lum ruxsat: ${unknown.join(", ")}`);
    }

    return [...new Set(requested)];
  }
}
