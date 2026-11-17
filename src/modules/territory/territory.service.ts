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

import type { Prisma } from "@prisma/client";

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
  ImportDistrictGeoDto,
  ImportMahallaGeoDto,
  SetProvinceGeoDto,
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

    /**
     * MFY LARDAGI AHOLI YIG'INDISI.
     *
     * ⚠️ TUMANNING O'Z USTUNI BILAN YONMA-YON KO'RSATILADI, uning
     * O'RNIGA emas: ikkisi farq qilsa, bu MFY lardagi aholi
     * to'liq to'ldirilmagani degani va panelda buni KO'RISH
     * kerak — aks holda xodim "1000 kishiga" ko'rsatkichidagi
     * g'alati raqamning sababini topa olmasdi.
     *
     * ⚠️ BITTA SO'ROVDA (`groupBy`), har tuman uchun alohida emas:
     * viloyatda 14 tuman bor va 14 ta so'rov ro'yxat ochilishini
     * sezilarli sekinlashtirardi.
     */
    const sums = await this.prisma.mahalla.groupBy({
      by: ["districtId"],
      where: {
        isArchived: false,
        districtId: { in: districts.map((district) => district.id) },
      },
      _sum: { population: true },
    });

    const sumByDistrict = new Map(
      sums.map((row) => [row.districtId, row._sum.population ?? 0]),
    );

    return districts.map((district) => ({
      id: district.id,
      code: district.code,
      name: district.name,
      sortOrder: district.sortOrder,
      isArchived: district.isArchived,
      mahallaCount: district._count.mahallas,
      population: district.population,
      mahallaPopulation: sumByDistrict.get(district.id) ?? 0,
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
        // ⚠️ `?? null` — "berilmadi" ni NOL deb yozib qo'ymaslik
        // uchun: nol aholi "1000 kishiga" ni cheksizga aylantirardi.
        population: dto.population ?? null,
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
        // ⚠️ `undefined` TEKSHIRILADI, `||` ISHLATILMAYDI: `0`
        // haqiqiy qiymat bo'lishi mumkin emas, lekin `||` bilan
        // yozilsa u jimgina tushib qolardi.
        ...(dto.population !== undefined ? { population: dto.population } : {}),
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
      /**
       * ⚠️ POLIGONNING O'ZI EMAS, BOR-YO'QLIGI: bitta MFY
       * chegarasi yuzlab koordinatadan iborat va ro'yxatda ularni
       * tashish javobni megabaytlarga oshirardi. Xarita ularni
       * ALOHIDA so'rov bilan oladi (`/reports/mahalla-map`), panelga
       * esa faqat "chegara bormi" degan javob kerak.
       */
      hasGeo: mahalla.geoJson !== null,
    }));
  }

  /**
   * MFY CHEGARALARINI IMPORT QILADI (GeoJSON).
   *
   * ── NIMA UCHUN NOM BO'YICHA ─────────────────────────────
   *
   * ⚠️ TASHQI MANBADA BIZNING ID'LARIMIZ YO'Q. Chegaralar kadastr
   * yoki OSM eksportidan keladi va ular MFY ni faqat NOMI bilan
   * biladi.
   *
   * ⚠️ TUMAN NOMI MAJBURIY: viloyatda BIR XIL NOMLI MFY lar bor
   * (har tumanda "Turon", "Birlik") va tumansiz import tasodifiy
   * MFY ga tushardi — xaritada esa buni sezish deyarli imkonsiz.
   *
   * ⚠️ TOPILMAGANLARI QAYTARILADI: import "muvaffaqiyatli" deb
   * tugab, aslida yarmi tushmay qolishi mumkin.
   *
   * ⚠️ QAMROV TEKSHIRILADI: tuman xodimi boshqa tumanning
   * chegarasini yoza olmaydi.
   */
  async importMahallaGeo(dto: ImportMahallaGeoDto, scope: ScopeContext) {
    const normalize = (value: string): string =>
      value.trim().toLocaleLowerCase("uz").replace(/[‘’ʻʼ`']/g, "'");

    const mahallas = await this.prisma.mahalla.findMany({
      where: { isArchived: false, ...districtScopeWhere(scope) },
      select: { id: true, name: true, district: { select: { name: true } } },
    });

    const index = new Map<string, string>();
    for (const mahalla of mahallas) {
      index.set(
        `${normalize(mahalla.district.name)}|${normalize(mahalla.name)}`,
        mahalla.id,
      );
    }

    let updated = 0;
    const missing: string[] = [];

    for (const item of dto.items) {
      const id = index.get(`${normalize(item.districtName)}|${normalize(item.name)}`);

      if (!id) {
        missing.push(`${item.districtName} / ${item.name}`);
        continue;
      }

      await this.prisma.mahalla.update({
        where: { id },
        data: {
          geoJson: item.geoJson as Prisma.InputJsonValue,
          // ⚠️ MARKAZ FAQAT BERILGANDA YOZILADI: u xaritada
          // qo'lda to'g'rilangan bo'lishi mumkin.
          ...(item.lat !== undefined ? { lat: item.lat } : {}),
          ...(item.lng !== undefined ? { lng: item.lng } : {}),
        },
      });

      updated += 1;
    }

    await this.audit.record({
      userId: scope.userId,
      action: "territory.import-geo",
      entity: "Mahalla",
      meta: { updated, missing: missing.length },
    });

    return { updated, missing };
  }

  /**
   * TUMAN CHEGARALARI — OMMAVIY IMPORT.
   *
   * ⚠️ NOM BO'YICHA TOPILADI (MFY dagi ayni sabab): tashqi manbada
   * bizning id'larimiz yo'q. Tuman nomi viloyatda YAGONA, ya'ni
   * MFY dagidek ajratuvchi kerak emas.
   *
   * ⚠️ TOPILMAGANLARI SANAB QAYTARILADI: import "muvaffaqiyatli"
   * deb tugab, aslida yarmi tushmay qolishi mumkin — va buni
   * xaritada sezish juda qiyin (chegara shunchaki chizilmaydi).
   *
   * ⚠️ QAMROV TEKSHIRUVI YO'Q VA BU ATAYLAB: ruxsat
   * `territory.manage` bilan himoyalangan, chegara esa butun
   * viloyatga tegishli — tuman xodimi o'z tumanining chegarasini
   * yolg'iz import qilsa, xarita yarim chizilgan holda qolardi.
   */
  async importDistrictGeo(dto: ImportDistrictGeoDto, scope: ScopeContext) {
    return this.writeDistrictGeo(dto.items, scope.userId);
  }

  /**
   * TUMAN CHEGARALARINI YOZADI \u2014 XODIM HAM, JOB HAM SHU YERDAN.
   *
   * \u26a0\ufe0f `userId` \u2014 `string | null`: chegarani job yuklaganda bu amalni
   * HECH KIM qilmagan va uni biror xodimga yozib qo'yish auditni
   * soxtalashtirardi ("kim import qildi" degan savolga yolg'on
   * javob). Panelda "Tizim" deb ko'rsatiladi \u2014
   * `groups.service.ts#recordMembershipAudit` dagi ayni qoida.
   *
   * \u26a0\ufe0f NUSXA YOZILMADI: nom moslashtirish mantiqi bitta joyda
   * qoladi. Ikki nusxa bo'lsa, apostrof qoidasi bir joyda
   * o'zgarib, ikkinchisi eskirardi.
   */
  async writeDistrictGeo(
    items: { name: string; geoJson: unknown }[],
    userId: string | null,
  ) {
    const normalize = (value: string): string =>
      value.trim().toLocaleLowerCase("uz").replace(/[\u2018\u2019\u02bb\u02bc`']/g, "'");

    const districts = await this.prisma.district.findMany({
      where: { isArchived: false },
      select: { id: true, name: true },
    });

    const index = new Map<string, string>();
    for (const district of districts) {
      index.set(normalize(district.name), district.id);
    }

    let updated = 0;
    const missing: string[] = [];

    for (const item of items) {
      const id = index.get(normalize(item.name));

      if (!id) {
        missing.push(item.name);
        continue;
      }

      await this.prisma.district.update({
        where: { id },
        data: { geoJson: item.geoJson as Prisma.InputJsonValue },
      });

      updated += 1;
    }

    await this.audit.record({
      userId,
      action: "territory.import-geo",
      entity: "District",
      meta: { updated, missing: missing.length },
    });

    return { updated, missing };
  }

  /**
   * VILOYAT CHEGARASI — XARITANING TAYANCHI.
   *
   * ⚠️ SOZLAMADA SAQLANADI (`schema.prisma` izohi): tizim bitta
   * viloyat uchun ishlaydi.
   */
  async setProvinceGeo(dto: SetProvinceGeoDto, scope: ScopeContext) {
    return this.writeProvinceGeo(dto.geoJson, scope.userId);
  }

  /** `writeDistrictGeo` bilan ayni sabab — job uchun `userId: null`. */
  async writeProvinceGeo(geoJson: unknown, userId: string | null) {
    await this.prisma.settings.update({
      where: { id: "singleton" },
      data: { provinceGeoJson: geoJson as Prisma.InputJsonValue },
    });

    await this.audit.record({
      userId,
      action: "territory.import-geo",
      entity: "Settings",
      meta: { province: true },
    });

    return { ok: true };
  }

  /**
   * CHEGARA BAZADA BORMI — JOB SHU SAVOLDAN BOSHLAYDI.
   *
   * ⚠️ IKKI ALOHIDA SAVOL: viloyat romi `settings` da, tumanlar esa
   * o'z jadvalida. Bittasi bo'lsa ikkinchisi bo'lmasligi mumkin —
   * masalan rasmiy fayldan faqat tumanlar import qilingan bo'lsa,
   * job viloyatni OSM dan to'ldirib qo'yadi va teskarisi ham.
   */
  async boundariesMissing(): Promise<{ province: boolean; districts: boolean }> {
    const [settings, districts] = await Promise.all([
      this.prisma.settings.findUnique({
        where: { id: "singleton" },
        select: { provinceGeoJson: true },
      }),
      /**
       * ⚠️ FILTR JS DA, PRISMA `where` IDA EMAS (`boundaries()` dagi
       * ayni sabab): `Json` ustunida `null` ni filtrlash
       * `Prisma.DbNull` ni QIYMAT sifatida import qilishni talab
       * qiladi, bu fayl esa Prisma'ni faqat TUR sifatida oladi.
       */
      this.prisma.district.findMany({
        where: { isArchived: false },
        select: { geoJson: true },
      }),
    ]);

    const withGeo = districts.filter((item) => item.geoJson !== null).length;
    const total = districts.length;

    return {
      province: !settings?.provinceGeoJson,
      /**
       * ⚠️ "BITTASI HAM YO'Q" SHARTI, "HAMMASI BOR" EMAS: reyestrda
       * OSM da mavjud bo'lmagan tuman turishi mumkin va "hammasi
       * to'lmaguncha" shartida job HAR aylanishda Overpass'ga
       * borib, hech narsani o'zgartirmasdi — ya'ni ommaviy xizmatni
       * bekorga band qilardi.
       */
      districts: total > 0 && withGeo === 0,
    };
  }

  /**
   * XARITA CHEGARALARI — VILOYAT VA TUMANLAR.
   *
   * ⚠️ HISOBOT EMAS, TAYANCH: bu yerda SON yo'q — faqat shakl.
   * Murojaatlar kesimi alohida so'rov bilan keladi
   * (`/reports/mahalla-map`), chunki u FILTRGA bog'liq va har
   * o'zgarishda qayta yuklanadi; chegara esa o'zgarmaydi va
   * keshlanadi.
   *
   * ⚠️ QAMROV QO'LLANMAYDI: xaritaning TAYANCHI hammaga bir xil.
   * Tuman xodimiga faqat o'z tumanining konturini ko'rsatish
   * xaritani o'qib bo'lmaydigan qilardi — u qayerda turganini
   * qo'shnilarisiz tushunolmasdi. Chegarada maxfiy ma'lumot yo'q.
   */
  async boundaries() {
    const [settings, districts] = await Promise.all([
      this.prisma.settings.findUnique({
        where: { id: "singleton" },
        select: { provinceGeoJson: true },
      }),
      this.prisma.district.findMany({
        where: { isArchived: false },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: { id: true, name: true, geoJson: true },
      }),
    ]);

    return {
      province: settings?.provinceGeoJson ?? null,
      /**
       * ⚠️ CHEGARASIZLARI MIJOZDA EMAS, SHU YERDA CHIQARIB
       * TASHLANADI: `null` qiymatlar javobni bekorga shishirardi
       * (14 tumandan 3 tasi import qilingan bo'lsa ham).
       *
       * ⚠️ FILTR JS DA, PRISMA `where` IDA EMAS: `Json` ustunida
       * `null` ni filtrlash `Prisma.DbNull` ni QIYMAT sifatida
       * import qilishni talab qiladi, bu fayl esa Prisma'ni
       * faqat TUR sifatida oladi — ro'yxat 14 qator, farqi yo'q.
       */
      districts: districts.filter((district) => district.geoJson !== null),
    };
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
