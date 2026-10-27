/**
 * TELEGRAM KIRISHIDAN QAYTISH SAHIFASI (`/auth/callback`).
 *
 * ── NIMA UCHUN SERVERDA, ILOVADA EMAS ─────────────────────────────────
 *
 * ⚠️ TELEGRAM `redirect_url` SIFATIDA FAQAT HTTPS QABUL QILADI —
 * `vshtabi://` kabi maxsus sxemani RAD ETADI. Ya'ni oqim ikki
 * qadamli bo'lishi SHART:
 *
 *   Telegram → https://<domen>/auth/callback → vshtabi://auth?... → ilova
 *
 * Bu sahifa mustaqil ilova (APK) uchun KERAK va u mini-ilovaning
 * statik eksportida ham bor. Lekin `nazoratchi-ai-api.mysrv.uz`
 * domeni FAQAT SERVERNI xizmat qiladi — u yerda Next ilovasi yo'q
 * va manzil 404 berardi ("Cannot GET /auth/callback").
 *
 * Shuning uchun sahifa SERVERNING O'ZIDAN beriladi: qo'shimcha
 * deploy, alohida domen yoki statik hosting KERAK EMAS.
 *
 * ⚠️ `/api` PREFIKSIDAN TASHQARIDA (`@Controller` da to'liq yo'l):
 * Telegram'ga berilgan `return_to` aynan `/auth/callback` va
 * `/api/auth/callback` EMAS.
 *
 * ⚠️ IMZO BU YERDA TEKSHIRILMAYDI va tekshirilmasligi kerak: bu
 * sahifa maydonlarni faqat ILOVAGA UZATADI, token esa ilova
 * `POST /api/mobile/auth/telegram-login` orqali oladi — imzo
 * o'sha yerda tekshiriladi.
 *
 * ⚠️ CSP SHU YO'LDA ALOHIDA QO'YILADI (`nonce`). `main.ts` dagi
 * `helmet()` standart holda `script-src 'self'` beradi va u
 * SAHIFANING ICHKI SKRIPTINI BLOKLAYDI — ya'ni deep link
 * umuman ishga tushmaydi. Buzilish JIM: uslublar (`style-src`
 * da `'unsafe-inline'` bor) ishlayverdi, sahifa chiroyli
 * ko'rindi va "Ilovaga qaytilmoqda…" da ABADIY qotib qoldi;
 * zaxira tugmasi ham 800 ms da chiqmadi, chunki uni
 * ko'rsatadigan kod ham o'sha bloklangan skript ichida.
 * Server logida hech narsa yo'q edi — xato faqat brauzer
 * konsolida ("Executing inline script violates ... CSP").
 *
 * Shuning uchun bu javobga O'Z CSP'si qo'yiladi: faqat shu
 * `nonce` ga ega skript/uslub ishlaydi, qolgan hamma narsa
 * taqiqlanadi (`default-src 'none'`). Ya'ni himoya
 * BO'SHASHTIRILMAYDI — aksincha, sahifaga aniq moslanadi.
 *
 * ⚠️ `'unsafe-inline'` QO'YILMAYDI: `nonce` bilan birga u
 * brauzer tomonidan E'TIBORSIZ qoldiriladi (spetsifikatsiya),
 * ya'ni foyda bermaydi — faqat himoyani bo'shashtirgandek
 * ko'rinib, chalg'itardi.
 */

import { randomBytes } from "node:crypto";

import { Controller, Get, Header, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";

import { Public } from "../../common/decorators";

/** Ilovani uyg'otadigan deep link sxemasi (`AndroidManifest.xml` bilan AYNI). */
const APP_SCHEME = "vshtabi";

/**
 * ⚠️ HTML QO'LDA YIG'ILADI, SHABLON MOTORI QO'SHILMAYDI: bu
 * loyihadagi YAGONA sahifa va uning uchun butun bir ko'rinish
 * qatlamini (hbs/ejs) olib kirish ortiqcha bog'liqlik bo'lardi.
 *
 * ⚠️ MAYDONLAR `JSON.stringify` BILAN JOYLANADI: ular Telegram'dan
 * keladi va to'g'ridan-to'g'ri HTML'ga yozilsa, `<` belgisi
 * sahifani buzishi (yoki skript kiritilishi) mumkin edi.
 */
const page = (query: string, nonce: string): string => `<!DOCTYPE html>
<html lang="uz">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ilovaga qaytish</title>
<style nonce="${nonce}">
  :root { color-scheme: light dark; }
  body {
    margin: 0; min-height: 100vh;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 20px;
    padding: 32px; text-align: center;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    background: #f1f5f9; color: #0f1a15;
  }
  @media (prefers-color-scheme: dark) {
    body { background: #121316; color: #f5f5f5; }
    .hint { color: #a1a1aa; }
  }
  h1 { font-size: 20px; margin: 0; }
  .hint { font-size: 14px; color: #64748b; margin: 0; max-width: 20rem; line-height: 1.5; }
  a.btn {
    display: inline-block; text-decoration: none;
    background: #1d7a4d; color: #fff;
    padding: 14px 28px; border-radius: 14px;
    font-size: 15px; font-weight: 600;
  }
  /* Zaxira tugma — asosiysidan sokinroq. */
  a.btn.alt {
    background: transparent; color: #1d7a4d;
    border: 1px solid #1d7a4d; padding: 12px 24px;
    font-size: 14px;
  }
  @media (prefers-color-scheme: dark) {
    a.btn.alt { color: #2f9a66; border-color: #2f9a66; }
  }
</style>
</head>
<body>
  <h1 id="title">Ilovaga qaytilmoqda…</h1>
  <p class="hint" id="hint">Bir lahza kuting.</p>
  <a class="btn" id="open" style="display:none">Ilovani ochish</a>
  <a class="btn alt" id="alt" style="display:none">Boshqa usulda ochish</a>

<script nonce="${nonce}">
(function () {
  /*
   * TELEGRAM MA'LUMOTNI IKKI XIL KO'RINISHDA QAYTARADI va
   * ikkalasi ham qo'llab-quvvatlanishi SHART:
   *
   *   1) #tgAuthResult=<base64 JSON>   <-- ODATDAGI YO'L
   *      {"id":..,"first_name":..,"hash":..} base64 ga o'ralgan
   *      va FRAGMENTDA (#) keladi.
   *
   *   2) ?id=..&hash=..                <-- ba'zi widget versiyalari
   *
   * FRAGMENT SERVERGA UMUMAN YUBORILMAYDI (brauzer uni
   * jo'natmaydi) - shuning uchun uni FAQAT shu yerda, mijoz
   * tomonida o'qish mumkin. Server tomonidagi query esa
   * ikkinchi holat uchun zaxira bo'lib qoladi.
   */
  var query = ${JSON.stringify(query)};

  var hash = window.location.hash || "";
  var marker = "tgAuthResult=";
  var at = hash.indexOf(marker);

  if (at !== -1) {
    try {
      var raw = hash.slice(at + marker.length);
      // Fragmentdagi keyingi parametrlarni kesib tashlaymiz.
      var amp = raw.indexOf("&");
      if (amp !== -1) raw = raw.slice(0, amp);

      // ⚠️ base64url → base64: Telegram - va _ ishlatishi
      // mumkin va atob ularni tushunmay yiqilardi.
      var b64 = decodeURIComponent(raw).replace(/-/g, "+").replace(/_/g, "/");
      while (b64.length % 4) b64 += "=";

      var data = JSON.parse(atob(b64));

      /*
       * ⚠️ MAYDONLAR O'ZGARTIRILMAY, BARCHASI uzatiladi: imzo
       * (hash) ular ustidan hisoblangan va bittasi tushib
       * qolsa yoki qo'shilsa, server imzoni tasdiqlay olmasdi.
       */
      var parts = [];
      for (var key in data) {
        if (!Object.prototype.hasOwnProperty.call(data, key)) continue;
        if (data[key] === null || data[key] === undefined) continue;
        parts.push(encodeURIComponent(key) + "=" + encodeURIComponent(data[key]));
      }
      if (parts.length) query = parts.join("&");
    } catch (e) {
      /* Format kutilmagan — pastdagi xato matni ko'rsatiladi. */
    }
  }

  if (!query) {
    document.getElementById("title").textContent = "Kirish ma'lumotlari topilmadi";
    document.getElementById("hint").textContent =
      "Ilovaga qaytib, qaytadan urinib ko'ring.";
    return;
  }

  var link = "${APP_SCHEME}://auth?" + query;

  /*
   * ANDROID UCHUN "intent://" ZAXIRA YO'LI.
   *
   * Chrome oddiy maxsus sxemani (vshtabi://) ba'zan JIM
   * e'tiborsiz qoldiradi — ayniqsa o'tish foydalanuvchi
   * bosishidan kelib chiqmagan bo'lsa. "intent://" esa
   * AYNAN shu holat uchun mo'ljallangan rasmiy mexanizm va
   * u ustma-ust ishlaydi: ilova bo'lsa ochadi, bo'lmasa
   * "browser_fallback_url" ga tushadi.
   *
   * S.browser_fallback_url BERILMAYDI: bo'lmasa Chrome shu
   * sahifada qoladi va fuqaro tugmani qayta bosa oladi.
   */
  var intentLink =
    "intent://auth?" + query +
    "#Intent;scheme=${APP_SCHEME};package=uz.mysrv.nazoratchi;end";

  var isAndroid = /android/i.test(navigator.userAgent);
  var primary = isAndroid ? intentLink : link;

  var button = document.getElementById("open");
  button.href = primary;

  // Ilovani darhol uyg'otishga urinish.
  window.location.href = primary;

  /*
   * ⚠️ TUGMA DARHOL KO'RSATILADI (800 ms), kutilmaydi:
   * Chrome FOYDALANUVCHI BOSMAGAN o'tishni bloklashi mumkin
   * va o'shanda ekran "qaytilmoqda…" holatida abadiy qotib
   * qolardi — fuqaroda esa hech qanday chiqish yo'li yo'q edi.
   * Tugma BOSILGAN o'tish bo'lgani uchun ishonchliroq.
   */
  setTimeout(function () {
    document.getElementById("title").textContent = "Ilovaga qaytish";
    document.getElementById("hint").textContent =
      "Agar ilova o'zi ochilmagan bo'lsa, quyidagi tugmani bosing.";
    button.style.display = "inline-block";

    /*
     * ⚠️ IKKINCHI TUGMA — oddiy sxema bilan: ba'zi qurilmalarda
     * (Xiaomi/MIUI, Huawei) "intent://" cheklangan, boshqalarida
     * esa aksincha oddiy sxema ishlamaydi. Ikkalasini ham berish
     * — eng ishonchli yo'l.
     */
    var alt = document.getElementById("alt");
    if (isAndroid) {
      alt.href = link;
      alt.style.display = "inline-block";
    }
  }, 800);
})();
</script>
</body>
</html>`;

@Controller()
export class AuthCallbackController {
  /**
   * ⚠️ `@Public()`: bu sahifa TOKENSIZ ochiladi — fuqaro hali
   * kirmagan va aynan shu sahifa orqali kirmoqchi.
   */
  @Public()
  @Get("/auth/callback")
  @Header("Content-Type", "text/html; charset=utf-8")
  // ⚠️ KESHLANMAYDI: manzilda bir martalik imzo bor va u keshda
  // qolsa, keyingi kirishda ESKI imzo qaytarilardi.
  @Header("Cache-Control", "no-store")
  callback(
    @Req() request: Request,
    // ⚠️ `passthrough: true`: javobni Nest O'ZI yuboradi (quyida
    // `return` bor). Usiz so'rov javobsiz osilib qolardi.
    @Res({ passthrough: true }) response: Response,
  ): string {
    /**
     * ⚠️ HAR SO'ROVGA YANGI `nonce`. Qotib qolgan qiymat CSP ni
     * ma'nosiz qilardi: uni bilgan har qanday skript ishga
     * tushaverardi.
     */
    const nonce = randomBytes(16).toString("base64");

    // ⚠️ `helmet()` QO'YGAN SARLAVHA USTIGA YOZILADI (yuqoridagi
    // izohga qarang): standart `script-src 'self'` bu sahifaning
    // ichki skriptini bloklaydi va kirish tugallanmaydi.
    response.setHeader(
      "Content-Security-Policy",
      [
        "default-src 'none'",
        `script-src 'nonce-${nonce}'`,
        `style-src 'nonce-${nonce}'`,
        "base-uri 'none'",
        "form-action 'none'",
        "frame-ancestors 'none'",
      ].join("; "),
    );

    // ⚠️ XOM SATR OLINADI (`originalUrl` dan), Nest'ning
    // tahlil qilingan `query` obyektidan EMAS: imzo maydonlar
    // ustidan hisoblangan va qayta yig'ilganda tartib yoki
    // kodlash o'zgarib, imzo buzilishi mumkin edi.
    const index = request.originalUrl.indexOf("?");
    return page(index === -1 ? "" : request.originalUrl.slice(index + 1), nonce);
  }
}
