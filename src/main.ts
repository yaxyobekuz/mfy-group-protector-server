/**
 * SERVER ISHGA TUSHISHI.
 *
 * ⚠️ `env.config.ts` ENG BIRINCHI IMPORT QILINADI (bilvosita, `app.
 * module` orqali ham bo'lsa): majburiy sozlama yo'q bo'lsa jarayon
 * KO'TARILMAYDI. Yarim sozlangan server "ishlayapti" deb turib, har
 * so'rovda 500 qaytarishdan ko'ra yaxshi.
 */

import { timingSafeEqual } from "node:crypto";

import { Logger, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import type { NextFunction, Request, Response } from "express";
import helmet from "helmet";

import { AppModule } from "./app.module";
import { env } from "./config/env.config";
import { UPLOADS_DIR } from "./modules/uploads/uploads.constants";

/** API hujjati manzili (`/api` prefiksi ICHIDA — u sahifa emas, vosita). */
const SWAGGER_PATH = "api/docs";

/**
 * API HUJJATI — `/api/docs`.
 *
 * ── NIMA UCHUN SHARTLI ────────────────────────────────────────────────
 *
 * ⚠️ HUJJAT BUTUN API TUZILMASINI OSHKOR QILADI: endpoint ro'yxati,
 * DTO maydonlari, ruxsat nomlari va kirish yo'llari. Tashqi odam
 * uchun bu "qaysi eshiklar bor" degan to'liq xarita.
 *
 * ⚠️ ISHLAB CHIQISHDA OCHIQ, `production` DA YOPIQ. Teskarisi
 * ("kerak bo'lsa yopamiz") amalda ochiq qolib ketishi bilan
 * tugaydi — va buni hech kim sezmaydi, chunki hujjat ishlab
 * turganda hech narsa buzilmaydi.
 *
 * ⚠️ `production` DA OCHISH UCHUN IKKI SHART: `SWAGGER_ENABLED=true`
 * VA parol (`SWAGGER_USER`/`SWAGGER_PASSWORD`). Parol bo'lmasa
 * hujjat ULANMAYDI va logga sabab chiqadi — "yoqdim, lekin parolni
 * unutdim" holati ochiq hujjat bo'lib qolardi.
 */
function setupSwagger(app: NestExpressApplication, logger: Logger): void {
  // ⚠️ ISHLAB CHIQISHDA SHARTSIZ OCHIQ (qulaylik), ishlab
  // chiqarishda esa ataylab yoqilishi kerak.
  const wanted = !env.isProduction || env.swagger.enabled;
  if (!wanted) return;

  const needsPassword = env.isProduction;
  const { user, password } = env.swagger;

  if (needsPassword && (!user || !password)) {
    // ⚠️ JIM O'TMAYDI: yoqilgan, lekin parolsiz qolgan hujjat
    // tashqariga ochiq bo'lardi. Shuning uchun ULANMAYDI va sabab
    // logda ko'rinadi.
    logger.error(
      "SWAGGER_ENABLED=true, lekin SWAGGER_USER/SWAGGER_PASSWORD yo'q — hujjat OCHILMADI",
    );
    return;
  }

  if (needsPassword) {
    /**
     * ⚠️ PAROL TEKSHIRUVI SWAGGER'DAN OLDIN, MIDDLEWARE sifatida:
     * `JwtAuthGuard` bu yo'lga TA'SIR QILMAYDI (Swagger marshrutlari
     * Nest controller'lari emas, Express darajasida ulanadi), ya'ni
     * guard'ga tayanib bo'lmaydi.
     *
     * ⚠️ `Basic` auth YETARLI: hujjat — ichki vosita va brauzer
     * parol so'rash oynasini o'zi chiqaradi. Sessiya, cookie va
     * kirish sahifasi bu yerda ortiqcha murakkablik bo'lardi.
     */
    const expected =
      "Basic " + Buffer.from(`${user}:${password}`).toString("base64");

    /**
     * ⚠️ BOSHIDA `/` MAJBURIY: Express `app.use("api/docs", ...)` ni
     * yo'l sifatida TANIMAYDI va middleware JIM ISHLAMAY qolardi —
     * hujjat esa parolsiz ochiq bo'lib ko'rinardi. (`SwaggerModule.
     * setup` esa aksincha, slashsiz yo'lni qabul qiladi — shuning
     * uchun ikkisi bir xil ko'rinib, farqi sezilmaydi.)
     *
     * ⚠️ `docs-json` / `docs-yaml` HAM YOPILADI: Swagger sxemani
     * ALOHIDA manzillarda ham beradi va faqat `/api/docs` ni
     * yopish butun API tavsifini ochiq qoldirardi. `app.use` yo'l
     * PREFIKSI bo'yicha ishlaydi, lekin `docs-json` `docs` ning
     * prefiksi EMAS (`/docs` dan keyin `-` keladi) — shuning
     * uchun ular qo'lda sanab o'tiladi.
     */
    const guardedPaths = [
      `/${SWAGGER_PATH}`,
      `/${SWAGGER_PATH}-json`,
      `/${SWAGGER_PATH}-yaml`,
    ];

    app.use(guardedPaths, (req: Request, res: Response, next: NextFunction) => {
      const provided = req.headers.authorization ?? "";

      // ⚠️ DOIMIY VAQTLI TAQQOSLASH (`jwt-auth.guard.ts` bilan ayni
      // sabab): oddiy `!==` javob vaqti bilan parolni bayt-bayt
      // topish imkonini berardi. Uzunlik AVVAL tekshiriladi —
      // `timingSafeEqual` turli uzunlikda XATO OTADI.
      const a = Buffer.from(provided);
      const b = Buffer.from(expected);
      const ok = a.length === b.length && timingSafeEqual(a, b);

      if (!ok) {
        // ⚠️ `WWW-Authenticate` MAJBURIY: usiz brauzer parol
        // oynasini KO'RSATMAYDI va sahifa shunchaki 401 bo'lib
        // qolardi.
        res.setHeader("WWW-Authenticate", 'Basic realm="API hujjati"');
        res.status(401).send("Kirish rad etildi");
        return;
      }

      next();
    });
  }

  const config = new DocumentBuilder()
    .setTitle("Viloyat shtabi — API")
    .setDescription(
      "MFY guruhlaridagi muammolarni aniqlash tizimi va fuqaro murojaatlari",
    )
    .setVersion("0.1.0")
    // ⚠️ UCH XIL KIRISH USULI — ular ALOHIDA tushunchalar
    // (`decorators/index.ts`): xodim tokeni, fuqaro tokeni va bot
    // kaliti. Bitta "Authorization" sifatida ko'rsatilsa, hujjat
    // o'qigan odam ularni o'zaro almashtirib ishlatish mumkin deb
    // o'ylardi.
    .addBearerAuth({ type: "http", scheme: "bearer" }, "xodim")
    .addBearerAuth({ type: "http", scheme: "bearer" }, "fuqaro")
    .addApiKey({ type: "apiKey", name: "X-Bot-Key", in: "header" }, "bot")
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(SWAGGER_PATH, app, document);

  logger.log(
    `API hujjati: ${SWAGGER_PATH}${needsPassword ? " (parol bilan)" : ""}`,
  );
}

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
  /**
   * ── CSP OMMAVIY SAHIFALARNI BUZMASLIGI KERAK ─────────────────────
   *
   * ⚠️ HUJJAT SAHIFALARI (`/privacy`, `/terms`, `/delete-account`)
   * HAQIQIY HTML: ularni do'kon tekshiruvchisi brauzerda ochadi va
   * bezaksiz sahifa "tayyor emas" taassurotini qoldirardi.
   *
   * Shuning uchun siyosat ANIQ yozilgan, standartga tashlab
   * qo'yilmagan:
   *
   *   styleSrc 'self'     → `/legal.css` YUKLANADI (sahifa ICHIDAGI
   *                          `<style>` esa YO'Q — shuning uchun
   *                          uslub alohida faylda, `legal.css`
   *                          izohiga qarang)
   *   imgSrc  'self' data: → sahifalarda rasm yo'q, lekin Swagger
   *                          belgichalari `data:` dan keladi
   *   scriptSrc 'self'     → sahifalarda skript UMUMAN YO'Q
   *
   * ⚠️ `upgrade-insecure-requests` O'CHIRILADI: u standart holda
   * yoqilgan va ishlab chiqishda `http://localhost` ga kelgan
   * so'rovni HTTPS ga majburlab, sahifani ochilmas qilardi. Ishlab
   * chiqarishda HTTPS baribir nginx darajasida majburlanadi.
   *
   * ⚠️ `crossOriginResourcePolicy` O'CHIRILADI: helmet standart
   * holda `same-origin` qo'yadi va u Mini App (boshqa domen/tunnel)
   * yuklagan `/uploads/...` surat so'rovini bloklardi. Fayllar
   * ommaviy dalil — ularni boshqa domendan ko'rsatish KERAK.
   */
  const helmetMiddleware = helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:"],
        // ⚠️ SAHIFALAR TASHQI MANZILGA SO'ROV YUBORMAYDI.
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: null,
      },
    },
  });

  /**
   * ⚠️ SWAGGER CSP DAN CHIQARILADI: Swagger UI o'z sahifasini ICHKI
   * skript va ichki uslub bilan quradi, ya'ni yuqoridagi qat'iy
   * siyosat uni BO'SH SAHIFA qilib qo'yardi — xato esa faqat
   * brauzer konsolida ko'rinib, server logida jim qolardi (bu
   * tuzoqqa loyihada bir marta tushilgan: `helmet` CSP mini-ilovaning
   * ichki skriptini bloklagan).
   *
   * ⚠️ XAVFSIZLIKNI PASAYTIRMAYDI: hujjat `production` da parol
   * bilan yopiq (`setupSwagger`) va standart holda umuman o'chiq.
   * Qolgan BARCHA yo'llar qat'iy siyosat ostida qoladi.
   */
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith(`/${SWAGGER_PATH}`)) return next();
    return helmetMiddleware(req, res, next);
  });

  /**
   * ⚠️ UCHTA ISTISNO — OMMAVIY HUJJAT SAHIFALARI.
   *
   * App Store ham, Google Play ham maxfiylik siyosatining OCHIQ
   * havolasini so'raydi, Google Play esa "hisobni o'chirish"
   * yo'riqnomasi uchun ALOHIDA sahifa talab qiladi. Havolalar
   * do'kon formasiga va ilova ichiga yoziladi, ya'ni ODAM
   * O'QIYDIGAN manzil bo'lishi kerak:
   *
   *     nazoratchi-ai-api.mysrv.uz/privacy        ✓
   *     nazoratchi-ai-api.mysrv.uz/api/privacy    ✗ ("API" — sahifa emas)
   *
   * ⚠️ `legal.css` HAM ISTISNODA: sahifa uni `/legal.css` deb
   * so'raydi va prefiks ostida qolsa, bezak YUKLANMASDI — xato esa
   * faqat brauzer konsolida ko'rinardi.
   *
   * ⚠️ RO'YXAT QO'LDA: `exclude` naqsh qabul qiladi, lekin keng
   * naqsh (`/(.*)`) butun API ni prefiksdan chiqarib yuborardi.
   * Uchta aniq yo'l — hujum yuzasi ham, xato imkoni ham yo'q
   * (`legal.controller.ts` izohi).
   *
   * ⚠️ Avval `/auth/callback` ham chiqarilgan edi (Telegram Login
   * Widget'dan qaytish sahifasi) — mobil ilova Google'ga o'tgach u
   * yo'l OLIB TASHLANDI va qaytarilmaydi.
   */
  app.setGlobalPrefix("api", {
    exclude: ["privacy", "terms", "delete-account", "legal.css"],
  });

  // ── YUKLANGAN FAYLLAR ────────────────────────────────────────────
  //
  // ⚠️ `/uploads` — `/api` PREFIKSIDAN TASHQARIDA: ilova `fileUrl()`
  // bilan to'g'ridan-to'g'ri `/uploads/...` ni oladi. Fayllar DISKDA,
  // bazada emas (`uploads.service.ts`).
  app.useStaticAssets(UPLOADS_DIR, { prefix: "/uploads" });

  /**
   * ⚠️ `credentials: true` + ANIQ MANZIL. `*` ishlatilmaydi:
   * brauzer `*` + credentials birikmasini RAD ETADI va xato faqat
   * brauzer konsolida ko'rinib, server logida jim qolardi.
   *
   * ⚠️ MINI APP MANZILI QO'SHILADI: ilova proksi rejimida bir xil
   * manzildan kelsa CORS kerak emas, lekin to'g'ridan-to'g'ri
   * ulanishda (dev) kerak.
   *
   * ── MUSTAQIL ILOVA (APK) MANZILLARI ─────────────────────────────
   *
   * ⚠️ CAPACITOR ILOVASI `https://localhost` DAN KELADI (Android)
   * yoki `capacitor://localhost` (iOS) — bu WebView ichidagi
   * O'RNATILGAN manzil, ya'ni haqiqiy sayt emas.
   *
   * Ular ro'yxatda bo'lmasa, APK ichidagi HAR SO'ROV brauzer
   * tomonidan CORS bilan BLOKLANADI. Xato esa faqat WebView
   * konsolida ko'rinadi va server logida UMUMAN qolmaydi
   * (so'rov serverga yetib keladi, javob esa brauzerda
   * tashlanadi) — shuning uchun uni topish juda qiyin:
   * tashqaridan "ilova javob bermayapti" bo'lib ko'rinadi.
   *
   * ⚠️ KODDA, SOZLAMADA EMAS: bu manzillar Capacitor'ning
   * o'zgarmas qiymatlari (`capacitor.config.ts#androidScheme`
   * bilan bog'liq) va ularni `.env` ga chiqarish har deployda
   * unutilishi mumkin bo'lgan yana bitta qadam bo'lardi.
   */
  const NATIVE_APP_ORIGINS = [
    "https://localhost", // Android (androidScheme: "https")
    "http://localhost", // Android (androidScheme: "http")
    "capacitor://localhost", // iOS
  ];

  app.enableCors({
    origin: [
      ...env.corsOrigins,
      ...(env.mobileAppUrl ? [env.mobileAppUrl] : []),
      ...NATIVE_APP_ORIGINS,
    ],
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

  // ── API HUJJATI (Swagger) ────────────────────────────────────────
  setupSwagger(app, logger);

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
