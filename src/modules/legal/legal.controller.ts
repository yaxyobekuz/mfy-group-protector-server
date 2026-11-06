/**
 * OMMAVIY HUJJAT SAHIFALARI — `/privacy`, `/terms`, `/delete-account`.
 *
 * ── NIMA UCHUN KERAK ──────────────────────────────────────────────────
 *
 * ⚠️ DO'KON TALABI: App Store ham, Google Play ham maxfiylik
 * siyosatining OCHIQ havolasini so'raydi, Google Play esa bundan
 * tashqari "hisobni o'chirish" yo'riqnomasi uchun ALOHIDA sahifa
 * talab qiladi (ilovani o'rnatmasdan ham ochilishi kerak). Havola
 * ishlamasa, ilova tekshiruvdan O'TMAYDI.
 *
 * ── NIMA UCHUN `/api` PREFIKSIDAN TASHQARIDA ──────────────────────────
 *
 * ⚠️ MANZIL ODAM O'QIYDIGAN JOYDA TURADI: u App Store/Play Console
 * formasiga yoziladi va ilova ichida ko'rsatiladi.
 * `api.e-murojaat.org/api/privacy` xunuk va "API" so'zi
 * tekshiruvchida "bu sahifa emas, endpoint" degan savol tug'dirardi.
 *
 * Shuning uchun marshrut `@Controller({ path: "", version: ... })` emas,
 * `main.ts` dagi `setGlobalPrefix` ISTISNOSI bilan ochiladi — aynan
 * shu uchta yo'l.
 *
 * ── NIMA UCHUN CONTROLLER, `useStaticAssets` EMAS ─────────────────────
 *
 * ⚠️ MANZILDA `.html` KENGAYTMASI BO'LMASLIGI KERAK: statik xizmat
 * `/privacy.html` ni beradi, do'kon formasiga esa `/privacy` yoziladi.
 * `extensions: ["html"]` bilan ishlatish mumkin, lekin o'shanda
 * `/privacy` VA `/privacy.html` — ikki xil manzilda AYNI sahifa
 * bo'lardi (SEO va "qaysi havolani berdik" degan chalkashlik).
 *
 * ⚠️ `dist` GA NUSXALASH KERAK EMAS: `nest build` da
 * `deleteOutDir: true` va `dist` ichidagi HTML har qurilishda
 * O'CHIB KETARDI (`assets` sozlamasi qo'shilmasa). Sahifalar
 * `<loyiha>/public/` da turadi va yo'l `__dirname` dan EMAS,
 * `process.cwd()` dan olinadi — ya'ni `src` dan ham, `dist` dan ham
 * ishga tushganda AYNI papka topiladi.
 *
 * ── `@Public()` ───────────────────────────────────────────────────────
 *
 * ⚠️ MAJBURIY: guard GLOBAL va hamma narsa standart holda YOPIQ.
 * Qo'yilmasa, sahifa 401 bilan ochilmasdi va do'kon tekshiruvi
 * aynan shu xatoga urilardi.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { Controller, Get, Header, Logger, NotFoundException } from "@nestjs/common";

import { Public } from "../../common/decorators";

/**
 * Sahifalar papkasi.
 *
 * ⚠️ `process.cwd()` DAN: yuqoridagi izohga qarang (`dist`/`src`
 * ikkisidan ham ayni papka).
 */
const PAGES_DIR = join(process.cwd(), "public");

/**
 * KESH MUDDATI — 1 soat.
 *
 * ⚠️ UZOQ QO'YILMAYDI: huquqiy matn tahrirlanganda yangi nusxa
 * KO'RINISHI kerak. Bir yillik kesh (odatdagi statik qoida) bilan
 * tuzatilgan siyosat brauzerlarda oylar davomida eski holatda
 * qolib ketardi — do'kon esa eski matnni ko'rsatardi.
 */
const CACHE_CONTROL = "public, max-age=3600";

@Controller()
export class LegalController {
  private readonly logger = new Logger(LegalController.name);

  @Public()
  @Get("privacy")
  @Header("Content-Type", "text/html; charset=utf-8")
  @Header("Cache-Control", CACHE_CONTROL)
  privacy(): Promise<string> {
    return this.page("privacy.html");
  }

  @Public()
  @Get("terms")
  @Header("Content-Type", "text/html; charset=utf-8")
  @Header("Cache-Control", CACHE_CONTROL)
  terms(): Promise<string> {
    return this.page("terms.html");
  }

  @Public()
  @Get("delete-account")
  @Header("Content-Type", "text/html; charset=utf-8")
  @Header("Cache-Control", CACHE_CONTROL)
  deleteAccount(): Promise<string> {
    return this.page("delete-account.html");
  }

  /**
   * UMUMIY USLUB FAYLI.
   *
   * ⚠️ ALOHIDA FAYL, SAHIFA ICHIDAGI `<style>` EMAS: `helmet` CSP
   * standart holda `style-src 'self'` qo'yadi va sahifa ichidagi
   * uslub blokini BLOKLAYDI. O'shanda sahifa ochiladi, lekin
   * BEZAKSIZ — xato esa faqat brauzer konsolida ko'rinib, server
   * logida jim qolardi (`apk-webview-debug` bilan ayni tuzoq).
   */
  @Public()
  @Get("legal.css")
  @Header("Content-Type", "text/css; charset=utf-8")
  @Header("Cache-Control", CACHE_CONTROL)
  css(): Promise<string> {
    return this.page("legal.css");
  }

  /**
   * ⚠️ NOM KODDA, SO'ROVDAN OLINMAYDI: `@Get(":page")` shaklida bo'lsa
   * `/..%2f..%2f.env` kabi yo'l hujumini tekshirish kerak bo'lardi.
   * Uchta sahifa — uchta metod, ya'ni hujum yuzasi UMUMAN yo'q
   * (`uploads.service.ts` dagi "asl nom yo'l sifatida
   * ishlatilmaydi" qoidasi bilan ayni mantiq).
   */
  private async page(fileName: string): Promise<string> {
    try {
      return await readFile(join(PAGES_DIR, fileName), "utf8");
    } catch (error) {
      /**
       * ⚠️ SABAB LOGGA: fayl yo'q bo'lsa (deploy'da `public/` papkasi
       * ko'chirilmagan) buni DARHOL bilish kerak — do'kon tekshiruvi
       * aynan shu havolani ochadi. Tashqariga esa oddiy 404 ketadi:
       * fayl tizimi yo'li oshkor qilinmaydi.
       */
      this.logger.error(
        `Hujjat sahifasi o'qilmadi (${fileName}) — "public/" papkasi joyidami? ${String(error)}`,
      );
      throw new NotFoundException("Sahifa topilmadi");
    }
  }
}
