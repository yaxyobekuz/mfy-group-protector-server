/**
 * SO'ROV CHEGARALARI — YAGONA MANBA.
 *
 * ── NIMA UCHUN KERAK ──────────────────────────────────────────────────
 *
 * ⚠️ `Settings.mobileDailyLimit` BOSHQA NARSA: u bir fuqaro KUNDA
 * nechta MUROJAAT yuborishini cheklaydi (ma'muriy chora, sabab bilan
 * 403). Bu yerdagi chegara esa SO'ROV TEZLIGINI cheklaydi va
 * texnik himoya: tokenni taxmin qilish, xizmatni to'ldirish va
 * pulli AI chaqiruvini quritish.
 *
 * ⚠️ IKKISI BIR-BIRINING O'RNINI BOSMAYDI. Kunlik chegara
 * tekshiruvining O'ZI bazaga boradi, ya'ni soniyada mingta so'rov
 * yuborilsa u ham bazani yuklab qo'yardi — tezlik chegarasi undan
 * OLDIN to'xtatadi.
 *
 * ── QIYMATLAR QANDAY TANLANGAN ────────────────────────────────────────
 *
 * ⚠️ HAQIQIY FOYDALANUVCHIGA XALAQIT BERMASLIGI SHART. Fuqaro
 * murojaat yuborganda ketma-ket bir necha so'rov ketadi (fayl yuklash
 * × 5, tahlil, yaratish) va chegara past bo'lsa, u o'rtada
 * to'xtab, murojaati YO'QOLARDI — xato esa "ilova buzilgan" bo'lib
 * ko'rinardi. Shuning uchun har chegara odatdagi oqimdan
 * KAMIDA BIR NECHA BARAVAR yuqori qo'yilgan.
 */

import { SetMetadata, applyDecorators } from "@nestjs/common";
import { Throttle, type ThrottlerModuleOptions } from "@nestjs/throttler";

/**
 * NOMLANGAN CHEGARALAR.
 *
 * ⚠️ NOM ORQALI ISHLATILADI (`@Throttle({ auth: {...} })` emas,
 * `@SkipThrottle`/`@Throttle` da nom ko'rsatiladi): qiymat BU
 * YERDA qoladi va controller'da faqat "qaysi chegara" deb
 * belgilanadi. Aks holda raqamlar o'nlab controller bo'ylab
 * tarqalib, birini o'zgartirish uchun hammasini qidirish kerak
 * bo'lardi.
 */
export const THROTTLE = {
  /** Umumiy yumshoq chegara — hamma endpoint uchun. */
  GLOBAL: "global",
  /** Kirish (`auth/*`) — qattiq. */
  AUTH: "auth",
  /** Fayl yuklash. */
  UPLOAD: "upload",
  /** Murojaat yaratish. */
  APPEAL: "appeal",
  /** AI tahlili — PULLI chaqiruv. */
  AI: "ai",
} as const;

export type ThrottleName = (typeof THROTTLE)[keyof typeof THROTTLE];

/** Qaysi nomlangan chegara shu endpoint'ga ATAYLAB qo'yilgani. */
export const RATE_LIMIT_KEY = "rateLimit";

/**
 * MAXSUS CHEGARA — FAQAT SHU ENDPOINT UCHUN.
 *
 * ⚠️ YALANG'OCH `@Throttle` O'RNIGA SHU ISHLATILADI va bu TIRIK
 * NUQSONDAN keyin kiritildi (2026-11-26). `@nestjs/throttler`
 * modulda e'lon qilingan HAMMA nomlangan chegarani HAR endpoint'ga
 * qo'llaydi — dekorator esa faqat o'sha nomning QIYMATLARINI
 * almashtiradi, boshqalarini o'chirmaydi.
 *
 * Natijada butun API eng qattiq chegara bilan — `ai` (daqiqada
 * **8** ta) — cheklanib qolgan edi. Tirik o'lchov: 15 ta ketma-ket
 * `GET /territory/districts` → 8 tasi o'tdi, 7 tasi `429`.
 *
 * ⚠️ VA BU JIM BUZILARDI: panel xodimi ro'yxat varaqlaganda
 * "So'rovlar juda tez yuborildi" degan xabarni olardi va uni
 * tarmoq nosozligi deb o'ylardi — chunki 300 lik "yumshoq global
 * chegara" hujjatlashtirilgan, 8 lik haqiqiy chegara esa
 * hech qayerda yozilmagan edi.
 *
 * ⚠️ MARKER METADATA KERAK: `AppThrottlerGuard` global'dan boshqa
 * har chegarani SHU belgi bo'lmasa o'tkazib yuboradi. Ya'ni
 * "qo'shilgan chegara" endi ATAYLAB tanlanadi.
 *
 * ⚠️ IKKISI BITTA DEKORATORDA: `@Throttle` ni alohida qo'yish
 * mumkin edi, lekin o'shanda belgi va chegara AJRALIB ketardi —
 * biri qo'yilib, ikkinchisi unutilsa, chegara jimgina ishlamay
 * qolardi.
 */
export const RateLimit = (name: ThrottleName) =>
  applyDecorators(Throttle({ [name]: {} }), SetMetadata(RATE_LIMIT_KEY, name));

/**
 * GLOBAL SOZLAMA (`app.module.ts`).
 *
 * ⚠️ `GLOBAL` CHEGARASI YUMSHOQ (daqiqada 300): panel xodimi ro'yxat
 * varaqlaganda, filtr o'zgartirganda va dashboard ochganda o'nlab
 * so'rov ketadi. Past qo'yilsa, xodim ishlab turib "429" olardi va
 * buni hech kim tizim chegarasi deb tushunmasdi.
 *
 * ⚠️ QOLGAN CHEGARALAR SHU BILAN BIRGA ishlaydi (AND, o'rnini
 * bosmaydi): `auth` endpoint'iga so'rov ikkisidan HAM o'tishi kerak.
 * Shuning uchun maxsus chegara global'dan HAR DOIM qattiqroq
 * bo'ladi — aks holda u ma'nosiz bo'lardi.
 *
 * ⚠️ LEKIN FAQAT `@RateLimit` QO'YILGAN ENDPOINT'GA (yuqoridagi
 * izoh): kutubxona o'zi hammasini hamma joyga qo'llaydi va
 * `AppThrottlerGuard` buni to'g'rilaydi. Bu qator bo'lmasa,
 * "global 300" degan va'da yolg'on bo'lardi — haqiqiy chegara 8.
 */
export const THROTTLER_CONFIG: ThrottlerModuleOptions = {
  throttlers: [
    {
      name: THROTTLE.GLOBAL,
      ttl: 60_000,
      limit: 300,
    },
    {
      /**
       * KIRISH — IP BO'YICHA, daqiqada 10.
       *
       * ⚠️ IP BO'YICHA, FUQARO BO'YICHA EMAS: kirish paytida token
       * hali YO'Q, ya'ni kim so'rayotganini bilmaymiz. Himoya
       * qilinadigan narsa ham aynan shu — token olishga urinish.
       *
       * ⚠️ 10 YETARLI: haqiqiy odam bir urinishda kiradi (kirish
       * tizim darajasida — Google/Apple/Telegram). 10 esa "ilova
       * qotib qoldi, qaytadan ochdim" holatiga ham joy qoldiradi.
       */
      name: THROTTLE.AUTH,
      ttl: 60_000,
      limit: 10,
    },
    {
      /**
       * FAYL YUKLASH — daqiqada 30.
       *
       * ⚠️ BIR MUROJAATGA 5 TAGACHA FAYL (`mobileMaxAttachments`) va
       * fuqaro ularni qayta tanlab, qaytadan yuklashi mumkin. 30 —
       * olti barobar zaxira; shundan yuqorisi esa diskni to'ldirish
       * urinishiga o'xshaydi.
       */
      name: THROTTLE.UPLOAD,
      ttl: 60_000,
      limit: 30,
    },
    {
      /**
       * MUROJAAT YARATISH — daqiqada 10.
       *
       * ⚠️ KUNLIK CHEGARA O'RNINI BOSMAYDI (`mobileDailyLimit`): u
       * "kunda nechta" degan MA'MURIY qoida va sozlamadan keladi.
       * Bu esa "soniyada nechta" — skript bilan navbatni to'ldirishga
       * qarshi.
       */
      name: THROTTLE.APPEAL,
      ttl: 60_000,
      limit: 10,
    },
    {
      /**
       * AI TAHLILI — daqiqada 8.
       *
       * ⚠️ ENG QATTIQ CHEGARA. Avvalgi sabab PUL edi (har chaqiruv
       * OpenAI hisobidan yechardi); endi model O'ZIMIZNING shlyuzda
       * va chaqiruv BEPUL — lekin chegara SAQLANADI, chunki sabab
       * O'ZGARDI, YO'QOLMADI:
       *
       * shlyuz BIR DONA va uni butun tashkilot bo'lishadi. Bitta
       * skript uni to'ldirsa, guruh tahlili (fon ishi) ham, boshqa
       * fuqarolarning taklifi ham sekinlashardi — ya'ni narx
       * hisob-fakturada emas, BOSHQA ODAMNING kutishida ko'rinardi.
       *
       * ⚠️ "Bepul bo'ldi, chegara kerak emas" DEB OLIB TASHLAMANG.
       *
       * ⚠️ FUQARO BO'YICHA (IP emas — `mobile-throttler.guard.ts`):
       * bitta uy yoki mobil operator NAT ortida o'nlab fuqaro bir IP
       * bilan chiqadi va IP bo'yicha cheklansa, qo'shnisi ilovadan
       * foydalanayotgan odam "429" olardi.
       */
      name: THROTTLE.AI,
      ttl: 60_000,
      limit: 8,
    },
  ],
};
