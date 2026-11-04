import { Module } from "@nestjs/common";

import { LegalController } from "./legal.controller";

/**
 * OMMAVIY HUJJAT SAHIFALARI — `/privacy`, `/terms`, `/delete-account`.
 *
 * ⚠️ DO'KON TALABI: havolalar ilovasiz, tokensiz ochilishi kerak
 * (`legal.controller.ts` izohi).
 *
 * ⚠️ XIZMAT QATLAMI YO'Q: controller faqat diskdagi faylni o'qiydi.
 * Oraga service qo'yish bitta `readFile` ni ikki faylga bo'lib,
 * hech narsa qo'shmasdi.
 */
@Module({ controllers: [LegalController] })
export class LegalModule {}
