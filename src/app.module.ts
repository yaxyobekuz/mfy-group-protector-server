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
import { ThrottlerModule } from "@nestjs/throttler";

import { PrismaModule } from "./prisma/prisma.module";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";
import { JwtAuthGuard } from "./common/guards/jwt-auth.guard";
import { PermissionsGuard } from "./common/guards/permissions.guard";
import { AppThrottlerGuard } from "./common/guards/throttler.guard";
import { THROTTLER_CONFIG } from "./common/throttle";
import { AuditService } from "./common/audit.service";
import { AuthModule } from "./modules/auth/auth.module";
import { UsersModule } from "./modules/users/users.module";
import { TerritoryModule } from "./modules/territory/territory.module";
import { GroupsModule } from "./modules/groups/groups.module";
import { SecurityModule } from "./modules/security/security.module";
import { SignalsModule } from "./modules/signals/signals.module";
import { IssuesModule } from "./modules/issues/issues.module";
import { ReportsModule } from "./modules/reports/reports.module";
import { SettingsModule } from "./modules/settings/settings.module";
import { AuditModule } from "./modules/audit/audit.module";
import { MobileModule } from "./modules/mobile/mobile.module";
import { AnnouncementsModule } from "./modules/announcements/announcements.module";
import { CitizensModule } from "./modules/citizens/citizens.module";
import { HealthModule } from "./modules/health/health.module";
import { LegalModule } from "./modules/legal/legal.module";

@Module({
  imports: [
    PrismaModule,
    // Cron uchun — `signals.job.ts`.
    ScheduleModule.forRoot(),

    /**
     * SO'ROV TEZLIGI CHEGARASI — qiymatlar `common/throttle.ts` da.
     *
     * ⚠️ XOTIRADA SANALADI (standart saqlagich): bitta jarayon uchun
     * yetarli. IKKI NUSXA ishga tushirilsa (PM2 cluster), har
     * nusxa O'Z hisobini yuritadi va amaldagi chegara ikki barobar
     * bo'ladi — buni bilib qo'yish kerak. Redis saqlagichi faqat
     * shunda kerak bo'ladi.
     */
    ThrottlerModule.forRoot(THROTTLER_CONFIG),

    AuthModule,
    UsersModule,
    TerritoryModule,
    GroupsModule,
    SecurityModule,
    IssuesModule,
    SignalsModule,
    ReportsModule,
    SettingsModule,
    AuditModule,
    MobileModule,
    AnnouncementsModule,
    CitizensModule,
    // Ommaviy sahifalar (`/privacy`, `/terms`, `/delete-account`) va
    // monitoring (`/api/health`) — ikkisi ham `@Public()`.
    LegalModule,
    HealthModule,
  ],
  providers: [
    AuditService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    /**
     * ⚠️ TEZLIK GUARD'I ENG OXIRIDA: u `request.citizen`/`request.user`
     * ga tayanib "kim bo'yicha sanash" ni hal qiladi
     * (`throttler.guard.ts`), ularni esa `JwtAuthGuard` joylashtiradi.
     * Oldinga qo'yilsa, hamma so'rov IP bo'yicha sanalib, NAT ortidagi
     * fuqarolar bir-birini bloklardi — va bu jimgina sodir bo'lardi.
     */
    { provide: APP_GUARD, useClass: AppThrottlerGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
