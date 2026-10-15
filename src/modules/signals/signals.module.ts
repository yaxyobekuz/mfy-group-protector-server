import { Module } from "@nestjs/common";

import { AuditService } from "../../common/audit.service";
import { IssuesModule } from "../issues/issues.module";
import { SettingsModule } from "../settings/settings.module";
import { SignalAiService } from "./ai/signal-ai.service";
import { SignalsController } from "./signals.controller";
import { SignalsJob } from "./signals.job";
import { SignalsService } from "./signals.service";

/**
 * ⚠️ `IssuesModule` IMPORT QILINADI: signalni muammoga aylantirish
 * `IssuesService` ni chaqiradi. Yaratish mantig'i (`publicNo`,
 * kategoriya tekshiruvi, `source` muhri) ikki joyda takrorlanmasligi
 * kerak — aks holda botdan kelgan muammo va signaldan kelgani
 * boshqa-boshqa qoidalar bilan yaratilardi.
 */
@Module({
  imports: [IssuesModule, SettingsModule],
  controllers: [SignalsController],
  providers: [SignalsService, SignalAiService, SignalsJob, AuditService],
  exports: [SignalsService],
})
export class SignalsModule {}
