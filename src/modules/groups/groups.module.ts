import { Module } from "@nestjs/common";

import { AuditService } from "../../common/audit.service";
import { BotGroupsController, GroupsController } from "./groups.controller";
import { GroupsService } from "./groups.service";

@Module({
  controllers: [GroupsController, BotGroupsController],
  providers: [GroupsService, AuditService],
  exports: [GroupsService],
})
export class GroupsModule {}
