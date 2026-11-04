/**
 * O'CHIRILGAN FUQARO — KO'RSATILADIGAN NOM VA FILTR.
 *
 * ── NIMA UCHUN ALOHIDA FAYL ───────────────────────────────────────────
 *
 * Hisobni o'chirish (App Store 5.1.1(v), Google Play) qatorni
 * O'CHIRMAYDI, faqat `deletedAt` ni belgilaydi va shaxsiy ma'lumotni
 * tozalaydi (`mobile.service.ts#deleteMe`). Natijada IKKI narsa bir
 * necha joyda kerak bo'ladi:
 *
 *   1. `firstName` ga yoziladigan nom — fuqaro ilovasi ham, panel ham
 *      o'qiydi;
 *   2. "o'chirilganlarni chiqarib tashlash" filtri — reyting, tarqatma
 *      va ro'yxatlarda.
 *
 * ⚠️ IKKISI QO'LDA TAKRORLANMAYDI. Filtr har joyda `deletedAt: null`
 * deb qayta yozilsa, bitta joyda unutilishi — o'chirilgan hisobning
 * reytingda yoki tarqatma ro'yxatida qayta paydo bo'lishi bilan
 * tugaydi. Buni esa hech kim sezmasdi: qator ism o'rnida
 * "O'chirilgan foydalanuvchi" bilan jimgina turardi.
 */

/**
 * O'chirilgan fuqaroning `firstName` qiymati.
 *
 * ⚠️ BO'SH SATR EMAS: `firstName` — MAJBURIY ustun va bo'sh qiymat
 * panelda ismsiz qator chiqarib, xodim buni baza xatosi deb
 * o'ylardi. "O'chirilgan" deb ko'rinishi esa aniq ma'lumot.
 *
 * ⚠️ MATN TARJIMA QILINMAYDI: u BAZAGA yoziladi (ko'rsatish yorlig'i
 * emas) va tilga qarab o'zgarsa, bir xil holat bazada ikki xil satr
 * bo'lib qolardi.
 */
export const DELETED_CITIZEN_NAME = "O'chirilgan foydalanuvchi";

/**
 * FAOL FUQARO FILTRI — `where` ga qo'shiladi.
 *
 * ⚠️ `isBlocked` BU YERGA KIRMAYDI: blok — MA'MURIY chora va u har
 * ro'yxatda boshqacha hal qilinadi (reytingda chiqarib tashlanadi,
 * panel ro'yxatida esa KO'RSATILADI — xodim choraning natijasini
 * ko'rishi kerak). O'chirilganlik esa hamma joyda AYNI ma'noga ega.
 */
export const activeCitizenWhere = { deletedAt: null } as const;
