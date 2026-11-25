/**
 * SIGNALLAR — AI topgan muammolar bilan ishlash.
 *
 * Oqim:
 *
 *   bot guruhdan o'qiydi  →  group_messages (navbat)
 *   job har 30 daqiqada   →  AI tahlili  →  group_signals
 *   odam panelda ko'radi  →  kategoriya tanlaydi  →  issues
 *
 * ⚠️ SIGNAL — MUAMMO EMAS va bu butun modulning asosiy qarori.
 * Xulosani AI chiqargan, ya'ni u xato bo'lishi mumkin: hazilni
 * shikoyat deb, shikoyatni hazil deb topishi mumkin. Muammolar
 * ro'yxati esa ma'muriyat ishonadigan RASMIY navbat — unga
 * tekshirilmagan taxminni qo'yish o'sha ishonchni buzardi. Shuning
 * uchun signal ALOHIDA turadi va `issues` ga faqat ODAM qarori bilan
 * o'tadi (`attach`).
 */

import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";

import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../common/audit.service";
import {
  canTouchDistrict,
  isProvinceWide,
  signalScopeWhere,
  type ScopeContext,
} from "../../common/scope.util";
import { paginate, type Paginated } from "../../common/dto/pagination.dto";
import { IssueSource, SignalSeverity, SignalStatus } from "@prisma/client";
import { IssuesService } from "../issues/issues.service";
import { SettingsService } from "../settings/settings.service";
import { SignalAiService } from "./ai/signal-ai.service";
import {
  DUPLICATE_WINDOW_HOURS,
  MAX_RECENT_IN_PROMPT,
  MAX_RECENT_SUMMARY,
} from "./ai/signal-ai.constants";
import { detectNoise, fingerprint, topicKey } from "./ai/signal-noise.filter";
import type { AttachSignalDto, DismissSignalDto, ListSignalsQuery } from "./dto/signals.dto";

const MS_PER_HOUR = 3_600_000;

export interface AnalysisSummary {
  /** HAQIQATAN tahlil qilingan xabarlar soni. */
  analyzed: number;
  /** Yozilgan signallar soni. */
  signals: number;
  /** Ko'rilgan guruhlar soni. */
  groups: number;
  /** Tahlil qilinmay qolgan guruhlar (AI yiqildi) — keyin qayta ko'riladi. */
  failedGroups: number;
  /** Navbatda qolgan xabarlar. */
  pending: number;
  /**
   * SHOVQIN FILTRI TO'SGAN SIGNALLAR (`signal-noise.filter.ts`).
   *
   * ⚠️ PANELDA KO'RSATILADI va bu ATAYLAB: filtr jim ishlasa, u juda
   * qattiq bo'lib ketganini HECH KIM sezmasdi. Raqam o'sib ketsa —
   * ro'yxatni ko'rib, filtrni yumshatish kerak degan belgi.
   */
  filtered: number;
  /**
   * TAKROR DEB AVVALGI SIGNALGA QO'SHILGANLAR.
   *
   * ⚠️ "YO'QOTILDI" DEGANI EMAS: o'sha signalning `messageCount`
   * qamrovi oshadi, ya'ni shtab bitta masalani necha kishi
   * yozganini ko'radi.
   */
  merged: number;
  /** AI o'chirilgan yoki kalit yo'q. */
  skipped: boolean;
}

@Injectable()
export class SignalsService {
  private readonly logger = new Logger(SignalsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly ai: SignalAiService,
    private readonly settings: SettingsService,
    private readonly issues: IssuesService,
  ) {}

  // ═══════════════════════════════════════════════════════════════
  //  TAHLIL (job va panel chaqiradi)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Navbatdagi xabarlarni AI'ga berib, signallarni yozadi.
   *
   * ⚠️ XABARLAR GURUH BO'YICHA AJRATILADI (`signal-ai.service.ts`
   * izohi): ikki guruhning yozishmasi bitta so'rovga tushsa, model
   * ularni bir suhbat deb o'qib, xulosani aralashtirib yuborardi.
   */
  async runAnalysis(): Promise<AnalysisSummary> {
    const config = await this.settings.get();

    if (!config.aiEnabled || !this.ai.isEnabled()) {
      return {
        analyzed: 0,
        signals: 0,
        groups: 0,
        failedGroups: 0,
        pending: 0,
        filtered: 0,
        merged: 0,
        skipped: true,
      };
    }

    const pending = await this.prisma.groupMessage.findMany({
      where: { analyzedAt: null },
      orderBy: { sentAt: "asc" },
      take: config.aiMaxMessagesPerRun,
    });

    if (pending.length === 0) {
      return {
        analyzed: 0,
        signals: 0,
        groups: 0,
        failedGroups: 0,
        pending: 0,
        filtered: 0,
        merged: 0,
        skipped: false,
      };
    }

    /**
     * YO'NALISHLAR — AI SHULARDAN BIRINI TANLAYDI.
     *
     * ⚠️ BIR MARTA, AYLANISH BOSHIDA o'qiladi — har guruh uchun
     * emas. Ro'yxat bitta aylanish ichida o'zgarmaydi va 24 guruh
     * uchun 24 marta so'rash bekor ish bo'lardi.
     *
     * ⚠️ FAQAT FAOLLARI: o'chirilgan yo'nalish botda ham
     * ko'rsatilmaydi va unga yangi signal bog'lash "o'chirilgan
     * yo'nalishda 12 signal" degan ma'nosiz kesim berardi.
     *
     * ⚠️ BO'SH BO'LSA TAHLIL TO'XTAMAYDI: signallar yo'nalishsiz
     * yoziladi (`signal-ai.service.ts#AnalyzedSignal.categoryId`).
     * Yo'nalish sozlanmagani — AI'ni o'chirish uchun sabab emas.
     */
    const categories = await this.prisma.issueCategory.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        name: true,
        description: true,
        // ⚠️ OTA NOMI HAM: yakka "Ichimlik suvi" kontekstsiz qoladi
        // (mobil AI dagi ayni sabab).
        parent: { select: { name: true } },
      },
    });

    const analyzableCategories = categories.map((category) => ({
      id: category.id,
      name: category.name,
      description: category.description,
      parentName: category.parent?.name ?? null,
    }));

    const byChat = new Map<string, typeof pending>();
    for (const message of pending) {
      const bucket = byChat.get(message.chatId);
      if (bucket) bucket.push(message);
      else byChat.set(message.chatId, [message]);
    }

    /**
     * OYNA ICHIDAGI OCHIQ SIGNALLAR — TAKRORNI TO'SISH UCHUN.
     *
     * ⚠️ IKKI ISHNI BAJARADI va shuning uchun BIR MARTA o'qiladi:
     *   1) modelga "ALLAQACHON QAYD ETILGAN" ro'yxati bo'lib boradi;
     *   2) kodda barmoq izi va mavzu bo'yicha to'siq quriladi.
     *
     * ⚠️ FAQAT `new`: e'tiborsiz qoldirilgan (`dismissed`) signal
     * "bu masala ko'rilgan" degani EMAS — operator uni XATO deb
     * yopgan bo'lishi mumkin va o'sha masala qayta yozilishi KERAK.
     * Biriktirilgani (`attached`) esa allaqachon muammoga aylangan,
     * ya'ni rasmiy navbatda — uni signal sifatida takrorlash bekor.
     * Hozircha `new` yetarli: aynan u to'lib ketyapti.
     *
     * ⚠️ BITTA SO'ROV, HAR GURUH UCHUN ALOHIDA EMAS: 726 guruh bor
     * va har biriga so'rov yuborish aylanishni sekinlashtirardi
     * (yo'nalishlar bilan ayni mulohaza).
     */
    const since = new Date(Date.now() - DUPLICATE_WINDOW_HOURS * MS_PER_HOUR);

    const recentSignals = await this.prisma.groupSignal.findMany({
      where: {
        chatId: { in: [...byChat.keys()] },
        status: SignalStatus.new,
        createdAt: { gte: since },
      },
      select: { id: true, chatId: true, summary: true, severity: true },
      orderBy: { createdAt: "desc" },
    });

    /**
     * GURUH → TO'SIQ HOLATI.
     *
     * ⚠️ HOLAT AYLANISH ICHIDA O'SIB BORADI: shu aylanishda yozilgan
     * signal ham keyingilari uchun to'siq bo'ladi. Aks holda bitta
     * javobdagi "svet o'chdi" va "svetta nima gaplar" ikkisi ham
     * yozilardi.
     */
    const guards = new Map<
      string,
      { prints: Map<string, string>; topics: Map<string, string>; recent: string[] }
    >();

    for (const chatId of byChat.keys()) {
      guards.set(chatId, { prints: new Map(), topics: new Map(), recent: [] });
    }

    for (const signal of recentSignals) {
      const guard = guards.get(signal.chatId);
      if (!guard) continue;

      guard.prints.set(fingerprint(signal.summary), signal.id);

      /**
       * ⚠️ `high` MAVZU TO'SIG'IGA QO'SHILMAYDI. Xavfsizlik yoki
       * sog'liq masalasi "ayni mavzu" deb yopilsa, bolalar
       * maydonchasi haqidagi ikkinchi shikoyat jimgina yo'qolardi.
       * Barmoq izi to'sig'i esa unga HAM tegishli — u faqat AYNAN
       * bir xil matnni tutadi.
       */
      if (signal.severity === SignalSeverity.high) continue;

      const topic = topicKey(signal.summary);
      if (topic && !guard.topics.has(topic)) guard.topics.set(topic, signal.id);
    }

    // Modelga beriladigan ro'yxat — eng yangi `MAX_RECENT_IN_PROMPT` ta.
    for (const signal of recentSignals) {
      const guard = guards.get(signal.chatId);
      if (!guard || guard.recent.length >= MAX_RECENT_IN_PROMPT) continue;

      guard.recent.push(
        signal.summary.length > MAX_RECENT_SUMMARY
          ? `${signal.summary.slice(0, MAX_RECENT_SUMMARY)}…`
          : signal.summary,
      );
    }

    let created = 0;
    // ⚠️ HAQIQATAN TAHLIL QILINGANI SANALADI, OLINGANI EMAS. AI
    // yiqilsa xabar navbatda qoladi va uni "ko'rildi" deb sanash
    // panelda "4 ta xabar ko'rildi — gap topilmadi" degan YOLG'ON
    // xabarga aylanardi: aslida hech narsa ko'rilmagan edi.
    let analyzed = 0;
    let failedGroups = 0;
    let filtered = 0;
    let merged = 0;

    for (const [chatId, messages] of byChat) {
      const guard = guards.get(chatId) ?? {
        prints: new Map<string, string>(),
        topics: new Map<string, string>(),
        recent: [],
      };

      /**
       * BITTA GURUH — BIR AYLANISHDA BIR NECHTA SO'ROV.
       *
       * ⚠️ NIMA UCHUN HALQA, BITTA CHAQIRUV EMAS.
       * `MAX_MESSAGES_PER_CALL` — SO'ROVNING og'irligi haqidagi
       * chegara (shlyuz 60 xabarni uzib tashlardi), guruhning bir
       * aylanishda qancha ko'rilishi haqida EMAS. Ikkisi
       * aralashtirilganda guruhning quvvati sutkada
       * 15 × (24 × 60 / 30) = 720 xabarga qotib qolardi.
       *
       * ⚠️ O'LCHANGAN VA BU YETMAYDI: 726 guruhdan IKKITASI sutkada
       * 720 dan ko'p yozadi (843 va 729). Ular navbatda bir joyda
       * depsinib, `take: aiMaxMessagesPerRun` eng ESKIsini olgani
       * uchun o'sha qotgan xabarlar har aylanishda qayta tanlanib,
       * BOSHQA guruhlarning xabarini ham chetga surib qo'yardi —
       * ya'ni bitta faol guruh butun quvurni bo'g'ib qo'yishi
       * mumkin edi. Navbat esa o'smaydi deb o'ylangan, chunki
       * `sweep()` faqat TAHLIL QILINGANini o'chiradi.
       *
       * ⚠️ AVVAL BU KO'RINMAGAN, CHUNKI MA'LUMOT YO'QOLARDI:
       * 15 dan ortig'i "ko'rildi" deb muhrlanib, o'chib ketardi
       * (821 xabar — izoh `AnalysisResult.consumed` da). Nosozlik
       * tuzatilgandan keyin cheklov OCHILDI, shuning uchun
       * quvvat ham shu yerda oshiriladi.
       *
       * ⚠️ UMUMIY BUDJET O'RNIDA QOLADI: aylanish boshida
       * `aiMaxMessagesPerRun` ta xabar olinadi va halqa faqat SHU
       * ro'yxat ichida ishlaydi. Ya'ni 300 xabar → eng ko'pi 20
       * so'rov, sutkada 14 400 xabar quvvati (kelayotgani ~8 300).
       *
       * ⚠️ YON FOYDA: guruhning ikkinchi to'plami BIRINCHI
       * to'plamda yozilgan signallarni ko'radi (`guard.recent`
       * yangilanadi), ya'ni takror aynan shu yerda ham kamayadi.
       */
      let offset = 0;

      while (offset < messages.length) {
        const result = await this.ai.analyze(
          messages.slice(offset),
          analyzableCategories,
          guard.recent,
        );

        // ⚠️ NOSOZLIKDA `analyzedAt` QO'YILMAYDI: qo'yilsa xabarlar
        // tahlilsiz qolib, keyingi aylanishda ham olinmasdi — ya'ni
        // jimgina yo'qolardi.
        //
        // ⚠️ `break`, `continue` EMAS: shlyuz yiqilgan bo'lsa
        // guruhning qolgan to'plamlari ham yiqilardi va har biri
        // 60 soniya kutardi. Qolgani keyingi aylanishda ko'riladi.
        if (!result) {
          this.logger.warn(`${chatId} tahlil qilinmadi — keyingi aylanishda qayta uriniladi`);
          failedGroups += 1;
          break;
        }

        /**
         * ⚠️ HALQA TO'XTASHI KAFOLATLANADI. `analyze()` bo'sh
         * ro'yxatga `null` qaytaradi, ya'ni `consumed` kamida bitta
         * bo'lishi KERAK — lekin bu boshqa faylning xatti-harakatiga
         * ishonish bo'lardi. Nol qaytsa halqa cheksiz aylanib,
         * shlyuzni so'rovga ko'mib tashlardi.
         */
        if (result.consumed.length === 0) {
          this.logger.warn(`${chatId}: bo'sh to'plam qaytdi — aylanish to'xtatildi`);
          break;
        }

        offset += result.consumed.length;
        analyzed += result.consumed.length;

        for (const signal of result.signals) {
          /**
           * ── 1. SHOVQIN FILTRI ────────────────────────────────────
           *
           * ⚠️ MODEL JAVOBIDAN KEYIN, LEKIN BAZADAN OLDIN. Nega
           * umuman kerak — `signal-noise.filter.ts` izohiga qara:
           * promptdagi taqiqlar bir kun sinalib, ishlamagani
           * O'LCHANGAN.
           *
           * ⚠️ TO'SILGANI LOGGA CHIQADI, `debug` darajasida: kuniga
           * yuzlab yozuv bo'ladi va `log` ga chiqarilsa jurnalni
           * ko'mib tashlardi. Lekin UMUMAN yozmaslik ham xato —
           * filtr nimani qirqayotganini tekshirib bo'lmasdi.
           */
          const noise = detectNoise(signal.summary);
          if (noise) {
            filtered += 1;
            this.logger.debug(
              `shovqin [${noise}] ${chatId}#${signal.messageId}: ${signal.summary.slice(0, 60)}`,
            );
            continue;
          }

          /**
           * ── 2. AYNI MATN TAKRORI ─────────────────────────────────
           *
           * ⚠️ JIDDIYLIKDAN QAT'I NAZAR: aynan bir xil matn — bu
           * uzatilgan yoki qayta yuborilgan xabar, yangi xabar emas.
           */
          const print = fingerprint(signal.summary);
          const printOwner = guard.prints.get(print);

          /**
           * ── 3. AYNI MAVZU ────────────────────────────────────────
           *
           * ⚠️ `high` OZOD — `guards` qurilishidagi ayni sabab:
           * xavfsizlik masalasini "takror" deb yopib bo'lmaydi.
           */
          const topic = topicKey(signal.summary);
          const topicOwner =
            signal.severity === SignalSeverity.high || !topic
              ? undefined
              : guard.topics.get(topic);

          const owner = printOwner ?? topicOwner;

          if (owner) {
            /**
             * ⚠️ TASHLANMAYDI, AVVALGISIGA QO'SHILADI. `messageCount`
             * — "AI nechta xabarni ko'rib shu xulosaga kelgan" degan
             * QAMROV ustuni va takror aynan shunga qo'shiladi: shtab
             * bitta masalani NECHA KISHI yozganini ko'radi. Ya'ni
             * raqam "ko'rilgan xabar" emas, "masalaning og'irligi"
             * bo'lib ishlaydi.
             *
             * ⚠️ XATO YUTILADI: signal o'chirilgan bo'lishi mumkin
             * (operator shu orada yopdi). Qamrov yangilanmasligi —
             * tahlilni to'xtatish uchun sabab emas.
             */
            merged += 1;
            await this.prisma.groupSignal
              .update({
                where: { id: owner },
                data: { messageCount: { increment: 1 } },
              })
              .catch(() => undefined);
            continue;
          }

          try {
            const row = await this.prisma.groupSignal.create({
              data: {
                chatId: signal.chatId,
                messageId: signal.messageId,
                kind: signal.kind,
                severity: signal.severity,
                summary: signal.summary,
                // ⚠️ TAXMIN, FAKT EMAS: `null` bo'lishi mumkin va bu
                // signalni yozishga to'sqinlik qilmaydi (izoh
                // `signal-ai.service.ts#normalizeSignal` da).
                categoryId: signal.categoryId,
                senderTgId: signal.senderTgId,
                senderName: signal.senderName,
                sentAt: signal.sentAt,
                // Qamrov: AI nechta xabarni ko'rib shu xulosaga kelgan.
                messageCount: result.consumed.length,
                model: result.model,
              },
              select: { id: true },
            });
            created += 1;

            // ⚠️ YANGI SIGNAL O'ZI HAM TO'SIQQA AYLANADI — shu
            // aylanishning qolgan qismi uchun (izoh `guards` da).
            guard.prints.set(print, row.id);
            if (topic && signal.severity !== SignalSeverity.high) {
              if (!guard.topics.has(topic)) guard.topics.set(topic, row.id);
            }

            /**
             * ⚠️ MODELGA BERILADIGAN RO'YXAT HAM YANGILANADI:
             * guruhning KEYINGI to'plami shu signalni "allaqachon
             * qayd etilgan" deb ko'radi. Busiz 100 xabarlik guruh
             * bitta aylanishda 7 ta so'rovga bo'linib, har biri
             * o'zidan oldingisini ko'rmay, ayni masalani qayta-qayta
             * qaytarardi — ya'ni nosozlik tuzatishi shovqinni
             * ko'paytirib yuborardi.
             *
             * ⚠️ RO'YXAT BOSHIGA QO'YILADI va chegara saqlanadi:
             * eng yangi signal eng muhimi (izoh
             * `MAX_RECENT_IN_PROMPT` da).
             */
            guard.recent.unshift(
              signal.summary.length > MAX_RECENT_SUMMARY
                ? `${signal.summary.slice(0, MAX_RECENT_SUMMARY)}…`
                : signal.summary,
            );
            if (guard.recent.length > MAX_RECENT_IN_PROMPT) guard.recent.pop();
          } catch (error) {
            // ⚠️ BITTA SIGNAL YOZILMASA QOLGANLARI YOZILADI: aks holda
            // bitta yaroqsiz yozuv butun guruhning tahlilini
            // yo'qotardi.
            this.logger.warn(`Signal yozilmadi: ${(error as Error).message}`);
          }
        }

        /**
         * MODELGA BERILGAN xabarlar ko'rib chiqildi.
         *
         * ⚠️ `result.consumed`, `messages` EMAS — VA BU NOSOZLIK
         * TUZATISHI. `analyze()` so'rovni yengil saqlash uchun
         * birinchi `MAX_MESSAGES_PER_CALL` tasini oladi, bu yer esa
         * guruhning BARCHA navbatdagi xabarini "ko'rildi" deb
         * belgilardi — ya'ni ortig'i modelga ko'rsatilmay, keyingi
         * aylanishda ham olinmay, `sweep()` da o'chib ketardi.
         * O'LCHANGAN: 821 xabar shunday yo'qolgan (izoh
         * `signal-ai.service.ts#AnalysisResult.consumed` da).
         */
        await this.prisma.groupMessage.updateMany({
          where: { id: { in: result.consumed.map((message) => message.id) } },
          data: { analyzedAt: new Date() },
        });
      }
    }

    if (analyzed > 0) {
      // ⚠️ TO'SILGANLAR HAM AYTILADI: "12 signal" bilan "12 signal,
      // 40 shovqin to'sildi" — BOSHQA xabar. Ikkinchisi filtr
      // ishlayotganini va qancha ishlayotganini ko'rsatadi; raqam
      // g'ayritabiiy o'sib ketsa, filtrni ko'rib chiqish kerak.
      this.logger.log(
        `${byChat.size} guruh, ${analyzed} xabar tahlil qilindi — ` +
          `${created} signal (${filtered} shovqin to'sildi, ${merged} takror qo'shildi)`,
      );
    }

    return {
      analyzed,
      signals: created,
      groups: byChat.size,
      failedGroups,
      pending: pending.length - analyzed,
      filtered,
      merged,
      skipped: false,
    };
  }

  /**
   * Tahlil qilingan eski xabarlarni o'chiradi.
   *
   * ⚠️ FAQAT `analyzedAt` QO'YILGANLARI: tahlil qilinmagan xabar
   * navbatda turibdi va uni o'chirish signalni YO'QOTISH bo'lardi.
   *
   * ⚠️ NIMA UCHUN UMUMAN O'CHIRILADI: bu aholining yozishmasi va
   * `group_messages` — NAVBAT, arxiv emas. Signal esa qoladi, chunki
   * unga kerakli hamma narsa (matn, muallif, vaqt) KO'CHIRIB
   * OLINGAN.
   */
  async sweep(): Promise<{ deleted: number }> {
    const config = await this.settings.get();
    const cutoff = new Date(Date.now() - config.messageRetentionHours * MS_PER_HOUR);

    const { count } = await this.prisma.groupMessage.deleteMany({
      where: { analyzedAt: { not: null, lt: cutoff } },
    });

    if (count > 0) this.logger.log(`${count} ta eski xabar o'chirildi`);

    return { deleted: count };
  }

  // ═══════════════════════════════════════════════════════════════
  //  PANEL
  // ═══════════════════════════════════════════════════════════════

  async list(scope: ScopeContext, query: ListSignalsQuery): Promise<Paginated<unknown>> {
    const where = {
      ...signalScopeWhere(scope, { includeUnassigned: isProvinceWide(scope) }),
      // ⚠️ STANDART HOLDA FAQAT `new`: e'tiborsiz qoldirilganlar
      // o'chirilmaydi (AI xatosini ko'rish uchun), lekin ular ishga
      // xalaqit bermasligi kerak.
      status: query.status ?? SignalStatus.new,
      ...(query.kind ? { kind: query.kind } : {}),
      ...(query.severity ? { severity: query.severity } : {}),
      ...(query.chatId ? { chatId: query.chatId } : {}),
      /**
       * ⚠️ `categoryId` — AI TAXMINI bo'yicha filtr. Hisobotda
       * "Kommunal bo'yicha 40 signal" ko'ringanda operator shu
       * yerga o'tib, AYNAN o'sha 40 tasini ko'rishi kerak — aks
       * holda hisobot "qiziqarli raqam", lekin ishga aylanmaydi.
       */
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      /* ⚠️ `mahallaId` USTUN (issues bilan ayni mantiq). */
      ...(query.mahallaId
        ? { group: { mahallaId: query.mahallaId } }
        : query.districtId
          ? { group: { mahalla: { districtId: query.districtId } } }
          : {}),
      ...(query.search
        ? { summary: { contains: query.search, mode: "insensitive" as const } }
        : {}),
    };

    const [signals, total] = await Promise.all([
      this.prisma.groupSignal.findMany({
        where,
        // ⚠️ `severity` BO'YICHA SARALANMAYDI, `createdAt` bo'yicha:
        // yuqori jiddiylikdagi eski signal yangisini pastga surib,
        // "bugun nima bo'ldi" degan savolni ko'rinmas qilardi.
        // Jiddiylik — FILTR, saralash emas.
        orderBy: { createdAt: "desc" },
        skip: query.skip,
        take: query.limit,
        include: {
          group: {
            select: {
              chatId: true,
              title: true,
              username: true,
              mahalla: {
                select: { id: true, name: true, district: { select: { id: true, name: true } } },
              },
            },
          },
          // ⚠️ `color` VA `parent` HAM: panelda yo'nalish hamma
          // joyda O'Z rangi bilan ko'rinadi, yakka "Ichimlik suvi"
          // esa kontekstsiz qoladi (hisobot jadvali bilan ayni
          // mantiq).
          category: {
            select: { id: true, name: true, color: true, parent: { select: { name: true } } },
          },
          attachedUser: { select: { id: true, firstName: true, lastName: true } },
          dismissedUser: { select: { id: true, firstName: true, lastName: true } },
          issue: { select: { id: true, publicNo: true, status: true } },
        },
      }),
      this.prisma.groupSignal.count({ where }),
    ]);

    const items = signals.map((signal) => ({
      id: signal.id,
      kind: signal.kind,
      severity: signal.severity,
      summary: signal.summary,
      status: signal.status,

      /**
       * ⚠️ AI TAXMINI — `null` BO'LISHI MUMKIN va panel buni
       * AJRATIB ko'rsatadi ("yo'nalish aniqlanmadi"). Bo'sh joy
       * qoldirilsa, operator "Boshqa" deb o'ylab, hisobotdagi
       * raqamni noto'g'ri o'qiydi.
       */
      category: signal.category
        ? {
            id: signal.category.id,
            name: signal.category.name,
            parentName: signal.category.parent?.name ?? null,
            color: signal.category.color,
          }
        : null,

      senderName: signal.senderName,
      sentAt: signal.sentAt,
      messageCount: signal.messageCount,
      model: signal.model,
      createdAt: signal.createdAt,

      group: {
        chatId: signal.group.chatId,
        title: signal.group.title,
        mahalla: signal.group.mahalla,
      },

      messageLink: this.buildMessageLink(signal.group, signal.messageId),

      issue: signal.issue,
      attachedBy: signal.attachedUser,
      attachedAt: signal.attachedAt,
      dismissedBy: signal.dismissedUser,
      dismissedAt: signal.dismissedAt,
      dismissedReason: signal.dismissedReason,
    }));

    return paginate(items, total, query);
  }

  /** Holat bo'yicha sanoq — tabdagi belgi uchun. */
  async getCounts(scope: ScopeContext) {
    const scopeWhere = signalScopeWhere(scope, {
      includeUnassigned: isProvinceWide(scope),
    });

    const rows = await this.prisma.groupSignal.groupBy({
      by: ["status"],
      where: scopeWhere,
      _count: { _all: true },
    });

    const counts: Record<string, number> = { new: 0, attached: 0, dismissed: 0 };
    for (const row of rows) counts[row.status] = row._count._all;

    // Yangi signallar orasida nechtasi yuqori jiddiylikda — panelda
    // alohida ko'rsatiladi.
    const highNew = await this.prisma.groupSignal.count({
      where: { ...scopeWhere, status: SignalStatus.new, severity: "high" },
    });

    return { ...counts, highNew };
  }

  /**
   * SIGNALNI MUAMMOGA AYLANTIRADI — "tezkor biriktirish".
   *
   * Odam kategoriya tanlaydi, qolgan hamma narsa signaldan
   * ko'chiriladi.
   *
   * ⚠️ MUALLIF — BIRIKTIRGAN ODAM, xabar egasi emas. Sabab:
   * `Issue.authorId` `users` jadvaliga ishora qiladi, guruhda yozgan
   * odam esa AHOLI — u tizimda foydalanuvchi EMAS. Haqiqiy manba
   * yo'qolmaydi: ismi, guruh nomi va xabar havolasi `sourceMeta` da
   * qoladi.
   *
   * ⚠️ JAVOB BOTGA KETMAYDI: `authorChatId` ATAYLAB bo'sh
   * qoldiriladi. To'ldirilsa, muammo yopilganda javob O'SHA MFY
   * GURUHIGA yuborilardi — bot esa u yerda KUZATUVCHI va hech narsa
   * yozmasligi kerak.
   */
  async attach(id: string, dto: AttachSignalDto, scope: ScopeContext) {
    const signal = await this.prisma.groupSignal.findUnique({
      where: { id },
      include: {
        group: {
          select: {
            chatId: true,
            title: true,
            username: true,
            mahallaId: true,
            mahalla: { select: { districtId: true } },
          },
        },
      },
    });
    if (!signal) throw new NotFoundException("Signal topilmadi");

    if (!canTouchDistrict(scope, signal.group.mahalla?.districtId ?? null)) {
      throw new BadRequestException("Bu signal sizning qamrovingizda emas");
    }

    if (signal.status === SignalStatus.attached) {
      throw new ConflictException("Bu signal allaqachon muammoga biriktirilgan");
    }

    const link = this.buildMessageLink(signal.group, signal.messageId);

    // ⚠️ MUAMMO VA SIGNAL BIR TRANZAKSIYADA: ikkisi orasida uzilish
    // bo'lsa, muammo yaratilib, signal `new` holida qolardi — va u
    // ikkinchi marta biriktirilib, IKKI muammo paydo bo'lardi.
    const issue = await this.prisma.$transaction(async (tx) => {
      const created = await this.issues.createFromSignal(
        tx,
        {
          categoryId: dto.categoryId,
          mahallaId: signal.group.mahallaId,
          title: dto.title?.trim() || this.deriveTitle(signal.summary),
          body: signal.summary,
          priority: dto.priority,
          authorId: scope.userId,
          sourceMeta: {
            signalId: signal.id,
            kind: signal.kind,
            severity: signal.severity,
            groupTitle: signal.group.title,
            groupChatId: signal.group.chatId,
            senderName: signal.senderName,
            sentAt: signal.sentAt?.toISOString() ?? null,
            messageLink: link,
            model: signal.model,
          },
        },
      );

      // ⚠️ `updateMany` + HOLAT SHARTI — compare-and-swap. Ikki
      // operator bir vaqtda bosgan holatda ikkinchisi 0 qator
      // yangilaydi va xato oladi; `update` ishlatilsa ikkinchisi
      // birinchining natijasini JIMGINA ustiga yozardi.
      const { count } = await tx.groupSignal.updateMany({
        where: { id, status: { not: SignalStatus.attached } },
        data: {
          status: SignalStatus.attached,
          issueId: created.id,
          attachedBy: scope.userId,
          attachedAt: new Date(),
          // Avval e'tiborsiz qoldirilgan bo'lsa — belgisi tozalanadi.
          dismissedBy: null,
          dismissedAt: null,
          dismissedReason: null,
        },
      });

      if (count !== 1) {
        throw new ConflictException(
          "Signal holati o'zgardi — sahifani yangilab, qaytadan urinib ko'ring",
        );
      }

      return created;
    });

    await this.audit.record({
      userId: scope.userId,
      action: "signal.attach",
      entity: "GroupSignal",
      entityId: id,
      meta: { issueId: issue.id, publicNo: issue.publicNo },
    });

    return { signalId: id, issueId: issue.id, publicNo: issue.publicNo };
  }

  /**
   * E'TIBORSIZ QOLDIRADI — "bu muammo emas".
   *
   * ⚠️ O'CHIRILMAYDI: AI nimani noto'g'ri topganini ko'rish kerak —
   * prompt aynan shu yozuvlarga qarab tuzatiladi. Ro'yxat standart
   * holda faqat yangilarini ko'rsatadi, ya'ni bu yozuvlar ishga
   * xalaqit bermaydi.
   */
  async dismiss(id: string, dto: DismissSignalDto, scope: ScopeContext) {
    const signal = await this.prisma.groupSignal.findUnique({
      where: { id },
      include: { group: { select: { mahalla: { select: { districtId: true } } } } },
    });
    if (!signal) throw new NotFoundException("Signal topilmadi");

    if (!canTouchDistrict(scope, signal.group.mahalla?.districtId ?? null)) {
      throw new BadRequestException("Bu signal sizning qamrovingizda emas");
    }

    // ⚠️ BIRIKTIRILGANNI E'TIBORSIZ QOLDIRIB BO'LMAYDI: muammo
    // allaqachon rasmiy navbatda va signalni "bu muammo emas" deb
    // belgilash ikki joyda qarama-qarshi haqiqat yaratardi.
    // To'g'ri yo'l — muammoning O'ZINI rad etish.
    if (signal.status === SignalStatus.attached) {
      throw new ConflictException(
        "Muammoga biriktirilgan signalni e'tiborsiz qoldirib bo'lmaydi — muammoni rad eting",
      );
    }

    await this.prisma.groupSignal.update({
      where: { id },
      data: {
        status: SignalStatus.dismissed,
        dismissedBy: scope.userId,
        dismissedAt: new Date(),
        dismissedReason: dto.reason?.trim() || null,
      },
    });

    await this.audit.record({
      userId: scope.userId,
      action: "signal.dismiss",
      entity: "GroupSignal",
      entityId: id,
      meta: { reason: dto.reason ?? null },
    });

    return { id, status: SignalStatus.dismissed };
  }

  // ───────────────────────────────────────────────────────────────

  /**
   * TELEGRAM XABARIGA HAVOLA.
   *
   * ⚠️ IKKI XIL SHAKL BOR va ikkalasi ham kerak:
   *
   *   ommaviy guruh (username bor) → https://t.me/<username>/<id>
   *   yopiq guruh (username yo'q)  → https://t.me/c/<chatId -100>/<id>
   *
   * `-100` prefiksi supergruppa `chat_id` sining ICHKI qismi va
   * havolada ishlatilmaydi — olib tashlanmasa havola ochilmaydi.
   *
   * ⚠️ `t.me/c/...` havolasi faqat O'SHA GURUH A'ZOSIGA ochiladi. Bu
   * kamchilik emas: guruhda bo'lmagan odam xabarni ko'rmasligi
   * to'g'ri.
   */
  private buildMessageLink(
    group: { chatId: string; username: string | null },
    messageId: string | null,
  ): string | null {
    if (!messageId) return null;

    if (group.username) return `https://t.me/${group.username}/${messageId}`;

    if (!group.chatId.startsWith("-100")) return null;

    return `https://t.me/c/${group.chatId.slice(4)}/${messageId}`;
  }

  /**
   * Signal matnidan muammo SARLAVHASINI yasaydi.
   *
   * ⚠️ AI'DAN SO'RALMAYDI: sarlavha uchun alohida so'rov pul
   * sarflaydi va natija "Suv ta'minoti bo'yicha murojaat" kabi
   * rasmiy o'ramga aylanadi. Birinchi gap aholi so'zi bilan
   * yetarlicha aniq, odam esa biriktirishda uni tahrirlashi mumkin.
   */
  private deriveTitle(summary: string): string {
    const firstSentence = summary.split(/[.!?\n]/)[0]?.trim() || summary.trim();
    return firstSentence.length > 90
      ? `${firstSentence.slice(0, 90)}…`
      : firstSentence || "Guruhdan kelgan murojaat";
  }
}
