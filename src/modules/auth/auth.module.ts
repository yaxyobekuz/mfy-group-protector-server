import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";

import { AuditService } from "../../common/audit.service";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";

/**
 * ⚠️ `JwtModule.register({})` — SIR BU YERDA BERILMAYDI. Har
 * `signAsync`/`verifyAsync` chaqiruvida ALOHIDA sir uzatiladi
 * (access/refresh), chunki ular BOSHQA. Modulda bitta sir
 * qo'yilsa, chaqiruvda uni berishni unutgan kod JIMGINA noto'g'ri
 * sir bilan ishlab ketardi.
 */
@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, AuditService],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
