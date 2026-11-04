/**
 * TEZLIK CHEGARASI — kim bo'yicha sanaladi.
 *
 * ── MUAMMO: IP YETARLI EMAS ───────────────────────────────────────────
 *
 * Standart `ThrottlerGuard` so'rovlarni IP bo'yicha sanaydi. Fuqaro
 * endpoint'larida bu IKKI TOMONGA xato beradi:
 *
 *   1. BIR IP — KO'P ODAM. Mobil operator va uy Wi-Fi'si NAT ortida
 *      ishlaydi: o'nlab fuqaro bitta tashqi IP bilan chiqadi. IP
 *      bo'yicha cheklansa, qo'shnisi ilovadan foydalangani uchun
 *      boshqa odam "429" olardi — va buni hech kim tushunmasdi.
 *
 *   2. BIR ODAM — KO'P IP. Telefon Wi-Fi'dan mobil internetga o'tganda
 *      IP O'ZGARADI, ya'ni chegarani aylanib o'tish uchun aviarejimni
 *      yoqib-o'chirish yetarli bo'lardi.
 *
 * ── YECHIM ────────────────────────────────────────────────────────────
 *
 * Token BOR bo'lsa — FUQARO/XODIM id'si bo'yicha, yo'q bo'lsa — IP
 * bo'yicha sanaladi. Kirish (`auth/*`) endpoint'larida tokenning
 * o'zi hali yo'q, ya'ni ular tabiiy ravishda IP bo'yicha qoladi — va
 * bu TO'G'RI: himoya qilinadigan narsa aynan "token olishga urinish".
 *
 * ⚠️ `request.user` VA `request.citizen` IKKISI HAM QARALADI: ular
 * ikki ALOHIDA tushuncha (`decorators/index.ts` — "fuqaro xodim
 * emas") va birini ikkinchisining o'rniga qo'yib bo'lmaydi. Agar
 * faqat `user` qaralsa, butun fuqaro oqimi IP bo'yicha sanalib,
 * yuqoridagi ikki xato qaytib kelardi.
 */

import { Injectable, type ExecutionContext } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import type { Request } from "express";

import { BOT_ONLY_KEY, type RequestCitizen, type RequestUser } from "../decorators";

@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  /**
   * BOT CHEGARALANMAYDI.
   *
   * ⚠️ BOT — FOYDALANUVCHI EMAS, ISHONCHLI XIZMAT (`decorators`
   * izohi): u `X-Bot-Key` bilan kiradi va kalit faqat bizda.
   *
   * ⚠️ CHEGARALASH ZARAR KELTIRARDI: butun MFY guruhlari yozishmasi
   * BITTA jarayondan, BITTA IP bilan o'tadi. Faol kunda u daqiqada
   * yuzlab xabar yuboradi va global chegaraga (300) urilib,
   * so'rovlari RAD ETILA boshlardi. O'shanda guruh kuzatuvi va
   * XAVFSIZLIK QALQONI jimgina ishlamay qolardi — zararli xabar
   * esa o'chirilmay qolardi.
   *
   * ⚠️ HIMOYA YO'Q DEGANI EMAS: bot yo'lining himoyasi — KALIT
   * (doimiy vaqtli taqqoslash bilan tekshiriladi), tezlik emas.
   * Kalit tarqalgan holatda chegara ham yordam bermasdi.
   */
  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    const isBot = this.reflector.getAllAndOverride<boolean>(BOT_ONLY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isBot) return true;

    return super.shouldSkip(context);
  }

  /**
   * ⚠️ GUARD TARTIBI MUHIM (`app.module.ts`): bu guard
   * `JwtAuthGuard` DAN KEYIN turadi, aks holda `request.citizen` hali
   * bo'sh bo'lib, hamma so'rov IP bo'yicha sanalardi — ya'ni butun
   * mantiq jimgina ishlamay qolardi.
   */
  protected async getTracker(req: Request): Promise<string> {
    const citizen = (req as Request & { citizen?: RequestCitizen }).citizen;
    if (citizen?.id) return `citizen:${citizen.id}`;

    const user = (req as Request & { user?: RequestUser }).user;
    if (user?.id) return `user:${user.id}`;

    return `ip:${this.extractIp(req)}`;
  }

  /**
   * 429 MATNI — O'ZBEKCHA.
   *
   * ⚠️ STANDART MATN ALMASHTIRILADI: kutubxona
   * `"ThrottlerException: Too Many Requests"` qaytaradi va u
   * fuqaroga ILOVADA ko'rinardi — ya'ni odam o'zbekcha ilovada
   * inglizcha istisno nomini o'qirdi va "ilova buzilgan" deb
   * o'ylardi.
   *
   * ⚠️ "NIMA QILISH KERAK" AYTILADI ("bir daqiqa kutib"): sabab
   * ko'rsatish qoidasi bilan ayni (CLAUDE.md — "cheklash sababi
   * majburiy"). Aniq son aytilmaydi — u endpoint'ga qarab
   * o'zgaradi va fuqaroga ma'lumot bermaydi.
   */
  protected async getErrorMessage(): Promise<string> {
    return "So'rovlar juda tez yuborildi — bir daqiqa kutib, qaytadan urinib ko'ring";
  }

  /**
   * HAQIQIY IP — proksi ortidan.
   *
   * ⚠️ `x-forwarded-for` BIRINCHI QIYMATI (`decorators#ClientIp` bilan
   * AYNI mantiq): nginx ortida `req.ip` HAR DOIM `127.0.0.1` bo'ladi
   * va o'shanda butun internet BITTA chelakka tushib, chegara
   * birinchi faol foydalanuvchida hammani bloklardi.
   *
   * ⚠️ SARLAVHAGA ISHONISH XAVFI BOR (uni mijoz yozishi mumkin),
   * lekin bu yerda u qabul qilinadi: eng yomon holat — chegarani
   * aylanib o'tish, ya'ni IP yo'li TAXMINIY himoya. Tokenli
   * so'rovlar esa id bo'yicha sanaladi va uni soxtalashtirib
   * bo'lmaydi.
   */
  private extractIp(req: Request): string {
    const forwarded = req.headers["x-forwarded-for"];
    if (typeof forwarded === "string" && forwarded.length > 0) {
      return forwarded.split(",")[0]!.trim();
    }

    return req.ip ?? "unknown";
  }
}
