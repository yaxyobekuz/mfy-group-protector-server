/**
 * MINI APP AI — YO'NALISH TAKLIFI.
 *
 * ⚠️ MODEL FAQAT TANLAYDI VA TOIFALAYDI, MATN YOZMAYDI. "Mobil AI —
 * taklif, qaror emas" (`signal-ai.service.ts#normalizeSignal` bilan
 * ayni doktrina): model berilgan `issue_categories` dan birini tanlaydi
 * va ishonch foizini qaytaradi. Fuqaro uni 5-qadamda tasdiqlaydi.
 *
 * ⚠️ XATO → `null`. Taklif — QULAYLIK: AI yiqilsa ekran baribir
 * ko'rinadi va fuqaro 1-qadamda tanlagan yo'nalishda davom etadi. Kalit
 * yo'q bo'lsa ham `null` (tizim AI'siz ishlaydi).
 */

import { Injectable, Logger } from "@nestjs/common";
import OpenAI from "openai";

import { env } from "../../../config/env.config";
import {
  AI_MAX_RETRIES,
  AI_TIMEOUT_MS,
  MAX_OUTPUT_TOKENS,
  MODEL,
  SUGGESTION_SCHEMA,
  SYSTEM_PROMPT,
} from "./mobile-ai.constants";

export interface AnalyzableCategory {
  id: string;
  name: string;
  description: string | null;
  /**
   * ⚠️ ASOSIY YO'NALISH NOMI — KICHIK YO'NALISH UCHUN. Model
   * ro'yxatni "ASOSIY → Kichik" ko'rinishida ko'radi: yakka
   * "Ichimlik suvi" degan yozuv kontekstsiz qoladi va model uni
   * "Tozalik va ekologiya" bilan adashtirishi mumkin edi.
   */
  parentName?: string | null;
}

/**
 * SHOSHILINCHLIK DARAJASI — MATNDAN.
 *
 * ⚠️ DARAJA, SOAT EMAS: izoh `mobile-ai.constants.ts#URGENCY_HOURS`
 * da. Qisqasi — modeldan raqam so'ralsa, u o'ylab topilgan raqam
 * qaytaradi va o'sha raqam murojaatning MUDDATI bo'lib qolardi.
 */
export type SuggestedUrgency = "routine" | "soon" | "urgent" | "emergency";

const VALID_URGENCY: ReadonlySet<SuggestedUrgency> = new Set<SuggestedUrgency>([
  "routine",
  "soon",
  "urgent",
  "emergency",
]);

export type SuggestedPriority = "low" | "normal" | "high" | "urgent";

export interface CategorySuggestion {
  categoryId: string;
  confidence: number;
  /** Matndan chiqqan shoshilinchlik darajasi — muddat TAVSIYASI uchun. */
  urgency: SuggestedUrgency;
  priority: SuggestedPriority;
}

const VALID_PRIORITIES = new Set<SuggestedPriority>(["low", "normal", "high", "urgent"]);

@Injectable()
export class MobileAiService {
  private readonly logger = new Logger(MobileAiService.name);
  private client: OpenAI | null = null;

  /** Panel ko'rsatishi uchun (sozlamada emas — kodda). */
  get model(): string {
    return MODEL;
  }

  isEnabled(): boolean {
    return Boolean(env.aiApiKey);
  }

  /**
   * ⚠️ `baseURL` MAJBURIY — `signal-ai.service.ts#getClient` bilan
   * AYNI sabab: berilmasa SDK `api.openai.com` ga borib, xato "kalit
   * noto'g'ri" (401) bo'lib ko'rinardi.
   */
  private getClient(): OpenAI | null {
    if (!env.aiApiKey) return null;
    this.client ??= new OpenAI({
      apiKey: env.aiApiKey,
      baseURL: env.aiBaseUrl,
    });
    return this.client;
  }

  /**
   * Murojaat matniga eng mos yo'nalishni TAKLIF qiladi.
   *
   * @returns Nosozlikda/kalitsiz `null` — taklif qulaylik, talab emas.
   */
  async suggest(
    body: string,
    categories: AnalyzableCategory[],
  ): Promise<CategorySuggestion | null> {
    const client = this.getClient();
    if (!client || categories.length === 0 || body.trim().length === 0) return null;

    const valid = new Set(categories.map((category) => category.id));

    let completion: OpenAI.Chat.Completions.ChatCompletion;
    try {
      completion = await client.chat.completions.create(
        {
          model: MODEL,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: this.buildUserText(body, categories) },
          ],
          // ⚠️ JSON SXEMASI, `json_object` EMAS — shlyuzda
          // tekshirilgani shu (cheat sheet, §6). Sxema SHAKLNI
          // beradi, QIYMATNI emas: `categoryId` ning haqiqiyligi
          // pastda `valid` to'plami bilan tekshiriladi.
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "suggestion",
              schema: SUGGESTION_SCHEMA,
            },
          },
          // ⚠️ `max_tokens`, `max_completion_tokens` EMAS: shlyuzda
          // TIRIK TEKSHIRILGAN (2026-11-07).
          //
          // ⚠️ `temperature` YUBORILMAYDI — izoh konstantalar
          // faylida.
          max_tokens: MAX_OUTPUT_TOKENS,
        },
        { timeout: AI_TIMEOUT_MS, maxRetries: AI_MAX_RETRIES },
      );
    } catch (error) {
      this.logger.warn(`AI taklifi muvaffaqiyatsiz: ${(error as Error).message}`);
      return null;
    }

    const choice = completion.choices[0];

    // ⚠️ KESILGAN JAVOB PARSE QILINMAYDI (`signal-ai` bilan ayni).
    if (choice?.finish_reason === "length") {
      this.logger.warn("AI taklifi token chegarasida kesildi");
      return null;
    }

    const content = choice?.message?.content;
    if (!content) return null;

    let parsed: {
      categoryId?: unknown;
      confidence?: unknown;
      priority?: unknown;
      urgency?: unknown;
    };
    try {
      parsed = JSON.parse(content) as typeof parsed;
    } catch {
      this.logger.warn("AI javobi JSON emas");
      return null;
    }

    const categoryId = typeof parsed.categoryId === "string" ? parsed.categoryId : null;
    // ⚠️ BEGONA id RAD ETILADI: model ro'yxatda yo'q id o'ylab topgan
    // bo'lsa, u ishonchli taklif emas (`signal-ai` ning messageId
    // tekshiruvi bilan ayni).
    if (!categoryId || !valid.has(categoryId)) return null;

    const confidence = this.clampConfidence(parsed.confidence);
    const priority =
      typeof parsed.priority === "string" && VALID_PRIORITIES.has(parsed.priority as SuggestedPriority)
        ? (parsed.priority as SuggestedPriority)
        : "normal";

    /**
     * ⚠️ TANILMAGAN DARAJA — `soon`, `null` EMAS: sxema `enum`
     * bilan himoyalangan, lekin shlyuz sxemani chetlab o'tgan
     * holatlar TIRIK KUZATILGAN (CLAUDE.md). O'rtacha daraja
     * tanlanadi — u na muddatni keskin qisqartiradi, na uzaytiradi.
     */
    const urgency = VALID_URGENCY.has(parsed.urgency as SuggestedUrgency)
      ? (parsed.urgency as SuggestedUrgency)
      : "soon";

    return { categoryId, confidence, priority, urgency };
  }

  // ───────────────────────────────────────────────────────────────

  private buildUserText(body: string, categories: AnalyzableCategory[]): string {
    const list = categories
      .map((category) => {
        /**
         * ⚠️ "ASOSIY → Kichik" KO'RINISHI: yakka "Ichimlik suvi"
         * kontekstsiz qoladi va model uni "Tozalik va ekologiya"
         * bilan adashtirishi mumkin edi. Ro'yxat ikki darajali
         * bo'lgach, bu farq hal qiluvchi ahamiyat kasb etdi.
         */
        const label = category.parentName
          ? `${category.parentName} → ${category.name}`
          : category.name;

        return category.description
          ? `- ${category.id} — ${label} (${category.description})`
          : `- ${category.id} — ${label}`;
      })
      .join("\n");

    return [
      "YO'NALISHLAR:",
      list,
      "",
      "MUROJAAT MATNI:",
      body.trim(),
    ].join("\n");
  }

  private clampConfidence(value: unknown): number {
    const num = typeof value === "number" ? value : Number.parseInt(String(value), 10);
    if (!Number.isFinite(num)) return 50;
    return Math.max(0, Math.min(100, Math.round(num)));
  }
}
