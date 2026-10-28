import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";

import { IssuesModule } from "../issues/issues.module";
import { UploadsModule } from "../uploads/uploads.module";
import { BotCitizensController } from "./bot-citizens.controller";
import { BotCitizensService } from "./bot-citizens.service";
import { MobileAiService } from "./ai/mobile-ai.service";
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
  // ⚠️ `AuthCallbackController` OLIB TASHLANDI: u Telegram Login
  // Widget'dan qaytish sahifasi edi (`/auth/callback` → `vshtabi://`
  // deep link). Mobil ilova endi Google bilan kiradi va oradagi
  // brauzer ham, deep link ham YO'Q — sahifa kerak emas.
  // ⚠️ `BotCitizensController` SHU MODULDA: u `MobileService` ning
  // o'zini chaqiradi va murojaat mantig'i ikki joyda takrorlanmaydi.
  // Fuqaro botdan ham, mini-ilovadan ham AYNI yo'l bilan murojaat
  // yuboradi — faqat kirish usuli boshqacha.
  controllers: [MobileController, BotCitizensController],
  providers: [MobileService, MobileAuthService, MobileAiService, BotCitizensService],
})
export class MobileModule {}
