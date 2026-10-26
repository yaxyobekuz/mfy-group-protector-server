import { Module } from "@nestjs/common";

import { AuditService } from "../../common/audit.service";
import { CitizensController } from "./citizens.controller";
import { CitizensService } from "./citizens.service";

@Module({
  controllers: [CitizensController],
  providers: [CitizensService, AuditService],
})
export class CitizensModule {}
