/**
 * SERVER ISHGA TUSHISHI.
 *
 * ⚠️ `env.config.ts` ENG BIRINCHI IMPORT QILINADI (bilvosita, `app.
 * module` orqali ham bo'lsa): majburiy sozlama yo'q bo'lsa jarayon
 * KO'TARILMAYDI. Yarim sozlangan server "ishlayapti" deb turib, har
 * so'rovda 500 qaytarishdan ko'ra yaxshi.
 */

import { join } from "node:path";

import { Logger, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import helmet from "helmet";

import { AppModule } from "./app.module";
import { env } from "./config/env.config";
import { UPLOADS_DIR } from "./modules/uploads/uploads.constants";

async function bootstrap(): Promise<void> {
  const logger = new Logger("Bootstrap");

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // ⚠️ `debug` ISHLAB CHIQARISHDA O'CHIRILADI: u har so'rovni
    // yozib, log hajmini portlatardi.
    logger: env.isProduction
      ? ["error", "warn", "log"]
      : ["error", "warn", "log", "debug", "verbose"],
  });

  // ⚠️ `crossOriginResourcePolicy` O'CHIRILADI: helmet standart holda
  // `same-origin` qo'yadi va u Mini App (boshqa domen/tunnel) yuklagan
  // `/uploads/...` surат so'rovini bloklardi. Fayllar ommaviy dalil —
  // ularni boshqa domendan ko'rsatish KERAK.
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));

  /**
   * ⚠️ `/auth/callback` PREFIKSDAN CHIQARILADI: Telegram kirishdan
   * keyin aynan SHU manzilga qaytaradi (`return_to`) va u mustaqil
   * ilovani `vshtabi://` deep link bilan uyg'otadi.
   *
   * Prefiksga kiritilsa manzil `/api/auth/callback` bo'lib qolardi
   * va Telegram'dan qaytgan fuqaro 404 sahifada to'xtardi —
   * kirish esa hech qachon tugallanmasdi.
   */
  app.setGlobalPrefix("api", {
    exclude: ["/auth/callback"],
  });

  // ── YUKLANGAN FAYLLAR ────────────────────────────────────────────
  //
  // ⚠️ `/uploads` — `/api` PREFIKSIDAN TASHQARIDA: ilova `fileUrl()`
  // bilan to'g'ridan-to'g'ri `/uploads/...` ni oladi. Fayllar DISKDA,
  // bazada emas (`uploads.service.ts`).
  app.useStaticAssets(UPLOADS_DIR, { prefix: "/uploads" });

  // ⚠️ `credentials: true` + ANIQ MANZIL. `*` ishlatilmaydi:
  // brauzer `*` + credentials birikmasini RAD ETADI va xato faqat
  // brauzer konsolida ko'rinib, server logida jim qolardi.
  //
  // ⚠️ MINI APP MANZILI QO'SHILADI: ilova proksi rejimida bir xil
  // manzildan kelsa CORS kerak emas, lekin to'g'ridan-to'g'ri
  // ulanishda (dev) kerak.
  app.enableCors({
    origin: env.mobileAppUrl
      ? [...env.corsOrigins, env.mobileAppUrl]
      : env.corsOrigins,
    credentials: true,
    exposedHeaders: ["X-Total-Count"],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      // ⚠️ `whitelist` + `forbidNonWhitelisted`: DTO'da e'lon
      // qilinmagan maydon RAD ETILADI, jim tashlanmaydi. Jim
      // tashlansa, nomi xato yozilgan maydon ("mahalla_id" o'rniga
      // "mahallaId") e'tiborsiz qolib, so'rov "muvaffaqiyatli"
      // tugardi — lekin hech narsa o'zgarmasdi.
      whitelist: true,
      forbidNonWhitelisted: true,
      // Query/param satrlarini DTO turlariga keltiradi.
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  // ⚠️ `SIGTERM` USHLANADI: Docker/PM2 qayta ishga tushirganda
  // ochiq so'rovlar tugatiladi va Prisma ulanishi yopiladi
  // (`PrismaService#onModuleDestroy`). Aks holda baza ulanishlari
  // "osilib" qolardi.
  app.enableShutdownHooks();

  await app.listen(env.port);

  logger.log(`Server: http://localhost:${env.port}/api`);
  logger.log(`Muhit: ${env.nodeEnv}`);
  logger.log(`CORS: ${env.corsOrigins.join(", ")}`);

  if (!env.openaiApiKey) {
    logger.warn("OPENAI_API_KEY yo'q — guruh xabarlari to'planadi, tahlil qilinmaydi");
  }
}

void bootstrap();
