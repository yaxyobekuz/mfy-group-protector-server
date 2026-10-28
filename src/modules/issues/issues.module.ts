import { Module } from "@nestjs/common";

import { AuditService } from "../../common/audit.service";
import { CategoriesController, IssuesController } from "./issues.controller";
import { CategoriesService } from "./categories.service";
import { IssueNotifyService } from "./issue-notify.service";
import { IssuesService } from "./issues.service";

@Module({
  // ⚠️ `BotIssuesController` OLIB TASHLANDI: bot endi XODIM uchun
  // emas, FUQARO uchun va uning endpoint'lari `mobile` modulida
  // (`bot-citizens.controller.ts`). Eski oqim xodimdan `telegramId`
  // bog'lashni talab qilardi va fuqaroni boshi berk ko'chaga olib
  // borardi ("hisobingiz bog'lanmagan").
  //
  // ⚠️ `IssuesService.createFromBot` QOLDIRILDI: `IssueSource.bot`
  // bilan yozilgan ESKI murojaatlar bazada turibdi va hisobotda
  // o'z yo'lini saqlashi kerak (`source` — muhrlangan qiymat).
  controllers: [IssuesController, CategoriesController],
  providers: [IssuesService, CategoriesService, IssueNotifyService, AuditService],
  // ⚠️ `IssuesService` EKSPORT QILINADI: `signals` moduli signalni
  // muammoga aylantirishda shuni chaqiradi. Yaratish mantig'i
  // (`publicNo`, kategoriya tekshiruvi, `source` muhri) IKKI JOYDA
  // takrorlanmasligi kerak.
  exports: [IssuesService, CategoriesService, IssueNotifyService],
})
export class IssuesModule {}
