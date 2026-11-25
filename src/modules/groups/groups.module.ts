import { Module } from "@nestjs/common";

import { BotGroupsController, GroupsController } from "./groups.controller";
import { GroupsService } from "./groups.service";

@Module({
  controllers: [GroupsController, BotGroupsController],
  providers: [GroupsService],
  exports: [GroupsService],
})
export class GroupsModule {}
