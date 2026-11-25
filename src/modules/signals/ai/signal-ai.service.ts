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
import { stripLoneSurrogates, truncate } from "../../../common/text.util";
import { SignalKind, SignalSeverity } from "@prisma/client";
import {
  AI_MAX_RETRIES,
  AI_TIMEOUT_MS,
  MAX_MESSAGES_PER_CALL,
  MAX_OUTPUT_TOKENS,
  MAX_SIGNALS,
  MAX_SUMMARY,
  MODEL,
  PRODUCIBLE_KINDS,
  SIGNALS_SCHEMA,
  SUGGESTION_MIN_SEVERITY,
  SYSTEM_PROMPT,
} from "./signal-ai.constants";

/** Tahlilga beriladigan xabar (navbatdan o'qilgan qator). */
export interface AnalyzableMessage {
  /**
   * NAVBAT QATORINING ID'SI — `group_messages.id`.
   *
   * ⚠️ MODELGA BERILMAYDI (`buildUserText` da yo'q): u xabarni
   * Telegram'dagi `messageId` orqali ko'rsatadi. Bu ustun esa
   * CHAQIRUVCHIGA kerak — `AnalysisResult.consumed` dagi xabarlarni
   * aynan shu id bo'yicha "ko'rildi" deb belgilaydi. Avval servis
   * o'zining ro'yxatini belgilardi va modelga berilmagan xabarlar
   * ham muhrlanib ketardi (izoh `consumed` da).
   */
  id: string;
  chatId: string;
  messageId: string;
  senderTgId: string | null;
  senderName: string | null;
  text: string;
  replyToText: string | null;
  sentAt: Date;
}

/**
 * MODELGA BERILADIGAN YO'NALISH — `issue_categories` dan.
 *
 * ⚠️ `mobile-ai.service.ts#AnalyzableCategory` BILAN AYNI SHAKL va
 * bu ATAYLAB: ikkisi ham AYNI jadvaldan o'qiydi ("yo'nalishlar
 * ilovaga alohida ochilmaydi" doktrinasi, `schema.prisma`). Umumiy
 * tipga chiqarilmadi, chunki ikki modul bir-biriga bog'lanib
 * qolardi — shakl bir xil bo'lsa ham MAQSAD boshqa: biri fuqaroga
 * taklif qiladi, bu esa hisobot kesimini to'ldiradi.
 */
export interface AnalyzableCategory {
  id: string;
  name: string;
  description: string | null;
  /**
   * ⚠️ ASOSIY YO'NALISH NOMI — KICHIK YO'NALISH UCHUN. Yakka
   * "Ichimlik suvi" degan yozuv kontekstsiz qoladi va model uni
   * "Tozalik va ekologiya" bilan adashtirishi mumkin (mobil AI
   * dagi ayni sabab).
   */
  parentName?: string | null;
}

/** Tahlil natijasidagi bitta signal — bazaga shu shaklda yoziladi. */
export interface AnalyzedSignal {
  chatId: string;
  messageId: string;
  kind: SignalKind;
  severity: SignalSeverity;
  summary: string;
  /**
   * AI TAXMIN QILGAN YO'NALISH — `null` bo'lishi MUMKIN.
   *
   * ⚠️ `null` — NOSOZLIK EMAS: model ro'yxatda yo'q id qaytargan
   * bo'lsa (yoki yo'nalishlar umuman sozlanmagan bo'lsa) signal
   * BARIBIR yoziladi, faqat yo'nalishsiz. Shikoyatni yo'nalish
   * taxmini uchun tashlab yuborish eng yomon natija bo'lardi.
   */
  categoryId: string | null;
  senderTgId: string | null;
  senderName: string | null;
  sentAt: Date;
}

export interface AnalysisResult {
  signals: AnalyzedSignal[];
  model: string;
  /**
   * MODELGA HAQIQATAN BERILGAN xabarlar.
   *
   * ⚠️ BU MAYDON NOSOZLIKNI TUZATISH UCHUN QO'SHILDI. Avval
   * `analyze()` ichida `messages.slice(0, MAX_MESSAGES_PER_CALL)`
   * qilinardi, lekin `signals.service.ts` guruhning BARCHA navbatdagi
   * xabarini `analyzedAt` bilan belgilardi — ya'ni 15 dan ortig'i
   * modelga KO'RSATILMAY, lekin "ko'rildi" deb muhrlanardi va
   * `sweep()` ularni o'chirib yuborardi.
   *
   * O'LCHANGAN (2026-11-25): 54 holatda 15 dan ortiq xabar
   * belgilangan, JAMI 821 xabar modelga berilmasdan yo'qolgan (eng
   * kattasi — 93 xabarlik guruh, 78 tasi ko'rilmagan). Bu
   * `signal-ai.constants.ts#MAX_MESSAGES_PER_CALL` dagi "navbat
   * yo'qolmaydi, faqat sekinlashadi" izohiga TO'G'RIDAN-TO'G'RI
   * qarshi edi.
   *
   * ⚠️ CHEGARA SHU YERDA QOLADI (servisda emas): `MAX_MESSAGES_PER_CALL`
   * — so'rovning og'irligi haqidagi qaror va u so'rovni YUBORADIGAN
   * joyga tegishli. Servis esa nimani belgilashni SHU MAYDONDAN
   * biladi — taxmin qilmaydi.
   */
  consumed: AnalyzableMessage[];
}

/** Modeldan kelgan xom yozuv. */
interface RawSignal {
  messageId?: unknown;
  kind?: unknown;
  severity?: unknown;
  categoryId?: unknown;
}

/**
 * ⚠️ `PRODUCIBLE_KINDS`, `Object.values(SignalKind)` EMAS. Model
 * `question` qaytarsa u RAD ETILADI: toifa Prisma enum'ida hali
 * bor, lekin AI uni ishlab chiqarmaydi (izoh — konstantalar
 * faylida). Sxema ham shu ro'yxatni beradi, lekin sxema QIYMATNI
 * majburlamaydi (cheat sheet, §6) — ishonchli tekshiruv SHU YERDA.
 */
const VALID_KINDS = new Set<string>(PRODUCIBLE_KINDS);
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
    return Boolean(env.aiApiKey);
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
   * @param categories Panelda sozlangan FAOL yo'nalishlar. Bo'sh
   *   bo'lsa tahlil TO'XTAMAYDI — signallar yo'nalishsiz yoziladi
   *   (izoh `AnalyzedSignal.categoryId` da).
   *
   * @returns Nosozlikda `null` — xabarlar navbatda QOLADI.
   */
  async analyze(
    messages: AnalyzableMessage[],
    categories: AnalyzableCategory[] = [],
    recentSummaries: string[] = [],
  ): Promise<AnalysisResult | null> {
    const client = this.getClient();
    if (!client || messages.length === 0) return null;

    const batch = messages.slice(0, MAX_MESSAGES_PER_CALL);
    const byMessageId = new Map(batch.map((message) => [message.messageId, message]));
    const validCategories = new Set(categories.map((category) => category.id));

    let completion: OpenAI.Chat.Completions.ChatCompletion;
    try {
      completion = await client.chat.completions.create(
        {
          model: MODEL,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "user",
              /**
               * ⚠️ OXIRGI HIMOYA: yolg'iz surrogat BIZNING
               * kesishimizdan emas, MANBADAN ham kelishi mumkin
               * (Telegram buzuq matn uzatsa). O'sha holatda butun
               * guruh yana jimgina to'xtab qolardi — sabab esa
               * "no low surrogate" degan xatodan topilmasdi.
               * Izoh: `common/text.util.ts`.
               */
              content: stripLoneSurrogates(
                this.buildUserText(batch, categories, recentSummaries),
              ),
            },
          ],
          // ⚠️ JSON SXEMASI, `json_object` EMAS. Shlyuzda
          // TEKSHIRILGANI — `json_schema` (cheat sheet, §6);
          // `json_object` rejimi esa tekshirilmagan va shlyuz uni
          // rad etsa tahlil BUTUNLAY ishlamay qolardi. Sxema
          // berilganda javob shakli kafolatlanadi va `JSON.parse`
          // ```json``` bloki ustida yiqilmaydi.
          //
          // ⚠️ SXEMA QIYMATNI MAJBURLAMAYDI, FAQAT SHAKLNI (cheat
          // sheet, §6): `kind` ga `enum` berilgan bo'lsa ham model
          // begona qiymat qaytarishi mumkin — shuning uchun
          // `normalizeSignal` tekshiruvi O'RNIDA QOLADI.
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "signals",
              schema: SIGNALS_SCHEMA,
            },
          },
          // ⚠️ `max_tokens` — ISHLAYDI, lekin "yangi nomni shlyuz
          // e'tiborsiz qoldiradi" degan avvalgi sabab ENDI TO'G'RI
          // EMAS: 2026-11-18 da tekshirilganda `max_completion_tokens`
          // ham HURMAT QILINDI (20 berilganda javob aynan 20 tokenda
          // `finish_reason: "length"` bilan kesildi). Ya'ni ikkisi
          // ham yaroqli; `max_tokens` shunchaki O'RNIDA QOLDIRILDI,
          // chunki u tekshirilgan va almashtirish hech narsa
          // bermaydi.
          //
          // ⚠️ `temperature` YUBORILMAYDI — izoh konstantalar
          // faylida.
          max_tokens: MAX_OUTPUT_TOKENS,
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

    /**
     * ⚠️ AYNI `messageId` IKKI MARTA KELSA — BITTASI OLINADI.
     * Model bir javobda o'sha xabarni qayta-qayta ko'rsatishi mumkin
     * va har biri ALOHIDA qator bo'lib yozilardi: bazada 5 holat
     * topilgan (ayni `chat_id` + `message_id`, ayni soniyada ikki
     * signal). `group_signals` da `@@unique([chatId, messageId])` yo'q
     * va u ATAYLAB yo'q — bir xabar haqida HAR XIL mavzudagi ikki
     * signal bo'lishi mumkin — shuning uchun to'siq shu yerda.
     */
    const seen = new Set<string>();
    const signals = raw
      .map((item) => this.normalizeSignal(item, byMessageId, validCategories))
      .filter((item): item is AnalyzedSignal => item !== null)
      .filter((item) => {
        if (seen.has(item.messageId)) return false;
        seen.add(item.messageId);
        return true;
      })
      .slice(0, MAX_SIGNALS);

    return { signals, model: MODEL, consumed: batch };
  }

  // ───────────────────────────────────────────────────────────────

  /**
   * ⚠️ `baseURL` MAJBURIY: SDK standart holda `api.openai.com` ga
   * boradi. Berilmasa bizning kalit begona serverga yuborilardi va
   * xato 401 bo'lib ko'rinardi — ya'ni "kalit noto'g'ri" deb izlab,
   * sababini (manzil) topish qiyin bo'lardi.
   *
   * ⚠️ SDK O'ZGARMAYDI: shlyuz OpenAI bilan MOS (cheat sheet, §3),
   * ya'ni `openai` paketi o'z joyida qoladi va faqat manzil
   * almashadi. Qo'lda `fetch` yozish SSE'ni, qayta urinishni va
   * timeout'ni qaytadan yozishni talab qilardi.
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
   * Xabarlarni modelga beriladigan matnga aylantiradi.
   *
   * Har qator `#<id> [vaqt] Ism: matn` — model `messageId` ni shundan
   * oladi va biz signalni HAQIQIY xabarga bog'lay olamiz.
   *
   * ⚠️ YO'NALISHLAR RO'YXATI SHU YERDA, PROMPTDA EMAS: u panelda
   * o'zgaradigan JONLI ma'lumot (`issue_categories`). Promptga
   * yozilsa, yangi yo'nalish qo'shilganda ikkisi jimgina ajralib
   * ketardi — model esa endi yo'q bo'lgan id'ni qaytarib turardi.
   *
   * ⚠️ RO'YXAT XABARLARDAN KEYIN, OLDIN EMAS: uzun ro'yxat boshda
   * turganda model asosiy ishni (xabarlarni o'qish) ro'yxatdan
   * KEYIN ko'rardi. Oxirdagi ko'rsatma esa qaror payti yaqinroq
   * turadi.
   */
  private buildUserText(
    messages: AnalyzableMessage[],
    categories: AnalyzableCategory[],
    recentSummaries: string[] = [],
  ): string {
    const lines = messages
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
        //
        // ⚠️ `truncate`, `slice` EMAS — VA BU TIRIK NOSOZLIK
        // TUZATISHI. `slice(0, 120)` emojini surrogat juftligining
        // o'rtasidan kesib, shlyuzga yaroqsiz JSON yuborardi
        // ("no low surrogate"). Bitta guruh shu sababli
        // 24-noyabrdan beri umuman tahlil qilinmagan. Batafsil:
        // `common/text.util.ts`.
        const reply = message.replyToText
          ? ` (javob: "${truncate(message.replyToText, 120, "")}")`
          : "";

        return `#${message.messageId} [${time}] ${who}${reply}: ${message.text}`;
      })
      .join("\n");

    /**
     * ALLAQACHON QAYD ETILGAN — SHU GURUHNING OCHIQ SIGNALLARI.
     *
     * ⚠️ NIMA UCHUN MODELGA BERILADI: u bir aylanishda guruhdan
     * faqat 15 xabar ko'radi va O'ZINING avvalgi xulosasini
     * KO'RMAYDI. Shuning uchun bitta svet uzilishi ketma-ket
     * to'plamlarda qayta-qayta signal bo'lardi — promptdagi "bitta
     * signalga birlashtir" qoidasi faqat BITTA so'rov ichida
     * ishlaydi.
     *
     * ⚠️ BU KODDAGI TO'SIQNING O'RNINI BOSMAYDI
     * (`signals.service.ts` → `topicKey`), chunki model ro'yxatni
     * e'tiborsiz qoldirishi mumkin. Lekin filtr FAQAT tanigan
     * mavzularni birlashtiradi — ro'yxatga tushmagan takrorni
     * (masalan "it talayapti") faqat MODEL tutib qoladi. Ikkisi bir
     * joyni emas, BOSHQA-BOSHQA joyni yopadi.
     *
     * ⚠️ BO'SH BO'LSA BO'LIM QO'SHILMAYDI — yo'nalishlar bilan ayni
     * sabab: bo'sh sarlavha modelni chalg'itadi.
     */
    const recent =
      recentSummaries.length > 0
        ? [
            "",
            "ALLAQACHON QAYD ETILGAN (bu masalalarni QAYTA signal qilma):",
            ...recentSummaries.map((summary) => `- ${summary}`),
          ]
        : [];

    // ⚠️ YO'NALISH YO'Q BO'LSA BO'LIM UMUMAN QO'SHILMAYDI: bo'sh
    // "YO'NALISHLAR:" sarlavhasi modelni chalg'itib, o'zidan id
    // o'ylab topishga undardi.
    if (categories.length === 0) {
      return recent.length > 0 ? [lines, ...recent].join("\n") : lines;
    }

    const list = categories
      .map((category) => {
        // ⚠️ "ASOSIY → Kichik" (mobil AI bilan ayni sabab): yakka
        // "Ichimlik suvi" kontekstsiz qoladi.
        const label = category.parentName
          ? `${category.parentName} → ${category.name}`
          : category.name;

        return category.description
          ? `- ${category.id} — ${label} (${category.description})`
          : `- ${category.id} — ${label}`;
      })
      .join("\n");

    return [
      "XABARLAR:",
      lines,
      ...recent,
      "",
      "YO'NALISHLAR (categoryId faqat shu ro'yxatdan):",
      list,
    ].join("\n");
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
    validCategories: ReadonlySet<string>,
  ): AnalyzedSignal | null {
    if (!raw || typeof raw !== "object") return null;

    // ⚠️ BU TEKSHIRUV ENDI `question` NI HAM TUTADI: `VALID_KINDS`
    // `PRODUCIBLE_KINDS` dan yasalgan, ya'ni model eski toifani
    // qaytarsa signal TASHLANADI. Prisma enum'ida `question` hali
    // bor — demak bazaga yozilib ketishi MUMKIN edi va faqat shu
    // qator buni to'sib turadi.
    const kind = String(raw.kind ?? "").trim();
    if (!VALID_KINDS.has(kind)) return null;

    // ⚠️ XABARGA BOG'LANMAGAN SIGNAL TASHLANADI: matn ham, havola
    // ham, muallif ham, vaqt ham O'SHA xabardan keladi. Ularsiz
    // signal "kimdir nimadir dedi" bo'lib qolardi va tekshirib
    // bo'lmasdi. Model o'ylab topgan `messageId` ham shu yerda
    // ushlanadi.
    //
    // ⚠️ BOSHIDAGI `#` OLIB TASHLANADI. `qwen3.5` raqamni ro'yxatda
    // ko'rgan shaklida — `"#102"` deb qaytaradi (shlyuzda 3/3
    // takrorlangan), navbat kaliti esa YALANG'OCH `"102"`. Tozalanmasa
    // `byMessageId.get()` HAR DOIM bo'sh qaytarib, HAMMA signal
    // tashlanardi va buni topish deyarli imkonsiz bo'lardi:
    //   - AI chaqiruvi MUVAFFAQIYATLI (xato yo'q, log jim),
    //   - xabarlar `analyzedAt` bilan belgilanadi (navbat o'smaydi),
    //   - panelda esa "0 signal" — ya'ni "guruhda muammo yo'q" degan
    //     XULOSAGA o'xshab ko'rinardi.
    // Promptda ham aytilgan, lekin prompt KAFOLAT EMAS — tekshiruv
    // shu yerda.
    const messageId = String(raw.messageId ?? "")
      .trim()
      .replace(/^#/, "");
    const source = byMessageId.get(messageId);
    if (!source) return null;

    const text = source.text.trim();
    if (!text) return null;

    const severity = String(raw.severity ?? "").trim();

    const resolvedSeverity = VALID_SEVERITIES.has(severity)
      ? (severity as SignalSeverity)
      : SignalSeverity.normal;

    /**
     * ⚠️ PAST VA O'RTA DARAJADAGI TAKLIF OLINMAYDI — sozlama
     * qarori, izoh `SUGGESTION_MIN_SEVERITY` da. Promptda ham
     * aytilgan, lekin prompt KAFOLAT EMAS (`qwen3.5` ko'rsatmani
     * taxminan bajaradi) — ishonchli tekshiruv SHU YERDA, `kind`
     * tekshiruvidagi ayni mantiq bilan.
     *
     * ⚠️ SHIKOYATGA TEGISHLI EMAS: `complaint` har qanday
     * jiddiylikda yoziladi. Chegara FAQAT taklifga qo'yilgan,
     * chunki past darajali taklif — fikr, hal qilinishi kerak
     * bo'lgan muammo emas.
     *
     * ⚠️ SANOQCHI YO'Q, ATAYLAB: bu `question` toifasini tashlash
     * bilan ayni narsa — model ishlab chiqarmasligi KERAK bo'lgan
     * yozuv, shovqin emas. Shuning uchun `filtered` ga
     * qo'shilmaydi (u "shovqin" degan BOSHQA o'lchov) va jim
     * tashlanadi.
     */
    if (
      kind === SignalKind.suggestion &&
      resolvedSeverity !== SUGGESTION_MIN_SEVERITY
    ) {
      return null;
    }

    /**
     * ⚠️ BEGONA YO'NALISH SIGNALNI O'LDIRMAYDI, `null` ga tushadi.
     * Bu `messageId` dan FARQLI muomala va farq ataylab:
     *
     *   messageId yo'q  → signalni TEKSHIRIB BO'LMAYDI (matn ham,
     *                     havola ham, muallif ham o'sha xabardan) →
     *                     tashlanadi;
     *   categoryId yo'q → signal TO'LIQ, faqat hisobot kesimi
     *                     to'lmaydi → saqlanadi.
     *
     * Ikkisini bir xil qattiq tekshirish model yo'nalishni chalkash
     * tanlagani uchun HAQIQIY shikoyatni yo'qotardi.
     *
     * ⚠️ `mobile-ai` da bu teskari (`null` qaytaradi) — chunki u
     * yerda taklifning O'ZI yuk, bu yerda esa signal.
     */
    const rawCategoryId = String(raw.categoryId ?? "").trim();
    const categoryId = validCategories.has(rawCategoryId) ? rawCategoryId : null;

    return {
      chatId: source.chatId,
      messageId,
      kind: kind as SignalKind,
      severity: resolvedSeverity,
      categoryId,
      // Xabarning o'zi. Juda uzun bo'lsa kesiladi — to'lig'i havolada.
      // ⚠️ `truncate` — bazaga YOLG'IZ SURROGAT yozilmasligi uchun.
      // Buzuq `summary` keyin "allaqachon qayd etilgan" ro'yxatiga
      // tushib, shlyuzni YANA yiqitardi (`common/text.util.ts`).
      summary: truncate(text, MAX_SUMMARY),
      senderTgId: source.senderTgId,
      senderName: source.senderName,
      sentAt: source.sentAt,
    };
  }
}
