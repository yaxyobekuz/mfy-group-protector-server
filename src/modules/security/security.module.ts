import { Module } from "@nestjs/common";

import { AuditService } from "../../common/audit.service";
import { BotSecurityController, SecurityController } from "./security.controller";
import { SecurityService } from "./security.service";

@Module({
  controllers: [SecurityController, BotSecurityController],
  providers: [SecurityService, AuditService],
  exports: [SecurityService],
})
export class SecurityModule {}
