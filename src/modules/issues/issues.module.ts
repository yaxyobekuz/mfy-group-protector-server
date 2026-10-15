import { Module } from "@nestjs/common";

import { AuditService } from "../../common/audit.service";
import { BotIssuesController } from "./bot-issues.controller";
import { CategoriesController, IssuesController } from "./issues.controller";
import { CategoriesService } from "./categories.service";
import { IssueNotifyService } from "./issue-notify.service";
import { IssuesService } from "./issues.service";

@Module({
  controllers: [IssuesController, CategoriesController, BotIssuesController],
  providers: [IssuesService, CategoriesService, IssueNotifyService, AuditService],
  // ⚠️ `IssuesService` EKSPORT QILINADI: `signals` moduli signalni
  // muammoga aylantirishda shuni chaqiradi. Yaratish mantig'i
  // (`publicNo`, kategoriya tekshiruvi, `source` muhri) IKKI JOYDA
  // takrorlanmasligi kerak.
  exports: [IssuesService, CategoriesService, IssueNotifyService],
})
export class IssuesModule {}
