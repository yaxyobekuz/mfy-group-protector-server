/**
 * REJALASHTIRILGAN TARQATMALARNI YUBORADI.
 *
 * ⚠️ `setTimeout` EMAS, BAZADA (`announcements.job.ts` bilan ayni
 * qaror): `setTimeout` server qayta ishga tushganda YO'QOLADI va
 * deploy paytidagi bir daqiqalik uzilish "ertalab 9 da"
 * rejalashtirilgan tarqatmani butunlay yo'q qilardi — xato ham
 * chiqmasdi. Holat bazada bo'lgani uchun server yiqilib, keyin
 * ko'tarilsa tarqatma KECHIKADI, lekin yo'qolmaydi.
 *
 * ⚠️ HAR DAQIQADA TEKSHIRILADI: soatda bir marta bo'lsa, "9:00"
 * uchun qo'yilgan tarqatma 9:59 da chiqib ketishi mumkin edi.
 *
 * ⚠️ CRON IFODASIDA MUDDAT YO'Q: ifoda har daqiqada uriladi, har
 * tarqatma esa O'Z `scheduledAt` ini tekshiradi (`signals.job.ts`
 * bilan ayni yondashuv). Ifodaga aniq vaqt yozilsa, u oy
 * chegarasida buzilardi va server qayta ishga tushganda
 * o'tkazib yuborilgan vaqtni BILMASDI.
 */

import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";

import { BroadcastsService } from "./broadcasts.service";

@Injectable()
export class BroadcastsJob {
  private readonly logger = new Logger(BroadcastsJob.name);

  /**
   * ⚠️ BIR VAQTDA BITTA AYLANISH: tarqatma uzoq ishlaydi (minglab
   * xabar) va ikkinchi aylanish ustma-ust tushsa, AYNI tarqatma
   * ikki marta yuborilardi. `run` ning o'zida ham himoya bor
   * (status tekshiruvi), lekin ikkisi ham kerak: bu yerdagisi
   * bazaga keraksiz so'rovni ham to'xtatadi.
   */
  private running = false;

  constructor(private readonly broadcasts: BroadcastsService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;

    try {
      const due = await this.broadcasts.dueScheduled();

      for (const id of due) {
        this.logger.log(`Rejalashtirilgan tarqatma boshlandi: ${id}`);

        /**
         * ⚠️ KETMA-KET, PARALLEL EMAS: ikki tarqatma birga
         * yuborilsa, Telegram chegarasi (sekundiga ~30 xabar)
         * ikkalasiga BIRGA tegishli bo'lib, ikkalasi ham `429`
         * yeb, sekinlashardi.
         *
         * ⚠️ XATO YUTILADI: bitta tarqatma yiqilsa, navbatdagi
         * boshqalari baribir chiqishi kerak.
         */
        await this.broadcasts.run(id).catch((error: Error) => {
          this.logger.error(`Tarqatma ${id} yiqildi: ${error.message}`);
        });
      }
    } catch (error) {
      this.logger.warn(`Rejalashtirilganlarni olishda xato: ${(error as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
