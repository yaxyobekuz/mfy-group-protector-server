import { Module } from "@nestjs/common";

import { AuditService } from "../../common/audit.service";
import { AuthModule } from "../auth/auth.module";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";

/**
 * ⚠️ `AuthModule` IMPORT QILINADI: parol hash va sessiyani bekor
 * qilish `AuthService` da. Bu mantiqni bu yerda takrorlash argon2
 * parametrlarini IKKI JOYDA saqlashga olib kelardi — va ular
 * ajralib ketganda eski parollar tekshirilmay qolardi.
 */
@Module({
  imports: [AuthModule],
  controllers: [UsersController],
  providers: [UsersService, AuditService],
  exports: [UsersService],
})
export class UsersModule {}
