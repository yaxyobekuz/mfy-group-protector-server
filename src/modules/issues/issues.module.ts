import { Module } from "@nestjs/common";

import { AuditService } from "../../common/audit.service";
import { OrganizationsModule } from "../organizations/organizations.module";
import { CategoriesController, IssuesController } from "./issues.controller";
import { AppealTriageService } from "./appeal-triage.service";
import { AssignmentRulesService } from "./assignment-rules.service";
import { CategoriesService } from "./categories.service";
import { IssueNotifyService } from "./issue-notify.service";
import { IssuesService } from "./issues.service";

@Module({
  /**
   * ⚠️ `OrganizationsModule` IMPORT QILINADI: murojaat
   * yaratilishi bilan TASHKILOTGA yo'naltiriladi
   * (`OrgRoutingService`). Qoida bu modulga ko'chirilsa,
   * `MahallaAssignee` (MFY × yo'nalish → xodim) va
   * `OrganizationRoute` (tuman × yo'nalish → tashkilot) bitta
   * tanaga qo'shilib, "qaysi biri ustun" degan SOXTA savol
   * tug'ilardi — ular aslida ikki BOSHQA ustunni to'ldiradi.
   */
  imports: [OrganizationsModule],
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
  providers: [
    IssuesService,
    CategoriesService,
    IssueNotifyService,
    AssignmentRulesService,
    AppealTriageService,
    AuditService,
  ],
  // ⚠️ `IssuesService` EKSPORT QILINADI: `signals` moduli signalni
  // muammoga aylantirishda shuni chaqiradi. Yaratish mantig'i
  // (`publicNo`, kategoriya tekshiruvi, `source` muhri) IKKI JOYDA
  // takrorlanmasligi kerak.
  // ⚠️ `AssignmentRulesService` EKSPORT QILINADI: murojaat uchta
  // yo'l bilan yaratiladi (panel, signal, ilova/bot) va ijrochi
  // qoidasi UCHALASIDA ham ishlashi kerak — `mobile` moduli shuni
  // chaqiradi.
  exports: [
    IssuesService,
    CategoriesService,
    IssueNotifyService,
    AssignmentRulesService,
    AppealTriageService,
  ],
})
export class IssuesModule {}
