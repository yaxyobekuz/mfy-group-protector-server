/**
 * CHAT TURI — KANAL VA GURUH AJRATILGAN JOY (YAGONA MANBA).
 *
 * ── NIMA UCHUN AJRATILDI ──────────────────────────────────────────────
 *
 * ⚠️ BOT KANALDA HAM ADMIN QILIB QO'YILADI, lekin KANAL — GURUH EMAS:
 * u yerda aholi yozmaydi, faqat rais (yoki tashkilot) post qiladi.
 * Shuning uchun kanalda mantiqning FAQAT BIR YARMI ma'noli:
 *
 *   kuzatuv (post → AI → signal → muammo)  →  ISHLAYDI
 *   qalqon  (zararli fayl/havolani o'chirish) →  MA'NOSIZ
 *
 * ⚠️ QALQON KANALDA MA'NOSIZ, CHUNKI ZARARLI KONTENTNI O'SHA
 * KANALNING O'Z ADMINI YOZADI. Guruhda qalqon begona odamdan
 * (firibgardan) aholini himoya qiladi; kanalda esa "himoya
 * qilinadigan" va "tahdid soladigan" tomon BIR XIL — ya'ni bot
 * ma'muriyatning o'z e'lonini o'chirishga urinardi.
 *
 * ⚠️ VA ENG YOMONI — JIM OGOHLANTIRISHLAR: kanalda bot o'chirish
 * huquqini olmasa, panelda "Qalqon ishlamayapti" degan qizil qator
 * paydo bo'lardi. Ma'muriyat uni tuzatishga urinib, hech qachon
 * tuzatolmasdi — chunki tuzatiladigan narsa yo'q edi. Yolg'on
 * ogohlantirish haqiqiysini ko'rinmas qiladi.
 *
 * ── BOTDA HAM NUSXA BOR ───────────────────────────────────────────────
 *
 * ⚠️ `bot/src/shared/chat-type.ts` — ATAYLAB nusxa (botda Prisma ham
 * yo'q, import ham yo'q: ikki mustaqil repo). Ikkisi KO'ZGU: bu
 * yerga tur qo'shilsa, u yerga ham qo'shiladi. Aks holda bot kanal
 * postini yuborib, server uni "noma'lum tur" deb tashlab yuborardi.
 */

/** Telegram `Chat.type` — kanal. */
export const CHANNEL_TYPE = "channel";

/**
 * REYESTRGA TUSHADIGAN CHAT TURLARI.
 *
 * ⚠️ `private` ATAYLAB YO'Q: shaxsiy chat — bu BOG'LANISH
 * (`Citizen.telegramId`), guruh emas. Uni bu jadvalga yozish
 * reyestrni har bir foydalanuvchi bilan to'ldirib yuborardi.
 */
export const WATCHED_CHAT_TYPES = new Set(["group", "supergroup", CHANNEL_TYPE]);

/**
 * Chat KANALMI.
 *
 * ⚠️ `=== "channel"` QO'LDA YOZILMAYDI: shart o'nlab joyda kerak
 * (qalqon, qamrov, sanoqchilar, eksport) va satrni har joyda
 * takrorlash bittasini unutish bilan tugardi — o'shanda kanal
 * uchun o'chirish urinishi yoki yolg'on ogohlantirish qolib
 * ketardi.
 */
export const isChannel = (type: string | null | undefined): boolean =>
  type === CHANNEL_TYPE;

/**
 * QALQON SHU CHATDA MA'NOLIMI.
 *
 * ⚠️ ALOHIDA NOM, `!isChannel` EMAS: shart "kanal emas" degani
 * emas, "qalqon bu yerda ma'noli" degani. Keyin yangi tur
 * qo'shilsa (masalan faqat o'qish uchun guruh), o'zgarish BITTA
 * joyda bo'ladi.
 */
export const guardApplies = (type: string | null | undefined): boolean =>
  !isChannel(type);

/**
 * PRISMA `where` BO'LAGI — "faqat qalqon tegishli chatlar".
 *
 * ⚠️ SANOQCHILAR UCHUN KERAK: `guardBlind`, `blindGroups`,
 * `guardedGroups` kanalni hisobga olmasligi kerak, aks holda
 * panelda hech qachon nolga tushmaydigan ogohlantirish turardi.
 */
export const guardScopeWhere = { type: { not: CHANNEL_TYPE } } as const;

/**
 * CHAT TURINING O'QILADIGAN NOMI — eksport va jurnal uchun.
 *
 * ⚠️ XOM QIYMAT KO'RSATILMAYDI: Excel faylida `supergroup` degan
 * so'z turardi va u xodimga hech narsa aytmaydi — bundan tashqari
 * Telegram oddiy guruhni a'zo soni oshganda JIMGINA supergroup'ga
 * aylantiradi, ya'ni bitta jadvalda "group" ham, "supergroup" ham
 * bo'lib, ikki boshqa narsadek ko'rinardi.
 *
 * ⚠️ FAQAT SERVERDA: panel o'z yorliqlarini `admin/.../labels.ts`
 * dan oladi (yagona manba doktrinasi) va bu funksiya u yerga
 * nusxalanmaydi — bu yerdagisi FAYLGA yozish uchun.
 */
export const chatTypeLabel = (type: string | null | undefined): string =>
  isChannel(type) ? "Kanal" : "Guruh";
