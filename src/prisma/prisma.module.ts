import { Global, Module } from "@nestjs/common";

import { PrismaService } from "./prisma.service";

/**
 * ⚠️ `@Global()`: `PrismaService` ni har modulga qo'lda import
 * qilish o'nlab joyda takrorlanadigan qatorga aylanardi va u har
 * yangi modulda unutilib, "Nest can't resolve dependencies" xatosini
 * berardi.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
