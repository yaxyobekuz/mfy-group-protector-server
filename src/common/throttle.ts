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

import type { ThrottlerModuleOptions } from "@nestjs/throttler";

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
       * ⚠️ ENG QATTIQ CHEGARA, CHUNKI ENG QIMMAT: har chaqiruv OpenAI
       * hisobidan pul yechadi. Chegarasiz qoldirilsa, bitta skript
       * bir kechada butun oylik budjetni yeb qo'yardi va buni
       * hisob-fakturadan bilib olardik.
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
