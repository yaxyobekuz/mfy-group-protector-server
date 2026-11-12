import { Module } from "@nestjs/common";

import { AuditService } from "../../common/audit.service";
import { UploadsModule } from "../uploads/uploads.module";
import { AnnouncementsController } from "./announcements.controller";
import { AnnouncementsService } from "./announcements.service";
import { AnnouncementsJob } from "./announcements.job";

@Module({
  // ⚠️ `UploadsModule` — media tokenlarini TEKSHIRISH uchun: fayl
  // tekshiruvi bitta joyda qoladi (`uploads.service.ts`) va e'lon
  // uchun nusxa yozilmaydi.
  imports: [UploadsModule],
  controllers: [AnnouncementsController],
  // ⚠️ `AnnouncementsJob` — rejalashtirilgan nashr. Cron `app.module`
  // dagi `ScheduleModule` orqali ishlaydi.
  providers: [AnnouncementsService, AnnouncementsJob, AuditService],
})
export class AnnouncementsModule {}
