import { Module } from "@nestjs/common";

import { AuditService } from "../../common/audit.service";
import { AuthModule } from "../auth/auth.module";
import {
  BotOrganizationsController,
  OrganizationsController,
} from "./organizations.controller";
import { OrganizationsService } from "./organizations.service";
import { OrgRoutingService } from "./org-routing.service";

/**
 * ⚠️ `AuthModule` IMPORT QILINADI (`UsersModule` dagi ayni sabab):
 * parol hash qilish `AuthService.hashPassword` da va argon2
 * parametrlarini ikkinchi joyda saqlash ularni ajratib yuborardi —
 * o'shanda yangi yaratilgan hisob parolini tekshirib bo'lmasdi.
 *
 * ⚠️ `OrgRoutingService` EKSPORT QILINADI: murojaat UCHTA yo'l bilan
 * yaratiladi (panel, signal, ilova/bot) va yo'naltirish UCHALASIDA
 * ham ishlashi kerak — `IssuesModule` va `MobileModule` shuni
 * chaqiradi (`AssignmentRulesService` eksport qilingani bilan AYNI
 * sabab).
 */
@Module({
  imports: [AuthModule],
  controllers: [OrganizationsController, BotOrganizationsController],
  providers: [OrganizationsService, OrgRoutingService, AuditService],
  exports: [OrgRoutingService],
})
export class OrganizationsModule {}
