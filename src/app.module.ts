/**
 * ILDIZ MODUL.
 *
 * ⚠️ GUARD'LAR GLOBAL: hamma narsa standart holda YOPIQ, ochiq
 * endpoint esa `@Public()` bilan ALOHIDA belgilanadi. Teskarisi
 * ("kerakli joyga guard qo'yish") amalda bitta endpoint ochiq qolib
 * ketishi bilan tugaydi — va buni hech kim sezmaydi.
 *
 * ⚠️ TARTIB MUHIM: `JwtAuthGuard` → `PermissionsGuard`. Ikkinchisi
 * `request.user` ga tayanadi va uni birinchisi joylashtiradi.
 */

import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { ScheduleModule } from "@nestjs/schedule";

import { PrismaModule } from "./prisma/prisma.module";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";
import { JwtAuthGuard } from "./common/guards/jwt-auth.guard";
import { PermissionsGuard } from "./common/guards/permissions.guard";
import { AuditService } from "./common/audit.service";
import { AuthModule } from "./modules/auth/auth.module";
import { UsersModule } from "./modules/users/users.module";
import { TerritoryModule } from "./modules/territory/territory.module";
import { GroupsModule } from "./modules/groups/groups.module";
import { SignalsModule } from "./modules/signals/signals.module";
import { IssuesModule } from "./modules/issues/issues.module";
import { ReportsModule } from "./modules/reports/reports.module";
import { SettingsModule } from "./modules/settings/settings.module";
import { AuditModule } from "./modules/audit/audit.module";

@Module({
  imports: [
    PrismaModule,
    // Cron uchun — `signals.job.ts`.
    ScheduleModule.forRoot(),

    AuthModule,
    UsersModule,
    TerritoryModule,
    GroupsModule,
    IssuesModule,
    SignalsModule,
    ReportsModule,
    SettingsModule,
    AuditModule,
  ],
  providers: [
    AuditService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
