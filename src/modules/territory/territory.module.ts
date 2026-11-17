import { Module } from "@nestjs/common";

import { AuditService } from "../../common/audit.service";
import { BoundariesJob } from "./boundaries.job";
import { TerritoryController } from "./territory.controller";
import { TerritoryService } from "./territory.service";

@Module({
  controllers: [TerritoryController],
  providers: [TerritoryService, AuditService, BoundariesJob],
  exports: [TerritoryService],
})
export class TerritoryModule {}
