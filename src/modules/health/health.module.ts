import { Module } from "@nestjs/common";

import { HealthController } from "./health.controller";

/**
 * SALOMATLIK MODULI — monitoring uchun.
 *
 * ⚠️ `PrismaModule` IMPORT QILINMAYDI: u `@Global()`
 * (`prisma.module.ts`), ya'ni `PrismaService` hamma joyda mavjud.
 */
@Module({ controllers: [HealthController] })
export class HealthModule {}
