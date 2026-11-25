/**
 * REJALASHTIRILGAN E'LONLARNI NASHR ETADI.
 *
 * ── NIMA UCHUN KERAK ──────────────────────────────────────────────────
 *
 * ⚠️ E'LON VAQTGA BOG'LIQ: "ertaga soat 9 da suv o'chadi" degan
 * xabarni kechqurun yuborish ma'nosiz, ertalab esa xodim ishga
 * kelmagan bo'ladi. Avval buning yagona yo'li — odam kompyuter
 * oldida o'tirib, tugmani O'SHA DAQIQADA bosishi edi.
 *
 * ── NIMA UCHUN JOB, `setTimeout` EMAS ─────────────────────────────────
 *
 * ⚠️ `setTimeout` SERVER QAYTA ISHGA TUSHGANDA YO'QOLADI: deploy
 * paytidagi bir daqiqalik uzilish "ertalab 9 da" rejalashtirilgan
 * e'lonni BUTUNLAY yo'q qilardi — va buni hech kim sezmasdi, chunki
 * xato ham chiqmaydi.
 *
 * ⚠️ HOLAT BAZADA (`Announcement.scheduledAt`): server yiqilib, bir
 * soatdan keyin ko'tarilsa, e'lon o'sha zahoti chiqadi. Kechikadi,
 * lekin YO'QOLMAYDI.
 *
 * ── NIMA UCHUN HAR DAQIQADA ───────────────────────────────────────────
 *
 * ⚠️ `signals.job.ts` BILAN AYNI YONDASHUV: aniqlik — daqiqa.
 * Soatda bir marta tekshirilsa, "9:00" uchun qo'yilgan e'lon 9:59 da
 * chiqib ketishi mumkin edi.
 */

import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";

import { PrismaService } from "../../prisma/prisma.service";

/**
 * Bitta aylanishda nashr etiladigan eng ko'p e'lon.
 *
 * ⚠️ CHEGARA BOR: server bir kun yiqilib turgan bo'lsa, navbatda
 * o'nlab e'lon yig'ilishi mumkin va ularni bitta tranzaksiyada
 * yozish bazani band qilardi. Qolganlari keyingi daqiqada chiqadi.
 */
const BATCH = 20;

@Injectable()
export class AnnouncementsJob {
  private readonly logger = new Logger(AnnouncementsJob.name);

  /**
   * ⚠️ BIR VAQTDA BITTA AYLANISH (`signals.job.ts` dagi qoida bilan
   * ayni): ikki aylanish ayni e'lonni o'qib, ikki marta nashr
   * etardi — va auditda ikki yozuv paydo bo'lardi.
   */
  private running: Promise<void> | null = null;

  constructor(
    private readonly prisma: PrismaService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async tick(): Promise<void> {
    if (this.running) return;

    this.running = this.publishDue().finally(() => {
      this.running = null;
    });

    await this.running;
  }

  private async publishDue(): Promise<void> {
    const now = new Date();

    /**
     * ⚠️ `publishedAt: null` SHARTI MAJBURIY: qo'lda nashr etilgan
     * e'lonning `scheduledAt` i tozalanmagan bo'lsa (masalan xodim
     * kutmay, darhol chiqargan), job uni IKKINCHI marta nashr
     * etib, `publishedAt` ni qayta yozardi — va ro'yxat tartibi
     * o'zgarib ketardi.
     */
    const due = await this.prisma.announcement.findMany({
      where: {
        scheduledAt: { not: null, lte: now },
        publishedAt: null,
      },
      orderBy: { scheduledAt: "asc" },
      take: BATCH,
      select: { id: true, title: true, scheduledAt: true, createdBy: true },
    });

    if (due.length === 0) return;

    for (const item of due) {
      try {
        /**
         * ⚠️ `scheduledAt` TOZALANADI: qolsa, panelda e'lon
         * "nashr etilgan" va BIR VAQTDA "rejalashtirilgan" bo'lib
         * ko'rinardi — xodim qaysi biri to'g'ri ekanini bilmasdi.
         *
         * ⚠️ `updateMany` + `publishedAt: null` SHARTI — POYGA
         * HIMOYASI: xodim aynan shu daqiqada qo'lda nashr etsa,
         * bu yozuv o'tmaydi va ikkinchi marta nashr bo'lmaydi.
         */
        const result = await this.prisma.announcement.updateMany({
          where: { id: item.id, publishedAt: null },
          data: { publishedAt: now, scheduledAt: null },
        });

        if (result.count === 0) continue;

        this.logger.log(`E'lon nashr etildi: ${item.title}`);
      } catch (error) {
        /**
         * ⚠️ XATO BITTA E'LONNI TO'XTATADI, HAMMASINI EMAS:
         * navbatdagi bitta buzuq yozuv qolganlarini ham
         * bloklab, butun rejalashtirish jimgina to'xtab qolardi.
         */
        this.logger.error(
          `E'lon nashr etilmadi (${item.id}): ${(error as Error).message}`,
        );
      }
    }
  }
}
