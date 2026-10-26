import { Module } from "@nestjs/common";

import { AuditService } from "../../common/audit.service";
import { AnnouncementsController } from "./announcements.controller";
import { AnnouncementsService } from "./announcements.service";

@Module({
  controllers: [AnnouncementsController],
  providers: [AnnouncementsService, AuditService],
})
export class AnnouncementsModule {}
