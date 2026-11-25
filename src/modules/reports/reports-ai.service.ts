/**
 * HISOBOT YORDAMCHISI — SAVOLGA JAVOB VA TAKLIF.
 *
 * ── NIMA UCHUN RAQAMLAR SERVERDA YIG'ILADI ────────────────────────────
 *
 * ⚠️ MODELGA BAZA BERILMAYDI. U SQL yozmaydi, jadvalni ko'rmaydi va
 * ko'ra olmaydi ham: modelga baza ochilsa, bitta noto'g'ri so'rov
 * butun hisobotni qiyshaytirib qo'yardi — va buni tekshirib
 * bo'lmasdi, chunki javob matn bo'lib chiqardi.
 *
 * ⚠️ O'RNIGA: raqamlarni SERVER hisoblaydi (ayni hisobot kesimlari,
 * ayni qamrov bilan) va modelga TAYYOR jadval beriladi. Model faqat
 * o'sha jadvalni O'QIYDI va izohlaydi.
 *
 * ── MODEL RAQAM O'YLAB TOPMAYDI ───────────────────────────────────────
 *
 * ⚠️ "AI matn yozmaydi" doktrinasi bu yerda BUZILMAYDI va buning
 * sababi aniq: u `GroupSignal.summary` haqida edi — AI yozgan xulosa
 * RASMIY navbatga tusha olmaydi. Bu yerda esa javob hech qayerga
 * SAQLANMAYDI: u ekranda, savol bergan odamga, bir marta
 * ko'rsatiladi va qaror baribir odamda qoladi.
 *
 * ⚠️ JAVOB QAT'IY CHEGARADA: model faqat berilgan jadvaldagi
 * raqamlardan foydalanishi kerak. Promptda bu ANIQ aytilgan, va
 * javob bilan birga ASL RAQAMLAR ham qaytariladi — xodim ularni
 * solishtirib ko'rishi mumkin.
 */

import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import OpenAI from "openai";

import { env } from "../../config/env.config";
import type { ScopeContext } from "../../common/scope.util";
import { ReportsService } from "./reports.service";
import type { ReportQuery } from "./dto/reports.dto";

/**
 * ⚠️ `signal-ai` va `mobile-ai` BILAN AYNI MODEL — bu UCHALASIDA
 * QO'LDA saqlanadi. Avval "shlyuzda bitta model bor" deb yozilgan
 * edi, lekin 2026-11-18 dan `GET /models` ikki yozuv qaytaradi
 * (`qwen3.5:122b`, `foundation-sec:8b`): endi birini almashtirib,
 * qolganini esdan chiqarish MUMKIN. Uchtasi birga o'zgaradi.
 */
const MODEL = "qwen3.5:122b";

const AI_TIMEOUT_MS = 60_000;

/**
 * ⚠️ UZUNROQ (`mobile-ai` dagi 4000 dan): bu yerda javob — bir necha
 * jumlalik izoh va taklif, bitta JSON obyekt emas. Qisqa chegara
 * javobni o'rtasidan kesib, xodimga yarim gap ko'rsatardi.
 */
const MAX_OUTPUT_TOKENS = 6000;

/** Modelga beriladigan eng ko'p qator — prompt cheksiz o'smasligi uchun. */
const MAX_ROWS = 25;

const SYSTEM_PROMPT = [
  "Siz O'zbekistondagi viloyat shtabining hisobot yordamchisisiz.",
  "Sizga TAYYOR raqamlar jadvali va xodimning savoli beriladi.",
  "",
  "QOIDALAR:",
  "- FAQAT berilgan jadvaldagi raqamlardan foydalaning. Boshqa raqam",
  "  o'ylab topmang va tashqi ma'lumotga tayanmang.",
  "- Jadvalda javob yo'q bo'lsa, buni ochiq ayting va qanday kesim",
  "  kerakligini taklif qiling.",
  "- Javob O'ZBEK TILIDA, qisqa va aniq bo'lsin: 3-6 jumla.",
  "- Avval XULOSA (nima ko'rinyapti), keyin TAKLIF (nima qilish kerak).",
  "- Raqamni aytganda uni jadvaldagidek keltiring, yaxlitlamang.",
  // ⚠️ NISBIY KO'RSATKICH ALOHIDA AYTILADI: mutlaq son bilan
  // tumanlarni solishtirish eng ko'p uchraydigan xato va model ham
  // shuni qiladi, agar aytilmasa.
  "- Tumanlarni solishtirganda MUTLAQ son emas, '1000 kishiga' ustunini",
  "  ishlating. Aholisi ko'p tumanda murojaat ko'p bo'lishi tabiiy.",
  "- Hech qanday jadval, markdown sarlavha yoki ro'yxat belgisi",
  "  ishlatmang — oddiy matn yozing.",
].join("\n");

export interface AssistantAnswer {
  answer: string;
  /** ⚠️ Modelga berilgan ASL raqamlar — xodim solishtirib ko'rishi uchun. */
  context: Record<string, unknown>;
}

@Injectable()
export class ReportsAiService {
  private readonly logger = new Logger(ReportsAiService.name);
  private client: OpenAI | null = null;

  constructor(private readonly reports: ReportsService) {}

  /**
   * ⚠️ `baseURL` MAJBURIY: berilmasa SDK `api.openai.com` ga boradi va
   * xato 401 bo'lib ko'rinadi — kalitni ayblab, sababini (manzil)
   * topish uzoq davom etardi (CLAUDE.md).
   */
  private getClient(): OpenAI | null {
    if (this.client) return this.client;
    if (!env.aiApiKey) return null;

    this.client = new OpenAI({
      apiKey: env.aiApiKey,
      baseURL: env.aiBaseUrl,
    });

    return this.client;
  }

  /**
   * SAVOLGA JAVOB BERADI.
   *
   * ⚠️ KESIMLAR HAR SAVOLDA QAYTA YIG'ILADI: xodim filtrni
   * o'zgartirib savol berishi mumkin va eski raqamlar bilan javob
   * berish eng yomon xato bo'lardi — javob ishonchli ko'rinadi,
   * lekin boshqa davrga tegishli bo'ladi.
   */
  async ask(
    question: string,
    scope: ScopeContext,
    query: ReportQuery,
  ): Promise<AssistantAnswer> {
    const client = this.getClient();

    if (!client) {
      /**
       * ⚠️ 503 VA ANIQ SABAB: "xatolik yuz berdi" degan javob
       * ma'muriyatni kalit yo'qligini topishga olib bormasdi.
       */
      throw new ServiceUnavailableException(
        "AI yordamchisi sozlanmagan — AI_API_KEY berilmagan",
      );
    }

    const context = await this.collect(scope, query);

    let completion: OpenAI.Chat.Completions.ChatCompletion;

    try {
      completion = await client.chat.completions.create(
        {
          model: MODEL,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: this.buildUserText(question, context) },
          ],
          // ⚠️ `max_tokens`, `max_completion_tokens` EMAS — shlyuzda
          // TIRIK TEKSHIRILGANI shu (CLAUDE.md).
          //
          // ⚠️ `response_format` BERILMAYDI: javob ERKIN MATN va
          // `json_schema` uni bitta satrga tiqib qo'yardi.
          max_tokens: MAX_OUTPUT_TOKENS,
        },
        { timeout: AI_TIMEOUT_MS, maxRetries: 1 },
      );
    } catch (error) {
      this.logger.warn(`Yordamchi javob bermadi: ${(error as Error).message}`);
      throw new ServiceUnavailableException(
        "AI yordamchisi hozir javob bera olmadi. Keyinroq urinib ko'ring.",
      );
    }

    const choice = completion.choices[0];

    // ⚠️ KESILGAN JAVOB KO'RSATILMAYDI (`signal-ai` bilan ayni): yarim
    // gap xulosani butunlay o'zgartirib yuborishi mumkin.
    if (choice?.finish_reason === "length") {
      throw new ServiceUnavailableException(
        "Javob juda uzun chiqdi — savolni aniqroq bering",
      );
    }

    const answer = choice?.message?.content?.trim();

    if (!answer) {
      throw new ServiceUnavailableException("AI yordamchisi bo'sh javob qaytardi");
    }

    return { answer, context };
  }

  /**
   * MODELGA BERILADIGAN RAQAMLAR.
   *
   * ⚠️ AYNI HISOBOT KESIMLARI, AYNI QAMROV: yordamchi ekrandagi
   * hisobotdan BOSHQA raqam ko'rsatmasligi kerak — aks holda xodim
   * ikkisini solishtirib, qaysi biriga ishonishni bilmasdi.
   */
  private async collect(scope: ScopeContext, query: ReportQuery) {
    const [overview, territory, categories, recurring] = await Promise.all([
      this.reports.overview(scope, query),
      this.reports.byTerritory(scope, query),
      this.reports.byCategory(scope, query),
      this.reports.recurring(scope, query),
    ]);

    return {
      umumiy: {
        jami: overview.total,
        ochiq: overview.open,
        muddatiOtgan: overview.overdue,
        halQilishUlushi: overview.resolutionRate,
        ortachaHalQilishSoat: overview.avgResolutionHours,
        holatlar: overview.status,
      },
      // ⚠️ CHEGARA: 100 ta MFY li jadval promptni shishirib, modelni
      // sekinlashtirardi — eng muhim qatorlar yetarli.
      tumanlar: territory.districts.slice(0, MAX_ROWS).map((item) => ({
        nomi: item.name,
        murojaat: item.count,
        aholi: item.population,
        kishiga1000: item.per1000,
      })),
      mfyTop: territory.mahallas.slice(0, MAX_ROWS).map((item) => ({
        nomi: item.mahallaName,
        tuman: item.district?.name ?? null,
        murojaat: item.count,
        kishiga1000: item.per1000,
      })),
      yonalishlar: categories.slice(0, MAX_ROWS).map((item) => ({
        /**
         * ⚠️ OTA YO'NALISH BILAN BIRGA: yakka "Ichimlik suvi"
         * kontekstsiz qolardi va model uni "Tozalik" bilan
         * adashtirishi mumkin edi (promptdagi `leaves` bilan
         * ayni sabab).
         */
        nomi: item.parentName ? `${item.parentName} → ${item.name}` : item.name,
        murojaat: item.count,
        /**
         * ⚠️ MUDDATI O'TGANLAR SHU YERDA: tirik sinovda model
         * "muddati o'tganlar qaysi yo'nalishda ko'p" degan
         * savolga "jadvalda bu kesim yo'q" deb javob berdi —
         * to'g'ri qildi, lekin savol eng ko'p so'raladiganlardan
         * biri.
         */
        muddatiOtgan: item.overdue,
      })),
      tizimliMuammolar: recurring.items.slice(0, MAX_ROWS).map((item) => ({
        mfy: item.mahallaName,
        tuman: item.district?.name ?? null,
        yonalish: item.parentName
          ? `${item.parentName} → ${item.categoryName}`
          : item.categoryName,
        jami: item.total,
        hodisa: item.incidents,
        oyiga: item.perMonth,
      })),
    };
  }

  private buildUserText(question: string, context: Record<string, unknown>): string {
    return [
      "RAQAMLAR (JSON):",
      JSON.stringify(context),
      "",
      "SAVOL:",
      question.trim(),
    ].join("\n");
  }
}
