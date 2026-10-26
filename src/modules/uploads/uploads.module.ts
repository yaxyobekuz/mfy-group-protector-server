import { Module } from "@nestjs/common";

import { UploadsService } from "./uploads.service";

/**
 * ⚠️ CONTROLLER YO'Q: yuklash endpoint'i Mini App moduli ichida
 * (`/mobile/uploads`), chunki u `@CitizenOnly()` bo'lishi va fuqaro
 * kontekstida ishlashi kerak. Bu modul faqat SERVISNI beradi va uni
 * `MobileModule` import qiladi.
 */
@Module({
  providers: [UploadsService],
  exports: [UploadsService],
})
export class UploadsModule {}
