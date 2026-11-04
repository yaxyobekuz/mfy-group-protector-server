/**
 * SALOMATLIK TEKSHIRUVI — `GET /api/health`.
 *
 * ── NIMA UCHUN BOR ────────────────────────────────────────────────────
 *
 * Monitoring (UptimeRobot, Docker `healthcheck`, PM2) "server tirikmi"
 * degan savolga javob so'raydi. Usiz uzilishni FUQARO birinchi
 * sezardi.
 *
 * ⚠️ BAZA HAM TEKSHIRILADI, faqat "server javob berdi" EMAS: NestJS
 * baza uzilganda ham so'rovlarga javob beraveradi va o'shanda
 * monitoring "hammasi yaxshi" deb ko'rsatardi — murojaat yuborish
 * esa 500 qaytarardi. Ya'ni eng muhim uzilish turi sezilmasdi.
 *
 * ⚠️ TEKSHIRUV ARZON (`SELECT 1`): har daqiqada chaqiriladi va
 * og'ir so'rov bo'lsa monitoringning o'zi bazani yuklab qo'yardi.
 */

import { Controller, Get, HttpStatus, Logger, Res } from "@nestjs/common";
import type { Response } from "express";

import { Public } from "../../common/decorators";
import { PrismaService } from "../../prisma/prisma.service";

@Controller("health")
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * ⚠️ `@Public()`: monitoring tokensiz chaqiradi. Javobda MAXFIY
   * ma'lumot yo'q — versiya, baza nomi, ulanish satri va xato matni
   * CHIQMAYDI (ular tashqi odamga tizim haqida ma'lumot berardi).
   *
   * ⚠️ NOSOZLIKDA `503`, `200` EMAS: monitoring HOLAT KODIGA qaraydi,
   * javob ichidagi `"status": "down"` satriga emas. 200 qaytarilsa
   * uzilish umuman sezilmasdi.
   */
  @Public()
  @Get()
  async check(@Res() response: Response): Promise<void> {
    const startedAt = Date.now();

    try {
      // ⚠️ `$queryRaw` — eng arzon tekshiruv: ulanish pool'i tirikmi
      // va baza javob beradimi.
      await this.prisma.$queryRaw`SELECT 1`;

      response.status(HttpStatus.OK).json({
        status: "ok",
        database: "ok",
        // Javob vaqti — sekinlashuvni grafikda ko'rish uchun.
        latencyMs: Date.now() - startedAt,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      // ⚠️ SABAB LOGGA, JAVOBGA EMAS: Prisma xatosi ulanish satrini
      // va baza nomini oshkor qiladi (`all-exceptions.filter.ts`
      // bilan ayni qoida).
      this.logger.error(`Health: baza javob bermadi — ${String(error)}`);

      response.status(HttpStatus.SERVICE_UNAVAILABLE).json({
        status: "down",
        database: "down",
        timestamp: new Date().toISOString(),
      });
    }
  }
}
