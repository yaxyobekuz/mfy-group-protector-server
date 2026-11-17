/**
 * CHEGARA BAZADA BO'LMASA — DEPLOYDA O'ZI TO'LDIRADI.
 *
 * ── NIMA UCHUN KERAK ──────────────────────────────────────────────────
 *
 * ⚠️ AVVAL CHEGARA QO'LDA YUKLANARDI (`tools/import-boundaries.mjs`)
 * va natija shu bo'lardi: kod deploy bo'ladi, panel ochiladi —
 * xaritada esa hech narsa o'zgarmaydi. Nuqtalar ochiq fonda, qo'shni
 * viloyatlar va Qirg'iziston ustida suzib turadi. "Nega ko'rinmaydi"
 * degan savolning javobi ("bazada chegara yo'q") panelda HECH QANDAY
 * belgi bilan ko'rinmasdi — skriptni ishga tushirish uchun esa
 * xodimning mashinasida kod, Node va parol kerak bo'lardi.
 *
 * ── NIMA UCHUN TARMOQ YO'Q ────────────────────────────────────────────
 *
 * ⚠️ OVERPASS'DAN ISH VAQTIDA OLISH SINALDI VA RAD ETILDI: og'ir
 * `out geom` so'rovi ommaviy serverda band paytda `502` qaytaradi —
 * tirik sinovda to'rt urinishda ham. Server shunga bog'lansa,
 * "deployda chegara ko'rinadi" degan va'da TASODIFGA aylanardi.
 *
 * ⚠️ SHUNING UCHUN GEOMETRIYA KODDA (`boundaries.data.ts`): chegara —
 * ma'muriy hujjat va yillab o'zgarmaydi, ya'ni uni har safar qayta
 * so'rashning ma'nosi yo'q. Job faqat BAZAGA ko'chiradi.
 *
 * ── NIMA UCHUN BO'SH BO'LGANDA FAQAT ──────────────────────────────────
 *
 * ⚠️ HAR DEPLOYDA QAYTA YOZILMAYDI va bu MUHIM: RASMIY kadastr fayli
 * OSM nusxasidan USTUN (doktrina). Ma'muriyat rasmiy faylni import
 * qilgandan keyin job uni bosib yozsa, aniqroq ma'lumot JIMGINA
 * yo'qolardi.
 *
 * ── NIMA UCHUN CRON HAM BOR ───────────────────────────────────────────
 *
 * ⚠️ REYESTR KEYIN TO'LDIRILISHI MUMKIN: yangi o'rnatishda tumanlar
 * server ko'tarilgandan KEYIN kiritiladi va faqat ishga tushishga
 * tayangan kod chegarani keyingi deploygacha yo'q qoldirardi.
 * Tekshiruv — ikki arzon so'rov (`signals.job.ts` dagi yondashuv:
 * cron faqat "vaqti keldimi" deb so'raydi).
 */

import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";

import { TerritoryService } from "./territory.service";
import { DISTRICT_GEO, PROVINCE_GEO, PROVINCE_NAME } from "./boundaries.data";

/**
 * Ishga tushgandan keyin qancha kutiladi.
 *
 * ⚠️ DARHOL BOSHLANMAYDI: server ko'tarilayotganda migratsiya,
 * ulanish pool'i va boshqa joblar ishga tushadi. Chegara esa bir
 * necha soniya kutsa hech narsa o'zgarmaydi — panel uni faqat
 * xarita sahifasida so'raydi.
 */
const START_DELAY_MS = 15_000;

@Injectable()
export class BoundariesJob implements OnModuleInit {
  private readonly logger = new Logger(BoundariesJob.name);

  /**
   * ⚠️ BIR VAQTDA BITTA AYLANISH (`signals.job.ts` dagi qoida bilan
   * ayni): ishga tushish va cron ustma-ust tushishi mumkin —
   * o'shanda ayni chegara ikki marta yozilib, auditda ikki yozuv
   * paydo bo'lardi.
   */
  private running: Promise<void> | null = null;

  constructor(private readonly territory: TerritoryService) {}

  /**
   * ⚠️ `await` QILINMAYDI (`void`) va `unref()` QO'YILGAN: ikkisi
   * ham serverning ko'tarilishini va to'xtashini bu ishga BOG'LAB
   * qo'ymaslik uchun.
   */
  onModuleInit(): void {
    setTimeout(() => void this.tick(), START_DELAY_MS).unref();
  }

  @Cron(CronExpression.EVERY_6_HOURS)
  async tick(): Promise<void> {
    if (this.running) return;

    this.running = this.fill().finally(() => {
      this.running = null;
    });

    await this.running;
  }

  private async fill(): Promise<void> {
    try {
      const missing = await this.territory.boundariesMissing();

      // ⚠️ ENG KO'P UCHRAYDIGAN YO'L: chegara allaqachon bor —
      // ikki arzon so'rovdan keyin chiqib ketiladi.
      if (!missing.province && !missing.districts) return;

      if (missing.province && PROVINCE_GEO) {
        await this.territory.writeProvinceGeo(PROVINCE_GEO, null);
        this.logger.log(`Viloyat chegarasi yozildi: ${PROVINCE_NAME}`);
      }

      if (missing.districts && DISTRICT_GEO.length > 0) {
        const result = await this.territory.writeDistrictGeo(
          DISTRICT_GEO,
          null,
        );

        this.logger.log(`${result.updated} ta tuman chegarasi yozildi`);

        /**
         * ⚠️ TOPILMAGANLARI NOMI BILAN LOGGA CHIQADI: OSM nomi
         * reyestrdagi nomdan farq qilsa (apostrof shakli, "tumani"
         * so'zi), chegara shunchaki chizilmaydi — va buni xaritada
         * sezish juda qiyin. Nom ko'rinsa, uni reyestrda to'g'rilash
         * bir daqiqalik ish.
         */
        if (result.missing.length > 0) {
          this.logger.warn(
            `Reyestrda topilmadi (${result.missing.length}): ` +
              result.missing.join(", "),
          );
        }
      }
    } catch (error) {
      /**
       * ⚠️ XATO YUQORIGA CHIQMAYDI: bu job serverning ishga
       * tushishiga ilashgan va qo'lga olinmagan xato
       * `unhandledRejection` bo'lib, butun jarayonni yiqitishi
       * mumkin edi — chegara esa xaritaning bezagi, uning yo'qligi
       * tizimni to'xtatadigan nosozlik emas.
       */
      this.logger.warn(`Chegara yozilmadi: ${(error as Error).message}`);
    }
  }
}
