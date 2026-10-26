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
  SYSTEM_PROMPT,
} from "./mobile-ai.constants";

export interface AnalyzableCategory {
  id: string;
  name: string;
  description: string | null;
}

export type SuggestedPriority = "low" | "normal" | "high" | "urgent";

export interface CategorySuggestion {
  categoryId: string;
  confidence: number;
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
    return Boolean(env.openaiApiKey);
  }

  private getClient(): OpenAI | null {
    if (!env.openaiApiKey) return null;
    this.client ??= new OpenAI({ apiKey: env.openaiApiKey });
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
          // ⚠️ JSON REJIMI MAJBURIY: bo'lmasa model javobni ```json```
          // bloki ichida qaytarib, `JSON.parse` yiqilardi.
          response_format: { type: "json_object" },
          // ⚠️ `temperature` YUBORILMAYDI — 5.x modellari uni qabul
          // qilmaydi va so'rov 400 bilan rad etilardi.
          max_completion_tokens: MAX_OUTPUT_TOKENS,
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

    let parsed: { categoryId?: unknown; confidence?: unknown; priority?: unknown };
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

    return { categoryId, confidence, priority };
  }

  // ───────────────────────────────────────────────────────────────

  private buildUserText(body: string, categories: AnalyzableCategory[]): string {
    const list = categories
      .map((category) =>
        category.description
          ? `- ${category.id} — ${category.name} (${category.description})`
          : `- ${category.id} — ${category.name}`,
      )
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
