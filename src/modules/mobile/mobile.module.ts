import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";

import { IssuesModule } from "../issues/issues.module";
import { UploadsModule } from "../uploads/uploads.module";
import { MobileAiService } from "./ai/mobile-ai.service";
import { AuthCallbackController } from "./auth-callback.controller";
import { MobileAuthService } from "./mobile-auth.service";
import { MobileController } from "./mobile.controller";
import { MobileService } from "./mobile.service";

/**
 * MINI APP MODULI — fuqaro murojaatlari.
 *
 * ⚠️ `JwtModule.register({})` — SIR BU YERDA BERILMAYDI: har
 * `signAsync`/`verifyAsync` da `MOBILE_JWT_SECRET` ALOHIDA uzatiladi
 * (xodim sirlari bilan ayni qoida — `auth.module.ts`).
 *
 * ⚠️ `IssuesModule` IMPORT QILINADI, kod ko'chirilmaydi: `publicNo`
 * generatsiyasi va xabar yetkazish bitta joyda qoladi.
 */
@Module({
  imports: [JwtModule.register({}), IssuesModule, UploadsModule],
  // ⚠️ `AuthCallbackController` — `/api` PREFIKSIDAN TASHQARIDA
  // (`main.ts` dagi `setGlobalPrefix` istisnosi): Telegram'ga
  // berilgan `return_to` aynan `/auth/callback`.
  controllers: [MobileController, AuthCallbackController],
  providers: [MobileService, MobileAuthService, MobileAiService],
})
export class MobileModule {}
