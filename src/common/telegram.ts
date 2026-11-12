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
}

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
      | { ok?: boolean; description?: string; parameters?: { retry_after?: number } }
      | null;

    if (response.ok && body?.ok) return { ok: true };

    return {
      ok: false,
      description: body?.description ?? `HTTP ${response.status}`,
      retryAfter: body?.parameters?.retry_after,
    };
  } catch (error) {
    logger.warn(`${method} xatosi: ${(error as Error).message}`);
    return { ok: false, description: (error as Error).message };
  }
};

/** Oddiy matnli xabar (HTML). */
export const sendMessage = (chatId: string, html: string): Promise<TelegramResult> =>
  callTelegram("sendMessage", {
    chat_id: chatId,
    text: html,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
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
): Promise<TelegramResult> =>
  callTelegram("forwardMessage", {
    chat_id: chatId,
    from_chat_id: fromChatId,
    message_id: Number(messageId),
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
): Promise<TelegramResult> =>
  callTelegram("copyMessage", {
    chat_id: chatId,
    from_chat_id: fromChatId,
    message_id: Number(messageId),
  });
