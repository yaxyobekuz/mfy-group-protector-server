/**
 * SERVER ISHGA TUSHISHI.
 *
 * ⚠️ `env.config.ts` ENG BIRINCHI IMPORT QILINADI (bilvosita, `app.
 * module` orqali ham bo'lsa): majburiy sozlama yo'q bo'lsa jarayon
 * KO'TARILMAYDI. Yarim sozlangan server "ishlayapti" deb turib, har
 * so'rovda 500 qaytarishdan ko'ra yaxshi.
 */

import { Logger, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import helmet from "helmet";

import { AppModule } from "./app.module";
import { env } from "./config/env.config";

async function bootstrap(): Promise<void> {
  const logger = new Logger("Bootstrap");

  const app = await NestFactory.create(AppModule, {
    // ⚠️ `debug` ISHLAB CHIQARISHDA O'CHIRILADI: u har so'rovni
    // yozib, log hajmini portlatardi.
    logger: env.isProduction
      ? ["error", "warn", "log"]
      : ["error", "warn", "log", "debug", "verbose"],
  });

  app.use(helmet());

  app.setGlobalPrefix("api");

  // ⚠️ `credentials: true` + ANIQ MANZIL. `*` ishlatilmaydi:
  // brauzer `*` + credentials birikmasini RAD ETADI va xato faqat
  // brauzer konsolida ko'rinib, server logida jim qolardi.
  app.enableCors({
    origin: env.corsOrigins,
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
