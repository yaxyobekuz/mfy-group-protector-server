/**
 * YANGILIK (E'LON) — panel tomoni.
 *
 * ⚠️ FUQARO TOMONI ALOHIDA (`mobile.service.ts#news`): u faqat NASHR
 * ETILGAN va fuqaro tumaniga mos e'lonlarni ko'radi. Bu yerda esa
 * xodim qoralamani ham ko'radi va tahrirlaydi.
 */

import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import { PrismaService } from "../../prisma/prisma.service";
import { paginate } from "../../common/dto/pagination.dto";
import { UploadsService } from "../uploads/uploads.service";
import type {
  CreateAnnouncementDto,
  ListAnnouncementsQuery,
  UpdateAnnouncementDto,
} from "./dto/announcements.dto";

@Injectable()
export class AnnouncementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: UploadsService,
  ) {}

  async list(query: ListAnnouncementsQuery) {
    const where: Prisma.AnnouncementWhereInput = {
      ...(query.districtId ? { districtId: query.districtId } : {}),
      ...(query.publishedOnly ? { publishedAt: { not: null } } : {}),
      /**
       * ⚠️ IKKI SHART BIRGA: rejalashtirilgan e'lon — `scheduledAt`
       * bor VA hali nashr etilmagan. Faqat `scheduledAt` bo'yicha
       * filtrlansa, allaqachon chiqib ketgan e'lonlar ham
       * "kutayotganlar" ro'yxatida qolardi (job sanani tozalaydi,
       * lekin eski yozuvlarda u turishi mumkin).
       */
      ...(query.scheduledOnly
        ? { scheduledAt: { not: null }, publishedAt: null }
        : {}),
      ...(query.search
        ? { title: { contains: query.search, mode: "insensitive" } }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.announcement.findMany({
        where,
        orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
        skip: query.skip,
        take: query.limit,
        include: {
          district: { select: { name: true } },
          media: { orderBy: { sortOrder: "asc" } },
        },
      }),
      this.prisma.announcement.count({ where }),
    ]);

    return paginate(
      items.map((a) => ({
        id: a.id,
        title: a.title,
        body: a.body,
        coverUrl: a.coverPath,
        isPinned: a.isPinned,
        districtId: a.districtId,
        districtName: a.district?.name ?? null,
        publishedAt: a.publishedAt,
        scheduledAt: a.scheduledAt,
        viewCount: a.viewCount,
        createdAt: a.createdAt,
        media: a.media.map((item) => ({
          id: item.id,
          kind: item.kind,
          url: item.path,
          mimeType: item.mimeType,
          size: item.size,
        })),
      })),
      total,
      query,
    );
  }

  async create(dto: CreateAnnouncementDto, userId: string) {
    const scheduledAt = this.resolveSchedule(dto.scheduledAt, dto.publish);
    const media = this.resolveMedia(dto.media);

    const created = await this.prisma.announcement.create({
      data: {
        title: dto.title.trim(),
        body: dto.body.trim(),
        coverPath: dto.coverPath?.trim() || null,
        isPinned: dto.isPinned ?? false,
        districtId: dto.districtId || null,
        publishedAt: dto.publish ? new Date() : null,
        scheduledAt,
        createdBy: userId,
        ...(media.length > 0 ? { media: { create: media } } : {}),
      },
      select: { id: true },
    });

    return created;
  }

  async update(id: string, dto: UpdateAnnouncementDto, userId: string) {
    const existing = await this.prisma.announcement.findUnique({
      where: { id },
      select: { id: true, publishedAt: true },
    });
    if (!existing) throw new NotFoundException("E'lon topilmadi");

    const scheduledAt = this.resolveSchedule(dto.scheduledAt, dto.publish);
    const media = this.resolveMedia(dto.media);

    /**
     * ⚠️ ENG KATTA TARTIB RAQAMI O'QILADI: yangi fayllar
     * mavjudlaridan KEYIN turishi kerak.
     */
    const last = await this.prisma.announcementMedia.findFirst({
      where: { announcementId: id },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });

    const nextOrder = (last?.sortOrder ?? -1) + 1;

    /**
     * MEDIA O'CHIRISH — FAQAT ANIQ KO'RSATILGANLARI.
     *
     * ⚠️ `IssueAttachment` DAN FARQLI: murojaat fayli — DALIL va
     * append-only (fuqaro "chiqindi uyumi" deb surat yuborgan,
     * keyin surat yo'qolsa murojaatning asosi qolmaydi). E'lon
     * surati esa ma'muriyatning O'Z materiali va uni olib
     * tashlash hech kimning dalilini yo'q qilmaydi.
     *
     * ⚠️ `announcementId` SHARTI MAJBURIY: id lar mijozdan
     * keladi va usiz xodim BOSHQA e'lonning suratini o'chirib
     * yubora olardi.
     */
    if (dto.removeMedia && dto.removeMedia.length > 0) {
      await this.prisma.announcementMedia.deleteMany({
        where: { announcementId: id, id: { in: dto.removeMedia } },
      });
    }

    const updated = await this.prisma.announcement.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.body !== undefined ? { body: dto.body.trim() } : {}),
        ...(dto.coverPath !== undefined ? { coverPath: dto.coverPath.trim() || null } : {}),
        ...(dto.isPinned !== undefined ? { isPinned: dto.isPinned } : {}),
        ...(dto.districtId !== undefined ? { districtId: dto.districtId || null } : {}),
        // ⚠️ NASHR SANASI: `publish=true` birinchi marta nashr qilsa
        // sana QO'YILADI; qayta nashrda eski sana SAQLANADI (ro'yxat
        // tartibi buzilmasin). `publish=false` — qoralamaga qaytaradi.
        ...(dto.publish === true && !existing.publishedAt ? { publishedAt: new Date() } : {}),
        ...(dto.publish === false ? { publishedAt: null } : {}),
        /**
         * ⚠️ QO'LDA NASHR ETILGANDA REJA TOZALANADI: qolsa, job
         * keyinroq e'lonni IKKINCHI marta "nashr etilgan" deb
         * belgilab, `publishedAt` ni qayta yozardi — ro'yxat
         * tartibi esa o'zgarib ketardi.
         */
        ...(dto.publish === true ? { scheduledAt: null } : {}),
        ...(scheduledAt ? { scheduledAt } : {}),
        ...(dto.cancelSchedule ? { scheduledAt: null } : {}),
        ...(media.length > 0
          ? {
              /**
               * {W} TARTIB MAVJUDLARIDAN KEYIN BOSHLANADI: `0`
               * dan boshlansa, yangi surat eski suratlarning
               * OLDIGA tushib, e'lonning ketma-ketligi
               * buzilardi (xodim avval umumiy ko'rinishni,
               * keyin tafsilotni qo'yadi).
               */
              media: { create: media.map((item, index) => ({ ...item, sortOrder: nextOrder + index })) },
            }
          : {}),
      },
      select: { id: true },
    });

    return updated;
  }

  async remove(id: string, userId: string) {
    const existing = await this.prisma.announcement.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException("E'lon topilmadi");

    await this.prisma.announcement.delete({ where: { id } });

    return { ok: true };
  }

  // ═══════════════════════════════════════════════════════════════
  //  YORDAMCHILAR
  // ═══════════════════════════════════════════════════════════════

  /**
   * REJA SANASINI TEKSHIRADI.
   *
   * ⚠️ O'TMISHDAGI SANA RAD ETILADI: "kechagi soat 9" ga
   * qo'yilgan e'lon job birinchi aylanishida DARHOL chiqib
   * ketardi — xodim esa uni kelajakka qo'ydi deb o'ylab yurardi.
   * Jim o'tib ketadigan xato eng yomoni.
   *
   * ⚠️ IKKI DAQIQALIK BO'SHLIQ BERILADI: panelda sana tanlangan
   * paytdan "Saqlash" bosilgan paytga qadar bir necha soniya
   * o'tadi va "hozir" uchun qo'yilgan reja aks holda rad
   * etilardi.
   *
   * ⚠️ `publish` BILAN BIRGA RAD ETILADI: ikkisi QARAMA-QARSHI
   * buyruq ("hoziroq chiqar" va "ertaga chiqar") va qaysi biri
   * ustun ekanini taxmin qilish kerak bo'lardi — taxmin esa
   * xodimning ko'rganidan boshqa natija berardi.
   */
  private resolveSchedule(
    scheduledAt: string | undefined,
    publish: boolean | undefined,
  ): Date | null {
    if (!scheduledAt) return null;

    if (publish === true) {
      throw new BadRequestException(
        "Bir vaqtda ham nashr etish, ham rejalashtirish mumkin emas",
      );
    }

    const when = new Date(scheduledAt);

    if (Number.isNaN(when.getTime())) {
      throw new BadRequestException("Reja sanasi noto'g'ri");
    }

    const GRACE_MS = 2 * 60 * 1000;

    if (when.getTime() < Date.now() - GRACE_MS) {
      throw new BadRequestException("Reja sanasi o'tmishda bo'lishi mumkin emas");
    }

    /**
     * ⚠️ YUQORI CHEGARA — BIR YIL: xato kiritilgan "2126" sanasi
     * e'lonni abadiy navbatda qoldirardi va xodim uni
     * "chiqmayapti" deb izlab yurardi.
     */
    const MAX_AHEAD_MS = 365 * 24 * 60 * 60 * 1000;

    if (when.getTime() > Date.now() + MAX_AHEAD_MS) {
      throw new BadRequestException("Reja sanasi bir yildan uzoq bo'lishi mumkin emas");
    }

    return when;
  }

  /**
   * IMZOLANGAN TOKENLARDAN MEDIA YOZUVLARINI TIKLAYDI.
   *
   * ⚠️ MIJOZ AYTGAN YO'L QABUL QILINMAYDI (`mobile.service.ts`
   * dagi ayni qoida): token `signRef` bilan imzolangan va undan
   * tur, yo'l, hajm SERVER yozgan holicha tiklanadi. Aks holda
   * xodim `../../.env` ni e'longa biriktirib, uni butun aholiga
   * ko'rsata olardi.
   *
   * ⚠️ YAROQSIZ TOKEN JIMGINA TASHLANADI, xato berilmaydi: imzo
   * 6 soat yaroqli va uzoq tahrirlangan qoralamada tokenlarning
   * bir qismi eskirgan bo'lishi mumkin. Butun saqlashni rad
   * etish xodimning yozgan matnini ham yo'qotardi.
   */
  private resolveMedia(tokens: string[] | undefined) {
    return (tokens ?? [])
      .map((token) => this.uploads.resolveToken(token))
      .filter((ref): ref is NonNullable<typeof ref> => ref !== null)
      .map((ref, index) => ({
        kind: ref.kind,
        path: ref.path,
        mimeType: ref.mime,
        size: ref.size,
        originalName: ref.originalName,
        /**
         * ⚠️ TARTIB SAQLANADI: xodim suratlarni ATAYLAB ketma-ket
         * qo'yadi (avval umumiy ko'rinish, keyin tafsilot) va
         * tartibsiz ko'rsatish e'lonning ma'nosini buzardi.
         *
         * ⚠️ TAHRIRLASHDA BU QIYMAT SURILADI (`nextOrder`): yangi
         * surat mavjudlarining OLDIGA tushmasligi kerak.
         */
        sortOrder: index,
      }));
  }
}
