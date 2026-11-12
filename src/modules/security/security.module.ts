import { Module } from "@nestjs/common";

import { AuditService } from "../../common/audit.service";
import { BotSecurityController, SecurityController } from "./security.controller";
import { SecurityService } from "./security.service";
import { ThreatFeedsService } from "./threat-feeds.service";

/**
 * ⚠️ `ThreatFeedsService` SHU MODULDA: tashqi qora ro'yxat —
 * qalqonning bir qismi va uning ruxsatlari ham ayni
 * (`security.view` / `security.guard`). Alohida modul ochilsa,
 * "qalqon" tushunchasi ikkiga bo'linib ketardi.
 */
@Module({
  controllers: [SecurityController, BotSecurityController],
  providers: [SecurityService, ThreatFeedsService, AuditService],
  exports: [SecurityService, ThreatFeedsService],
})
export class SecurityModule {}
