/**
 * TELEGRAM BOT API — SERVER TOMONIDAN YUBORISH.
 *
 * ── NIMA UCHUN SERVER YUBORADI, BOT EMAS ──────────────────────────────
 *
 * ⚠️ BOT — KUZATUVCHI VA SUHBATDOSH, TARQATUVCHI EMAS. Tarqatma
 * minglab xabar bo'lishi mumkin va uni botga topshirish ikki
 * muammoni tug'dirardi: (1) bot qayta ishga tushganda navbat
 * yo'qolardi, (2) `getUpdates` oqimi tarqatma davomida sekinlashardi
 * — ya'ni xavfsizlik qalqoni ham, kuzatuv ham kechikardi.
 *
 * ⚠️ SERVERDA ESA HOLAT BAZADA (`Broadcast`): jarayon uzilsa ham
 * qayerda to'xtagani ko'rinadi.
 *
 * ── NIMA UCHUN AYRIM FAYL ─────────────────────────────────────────────
 *
 * ⚠️ UCHINCHI NUSXANING OLDINI OLADI: `sendMessage` chaqiruvi avval
 * `issue-notify.service.ts` da ham, `citizens.service.ts` da ham
 * ALOHIDA yozilgan edi. Uchinchisi qo'shilganda "`parse_mode` qayerda
 * HTML, qayerda yo'q" degan savol paydo bo'lardi.
 */

import { Logger } from "@nestjs/common";

import { env } from "../config/env.config";

const TELEGRAM_API = "https://api.telegram.org";

const logger = new Logger("Telegram");

/**
 * ⚠️ `parse_mode: HTML` BILAN YUBORILADIGAN MATN UCHUN. Belgilar
 * qochirilmasa, fuqaro yozgan `<` xabarni butunlay RAD ETTIRARDI
 * (Telegram 400) — ya'ni bitta belgi tufayli xabar yetib bormasdi.
 */
export const escapeHtml = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export interface TelegramResult {
  ok: boolean;
  /** Telegram tushuntirishi — panelda sabab sifatida ko'rsatiladi. */
  description?: string;
  /** `429` da Telegram necha soniya kutishni aytadi. */
  retryAfter?: number;
  /**
   * ODAM BOTNI BLOKLAGAN (yoki chat yo'q) — NOSOZLIK EMAS.
   *
   * ⚠️ TARMOQ XATOSIDAN AJRATILADI: bloklangan manzilga qayta
   * yuborish BEFOYDA, tarmoq xatosi esa aynan qayta yuborishni
   * talab qiladi. Bitta "failed" ga qo'shilsa, operator har
   * tarqatmadan keyin yuzlab "xato"ni ko'rib, sababini izlab
   * yurardi — holbuki ularning hammasi normal hol.
   */
  blocked?: boolean;
  /** Yuborilgan xabar id'si — qadash (`pin`) uchun kerak. */
  messageId?: number;
}

/**
 * "BLOKLANGAN" DEB HISOBLANADIGAN JAVOBLAR.
 *
 * ⚠️ MATN BO'YICHA ANIQLANADI, CHUNKI TELEGRAM KOD BERMAYDI:
 * hamma holat uchun `403` yoki `400` qaytadi va farqni faqat
 * `description` dan bilish mumkin.
 */
const BLOCKED_PATTERNS = [
  "bot was blocked by the user",
  "user is deactivated",
  "chat not found",
  "bot was kicked",
  "peer_id_invalid",
  "the group chat was deleted",
  "bot is not a member",
];

const isBlockedDescription = (description?: string): boolean => {
  if (!description) return false;
  const text = description.toLowerCase();
  return BLOCKED_PATTERNS.some((pattern) => text.includes(pattern));
};

/**
 * INLINE TUGMA — FAQAT HAVOLALI.
 *
 * ⚠️ `callback_data` QO'LLAB-QUVVATLANMAYDI: bosilganda botga
 * hodisa keladi va uni ishlovchi kod kerak bo'lardi — aks holda
 * tugma bosiladi-yu, hech narsa bo'lmaydi.
 */
export interface TelegramButton {
  text: string;
  url: string;
}

export interface SendOptions {
  /** `plain` bo'lsa matn EKRANLANADI (standart). */
  html?: boolean;
  disablePreview?: boolean;
  silent?: boolean;
  buttons?: TelegramButton[];
}

/**
 * ⚠️ TUGMALAR BITTA USTUNDA: ikki ustunli joylashuvda uzun matnli
 * tugma qirqilardi va telefonda u ayniqsa yomon ko'rinardi.
 */
const replyMarkup = (buttons?: TelegramButton[]): Record<string, unknown> | undefined =>
  buttons && buttons.length > 0
    ? { inline_keyboard: buttons.map((button) => [{ text: button.text, url: button.url }]) }
    : undefined;

/**
 * BITTA CHAQIRUV.
 *
 * ⚠️ XATO OTILMAYDI: tarqatma BITTA manzilda to'xtamasligi kerak —
 * kimdir botni bloklagan bo'lsa (403), qolgan ming kishiga xabar
 * baribir ketishi kerak.
 */
export const callTelegram = async (
  method: string,
  payload: Record<string, unknown>,
): Promise<TelegramResult> => {
  if (!env.botToken) {
    return { ok: false, description: "BOT_TOKEN sozlanmagan" };
  }

  try {
    const response = await fetch(`${TELEGRAM_API}/bot${env.botToken}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      // ⚠️ TIMEOUT MAJBURIY: javobsiz so'rov tarqatmani butunlay
      // muzlatib qo'yardi va `Broadcast.status` abadiy `sending` da
      // qolardi.
      signal: AbortSignal.timeout(20_000),
    });

    const body = (await response.json().catch(() => null)) as
      | {
          ok?: boolean;
          description?: string;
          parameters?: { retry_after?: number };
          result?: { message_id?: number };
        }
      | null;

    if (response.ok && body?.ok) {
      return { ok: true, messageId: body.result?.message_id };
    }

    const description = body?.description ?? `HTTP ${response.status}`;

    return {
      ok: false,
      description,
      retryAfter: body?.parameters?.retry_after,
      blocked: isBlockedDescription(description),
    };
  } catch (error) {
    logger.warn(`${method} xatosi: ${(error as Error).message}`);
    return { ok: false, description: (error as Error).message };
  }
};

/**
 * Oddiy matnli xabar (HTML).
 *
 * ⚠️ `options` IXTIYORIY VA STANDART QIYMATLAR ESKI XATTI-HARAKAT
 * BILAN AYNI: bu funksiyani o'nlab joy chaqiradi (javob, e'lon,
 * ogohlantirish) va standart o'zgarsa, ularning hammasi jimgina
 * boshqacha ishlab ketardi.
 */
export const sendMessage = (
  chatId: string,
  html: string,
  options: SendOptions = {},
): Promise<TelegramResult> =>
  callTelegram("sendMessage", {
    chat_id: chatId,
    text: html,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: options.disablePreview !== false },
    ...(options.silent ? { disable_notification: true } : {}),
    ...(replyMarkup(options.buttons) ? { reply_markup: replyMarkup(options.buttons) } : {}),
  });

/**
 * XABARNI CHATGA QADAYDI.
 *
 * ⚠️ FAQAT GURUH VA KANALDA: shaxsiy chatda Telegram uni rad etadi
 * va tarqatma hisobotida yolg'on "xato" paydo bo'lardi.
 *
 * ⚠️ OVOZSIZ QADALADI: qadash haqidagi xizmat xabari guruhda
 * yana bitta bildirishnoma bo'lib, e'lonning o'zini pastga
 * surib yuborardi.
 */
export const pinChatMessage = (
  chatId: string,
  messageId: number,
): Promise<TelegramResult> =>
  callTelegram("pinChatMessage", {
    chat_id: chatId,
    message_id: messageId,
    disable_notification: true,
  });

/**
 * XABARNI UZATADI — "Forwarded from" sarlavhasi BILAN.
 *
 * ⚠️ `copyMessage` DAN FARQI KO'RINADIGAN: forward manbani ko'rsatadi
 * (kanal/odam nomi), nusxa esa botning o'z xabari bo'lib ko'rinadi.
 * Qaysi biri kerakligi — YUBORUVCHINING qarori, shuning uchun ikkisi
 * ham bor.
 */
export const forwardMessage = (
  chatId: string,
  fromChatId: string,
  messageId: string,
  options: SendOptions = {},
): Promise<TelegramResult> =>
  callTelegram("forwardMessage", {
    chat_id: chatId,
    from_chat_id: fromChatId,
    message_id: Number(messageId),
    ...(options.silent ? { disable_notification: true } : {}),
  });

/**
 * XABARNI NUSXALAYDI — manbasiz, "asl holatda".
 *
 * ⚠️ BAYTLAR SERVERDAN O'TMAYDI: Telegram xabarni O'ZI nusxalaydi,
 * ya'ni 25 MB li video ham server xotirasiga tushmaydi.
 */
export const copyMessage = (
  chatId: string,
  fromChatId: string,
  messageId: string,
  options: SendOptions = {},
): Promise<TelegramResult> =>
  callTelegram("copyMessage", {
    chat_id: chatId,
    from_chat_id: fromChatId,
    message_id: Number(messageId),
    ...(options.silent ? { disable_notification: true } : {}),
    /*
     * ⚠️ TUGMALAR FAQAT `copyMessage` DA: `forwardMessage`
     * Telegram'da `reply_markup` ni UMUMAN qabul qilmaydi —
     * uzatilgan xabar asl holatida qoladi.
     */
    ...(replyMarkup(options.buttons) ? { reply_markup: replyMarkup(options.buttons) } : {}),
  });
