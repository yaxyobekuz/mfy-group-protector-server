import { Module } from "@nestjs/common";

import { BoundariesJob } from "./boundaries.job";
import { TerritoryController } from "./territory.controller";
import { TerritoryService } from "./territory.service";

@Module({
  controllers: [TerritoryController],
  providers: [TerritoryService, BoundariesJob],
  exports: [TerritoryService],
})
export class TerritoryModule {}
