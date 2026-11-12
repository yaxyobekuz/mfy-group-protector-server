import { Module } from "@nestjs/common";

import { AuditService } from "../../common/audit.service";
import { BotAdminService } from "./bot-admin.service";
import { BotAdminController, BroadcastsController } from "./broadcasts.controller";
import { BroadcastsService } from "./broadcasts.service";

/**
 * TARQATMA MODULI.
 *
 * ⚠️ IKKI CONTROLLER, BITTA XIZMAT — `broadcasts.controller.ts`
 * izohiga qarang: panel va bot bir xil mantiqqa boradi.
 *
 * ⚠️ `CitizensModule` DAN AJRATILDI: eski `POST /citizens/broadcast`
 * faqat fuqarolarga va faqat matn yubora olardi. Tuman/MFY kesimi,
 * guruhlar va uzatilgan xabar qo'shilgach, u "fuqarolar bo'limi"ning
 * ishi bo'lmay qoldi.
 */
@Module({
  controllers: [BroadcastsController, BotAdminController],
  providers: [BroadcastsService, BotAdminService, AuditService],
  exports: [BroadcastsService],
})
export class BroadcastsModule {}
