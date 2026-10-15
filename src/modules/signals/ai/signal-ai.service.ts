/**
 * GURUH XABARLARI — AI TAHLILI.
 *
 * Rasmiy MFY guruhlaridan to'plangan xabarlarni o'qib, ularning
 * orasidan SHTAB KO'RISHI KERAK bo'lganlarini ajratadi: shikoyat,
 * taklif va javobsiz qolgan savol.
 *
 * ⚠️ `null` QAYTARADI, XATO OTMAYDI. Bu FON ishi: kalit yo'q bo'lsa,
 * model yiqilsa yoki javob shaklga to'g'ri kelmasa — xabarlar tahlil
 * qilinmagan holida QOLADI va keyingi aylanishda qayta uriniladi.
 * Hech kim bo'sh ekran ko'rmaydi, chunki bu ekranni hech kim kutib
 * turmaydi. Xato otilsa, u job'ni yiqitib, qolgan guruhlarni ham
 * tahlilsiz qoldirardi.
 *
 * ⚠️ MATNNI MODEL YOZMAYDI — `_normalizeSignal` izohiga qara.
 */

import { Injectable, Logger } from "@nestjs/common";
import OpenAI from "openai";

import { env } from "../../../config/env.config";
import { SignalKind, SignalSeverity } from "@prisma/client";
import {
  AI_MAX_RETRIES,
  AI_TIMEOUT_MS,
  MAX_MESSAGES_PER_CALL,
  MAX_OUTPUT_TOKENS,
  MAX_SIGNALS,
  MAX_SUMMARY,
  MODEL,
  SYSTEM_PROMPT,
} from "./signal-ai.constants";

/** Tahlilga beriladigan xabar (navbatdan o'qilgan qator). */
export interface AnalyzableMessage {
  chatId: string;
  messageId: string;
  senderTgId: string | null;
  senderName: string | null;
  text: string;
  replyToText: string | null;
  sentAt: Date;
}

/** Tahlil natijasidagi bitta signal — bazaga shu shaklda yoziladi. */
export interface AnalyzedSignal {
  chatId: string;
  messageId: string;
  kind: SignalKind;
  severity: SignalSeverity;
  summary: string;
  senderTgId: string | null;
  senderName: string | null;
  sentAt: Date;
}

export interface AnalysisResult {
  signals: AnalyzedSignal[];
  model: string;
}

/** Modeldan kelgan xom yozuv. */
interface RawSignal {
  messageId?: unknown;
  kind?: unknown;
  severity?: unknown;
}

const VALID_KINDS = new Set<string>(Object.values(SignalKind));
const VALID_SEVERITIES = new Set<string>(Object.values(SignalSeverity));

@Injectable()
export class SignalAiService {
  private readonly logger = new Logger(SignalAiService.name);
  private client: OpenAI | null = null;

  /**
   * AI yoqilganmi — job shuni tekshirib, bo'sh aylanmaydi.
   *
   * ⚠️ KALIT YO'QLIGI XATO EMAS: AI'siz tizim o'z ishini davom
   * ettiraveradi (guruh kuzatuvi to'planadi, qo'lda muammo yuborish
   * ishlaydi) — faqat avtomatik tahlil bo'lmaydi.
   */
  isEnabled(): boolean {
    return Boolean(env.openaiApiKey);
  }

  /** Model nomi — panelda "qaysi model ishlayapti" deb ko'rsatiladi. */
  get model(): string {
    return MODEL;
  }

  /**
   * BITTA GURUHNING xabarlarini tahlil qiladi.
   *
   * ⚠️ BITTA GURUH — BITTA SO'ROV. Ikki guruhning yozishmasi bitta
   * so'rovga tushsa, model ularni BIR SUHBAT deb o'qib, xulosani
   * aralashtirib yuborardi ("A mahallada suv yo'q" + "B mahallada
   * yo'l buzilgan" → bitta signal).
   *
   * @returns Nosozlikda `null` — xabarlar navbatda QOLADI.
   */
  async analyze(messages: AnalyzableMessage[]): Promise<AnalysisResult | null> {
    const client = this.getClient();
    if (!client || messages.length === 0) return null;

    const batch = messages.slice(0, MAX_MESSAGES_PER_CALL);
    const byMessageId = new Map(batch.map((message) => [message.messageId, message]));

    let completion: OpenAI.Chat.Completions.ChatCompletion;
    try {
      completion = await client.chat.completions.create(
        {
          model: MODEL,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: this.buildUserText(batch) },
          ],
          // ⚠️ JSON REJIMI MAJBURIY: bo'lmasa model javobni
          // ```json ... ``` bloki ichida qaytarib, `JSON.parse`
          // yiqilardi.
          response_format: { type: "json_object" },
          // ⚠️ `temperature` YUBORILMAYDI — 5.x modellari uni qabul
          // qilmaydi va so'rov 400 bilan rad etilardi.
          max_completion_tokens: MAX_OUTPUT_TOKENS,
        },
        { timeout: AI_TIMEOUT_MS, maxRetries: AI_MAX_RETRIES },
      );
    } catch (error) {
      this.logger.warn(`AI chaqiruvi muvaffaqiyatsiz: ${(error as Error).message}`);
      return null;
    }

    const choice = completion.choices[0];

    // ⚠️ KESILGAN JAVOB PARSE QILINMAYDI: yarim JSON ba'zan yaroqli
    // ko'rinadi (massiv yopilib qolgan) va yarim ro'yxat TO'LIQ javob
    // bo'lib chiqardi — qolgan signallar esa jimgina yo'qolardi.
    if (choice?.finish_reason === "length") {
      this.logger.warn("AI javobi token chegarasida kesildi — to'plam qaytadan ko'riladi");
      return null;
    }

    const content = choice?.message?.content;
    if (!content) return null;

    let parsed: { signals?: unknown };
    try {
      parsed = JSON.parse(content) as { signals?: unknown };
    } catch {
      this.logger.warn("AI javobi JSON emas");
      return null;
    }

    const raw = Array.isArray(parsed.signals) ? (parsed.signals as RawSignal[]) : [];

    const signals = raw
      .map((item) => this.normalizeSignal(item, byMessageId))
      .filter((item): item is AnalyzedSignal => item !== null)
      .slice(0, MAX_SIGNALS);

    return { signals, model: MODEL };
  }

  // ───────────────────────────────────────────────────────────────

  private getClient(): OpenAI | null {
    if (!env.openaiApiKey) return null;
    this.client ??= new OpenAI({ apiKey: env.openaiApiKey });
    return this.client;
  }

  /**
   * Xabarlarni modelga beriladigan matnga aylantiradi.
   *
   * Har qator `#<id> [vaqt] Ism: matn` — model `messageId` ni shundan
   * oladi va biz signalni HAQIQIY xabarga bog'lay olamiz.
   */
  private buildUserText(messages: AnalyzableMessage[]): string {
    return messages
      .map((message) => {
        const who = message.senderName || "Noma'lum";

        // Soat:daqiqa yetarli — sana bitta to'plam ichida bir xil.
        // ⚠️ Bu MODEL uchun, ekran uchun emas: shuning uchun
        // `date.util.ts` dan o'tmaydi (u o'zbekcha matn beradi va
        // model uchun "14:30" yetarli).
        const time = `${String(message.sentAt.getUTCHours()).padStart(2, "0")}:${String(
          message.sentAt.getUTCMinutes(),
        ).padStart(2, "0")}`;

        // Javob bo'lsa — nimaga javob ekani. "Ha, menda ham shunday"
        // degan xabar o'zicha ma'nosiz, javob bo'lgani bilan ma'noli.
        const reply = message.replyToText
          ? ` (javob: "${message.replyToText.slice(0, 120)}")`
          : "";

        return `#${message.messageId} [${time}] ${who}${reply}: ${message.text}`;
      })
      .join("\n");
  }

  /**
   * Model javobidagi bitta yozuvni tozalaydi.
   *
   * ⚠️ MATN MODELDAN OLINMAYDI. `summary` — XABARNING O'Z MATNI,
   * model yozgan xulosa emas. Avval model qisqa sarlavha yozardi va u
   * har safar "...aytilgan", "...haqida shikoyat bor" degan o'ramga
   * aylanib, odamning o'z gapini uzoqlashtirardi. Odam shikoyatni o'z
   * so'zi bilan o'qiganda tezroq tushunadi — model esa faqat TANLAYDI
   * va TOIFALAYDI.
   *
   * @returns Yaroqsiz bo'lsa `null` — o'sha yozuv TASHLANADI (butun
   *   to'plam emas: bitta yaroqsiz yozuv qolganlarini yo'qotmasligi
   *   kerak).
   */
  private normalizeSignal(
    raw: RawSignal,
    byMessageId: Map<string, AnalyzableMessage>,
  ): AnalyzedSignal | null {
    if (!raw || typeof raw !== "object") return null;

    const kind = String(raw.kind ?? "").trim();
    if (!VALID_KINDS.has(kind)) return null;

    // ⚠️ XABARGA BOG'LANMAGAN SIGNAL TASHLANADI: matn ham, havola
    // ham, muallif ham, vaqt ham O'SHA xabardan keladi. Ularsiz
    // signal "kimdir nimadir dedi" bo'lib qolardi va tekshirib
    // bo'lmasdi. Model o'ylab topgan `messageId` ham shu yerda
    // ushlanadi.
    const messageId = String(raw.messageId ?? "").trim();
    const source = byMessageId.get(messageId);
    if (!source) return null;

    const text = source.text.trim();
    if (!text) return null;

    const severity = String(raw.severity ?? "").trim();

    return {
      chatId: source.chatId,
      messageId,
      kind: kind as SignalKind,
      severity: VALID_SEVERITIES.has(severity)
        ? (severity as SignalSeverity)
        : SignalSeverity.normal,
      // Xabarning o'zi. Juda uzun bo'lsa kesiladi — to'lig'i havolada.
      summary: text.length > MAX_SUMMARY ? `${text.slice(0, MAX_SUMMARY)}…` : text,
      senderTgId: source.senderTgId,
      senderName: source.senderName,
      sentAt: source.sentAt,
    };
  }
}
