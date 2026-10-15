/**
 * GURUH KUZATUVI — fon ishi.
 *
 * Bot to'plagan xabarlar o'qiladi, AI ularning orasidan shikoyat /
 * taklif / javobsiz savolni ajratadi va natija "Signallar" sahifasida
 * ko'rinadi.
 *
 * ── NIMA UCHUN HAR DAQIQADA ISHGA TUSHADI ─────────────────────────────
 *
 * ⚠️ CRON IFODASI `*\/30 * * * *` DEB QOTIB QOLMAGAN: job har daqiqada
 * ishga tushadi va "vaqti keldimi" deb O'ZI tekshiradi
 * (`Settings.aiIntervalMinutes`). Sabab: oraliq panelda
 * o'zgartiriladigan sozlama va cron ifodasi kodda bo'lsa, uni
 * o'zgartirish uchun DEPLOY kerak bo'lardi. Har daqiqadagi tekshiruv
 * esa bitta `SELECT` — arzon.
 *
 * ── NIMA UCHUN 30 DAQIQA, HAR XABARDA EMAS ────────────────────────────
 *
 * ⚠️ Bitta so'rovga o'nlab xabar BIRGA ketadi va model SUHBATNI
 * ko'radi. "Ha, bizda ham shunday" degan gap yolg'iz o'zi ma'nosiz,
 * oldingi xabar bilan birga esa shikoyatning DAVOMI. Ustiga bu
 * arzonroq: har xabar uchun alohida so'rov yuborish kerak emas.
 *
 * ── BIR VAQTDA BITTA AYLANISH ─────────────────────────────────────────
 *
 * ⚠️ Panelda "Hozir tekshirish" tugmasi bor va u cron bilan ustma-ust
 * tushishi mumkin: ikki aylanish bir vaqtda ketsa, IKKALASI ham ayni
 * xabarlarni o'qib (`analyzedAt` hali qo'yilmagan), ayni signalni IKKI
 * MARTA yozardi — ustiga AI hisobi ham ikki barobar bo'lardi. Shuning
 * uchun ikkinchi chaqiruv yangi aylanish BOSHLAMAYDI, birinchisini
 * KUTADI va uning natijasini oladi.
 */

import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";

import { PrismaService } from "../../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { IssueNotifyService } from "../issues/issue-notify.service";
import { SignalAiService } from "./ai/signal-ai.service";
import { SignalsService, type AnalysisSummary } from "./signals.service";
import { SignalSeverity, SignalStatus } from "@prisma/client";

const MS_PER_MINUTE = 60_000;

/** Jiddiylik tartibi — "shu darajadan boshlab xabar yubor" uchun. */
const SEVERITY_RANK: Record<SignalSeverity, number> = {
  [SignalSeverity.low]: 0,
  [SignalSeverity.normal]: 1,
  [SignalSeverity.high]: 2,
};

@Injectable()
export class SignalsJob implements OnModuleInit {
  private readonly logger = new Logger(SignalsJob.name);

  /** HOZIR ISHLAYOTGAN aylanish (bo'lmasa `null`). */
  private running: Promise<AnalysisSummary> | null = null;

  private lastRunAt: Date | null = null;
  private lastResult: AnalysisSummary | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly signals: SignalsService,
    private readonly settings: SettingsService,
    private readonly ai: SignalAiService,
    private readonly notify: IssueNotifyService,
  ) {}

  onModuleInit(): void {
    if (!this.ai.isEnabled()) {
      // ⚠️ BIR MARTA AYTILADI, har aylanishda emas: har 30 daqiqada
      // ogohlantirish yozilsa log shunchaki to'lib ketardi.
      this.logger.warn(
        "OPENAI_API_KEY yo'q — guruh xabarlari to'planadi, lekin tahlil qilinmaydi",
      );
      return;
    }

    this.logger.log(`Guruh kuzatuvi yoqildi: ${this.ai.model}`);
  }

  /**
   * ⚠️ HAR DAQIQADA, lekin ICHIDA vaqt tekshiriladi (fayl boshidagi
   * izoh). `timeZone` berilgan: sozlamadagi oraliq Toshkent vaqtiga
   * nisbatan hisoblanadi.
   */
  @Cron(CronExpression.EVERY_MINUTE, { timeZone: "Asia/Tashkent" })
  async tick(): Promise<void> {
    const config = await this.settings.get().catch(() => null);
    if (!config || !config.aiEnabled) return;

    if (this.lastRunAt) {
      const elapsed = Date.now() - this.lastRunAt.getTime();
      if (elapsed < config.aiIntervalMinutes * MS_PER_MINUTE) return;
    }

    await this.runNow();
  }

  /**
   * BITTA AYLANISH. Cron ham, panel ham shuni chaqiradi.
   *
   * ⚠️ XATO YUQORIGA CHIQMAYDI: bu fon ishi va yiqilishi jarayonni
   * to'xtatmasligi kerak. Panel javobni natijadan biladi.
   */
  async runNow(): Promise<AnalysisSummary> {
    // ⚠️ IKKINCHI CHAQIRUV BIRINCHISINI KUTADI — fayl boshidagi izoh.
    if (this.running) return this.running;

    this.running = this.runPass().finally(() => {
      this.running = null;
    });

    return this.running;
  }

  /** Panelda ko'rsatiladigan holat. */
  getStatus(): {
    isRunning: boolean;
    lastRunAt: Date | null;
    lastResult: AnalysisSummary | null;
  } {
    return {
      isRunning: this.running !== null,
      lastRunAt: this.lastRunAt,
      lastResult: this.lastResult,
    };
  }

  // ───────────────────────────────────────────────────────────────

  private async runPass(): Promise<AnalysisSummary> {
    // ⚠️ VAQT AYLANISH BOSHIDA BELGILANADI, oxirida emas: uzoq
    // davom etgan aylanish (300 xabar, o'nlab guruh) tugaganda
    // keyingi tekshiruv darhol yana ishga tushib ketardi.
    this.lastRunAt = new Date();

    try {
      const result = await this.signals.runAnalysis();
      this.lastResult = result;

      if (result.failedGroups > 0) {
        this.logger.warn(
          `${result.failedGroups} guruh tahlil qilinmadi — keyingi aylanishda qayta ko'riladi`,
        );
      }

      // ⚠️ XABARNOMA TAHLILDAN KEYIN: signallar allaqachon yozilgan
      // va ularni bazadan O'QIB yuborish kerak — tahlil natijasidan
      // emas. Sabab: yozilmagan signal (unique xatosi, yaroqsiz
      // qator) xabarnomaga tushib ketmasligi kerak.
      if (result.signals > 0) await this.sendAlerts();

      // Eski, tahlil qilingan xabarlarni tozalash — aholining
      // yozishmasi bizda saqlanib qolmasligi kerak.
      await this.signals.sweep();

      return result;
    } catch (error) {
      this.logger.error(`Tahlil aylanishida xato: ${(error as Error).message}`);

      const failed: AnalysisSummary = {
        analyzed: 0,
        signals: 0,
        groups: 0,
        failedGroups: 0,
        pending: 0,
        skipped: false,
      };
      this.lastResult = failed;
      return failed;
    }
  }

  /**
   * YUQORI JIDDIYLIKDAGI YANGI SIGNALLAR — mas'ul chatlarga.
   *
   * ⚠️ `alertedAt` USTUNI YO'Q, shuning uchun OXIRGI AYLANISHDA
   * yozilganlar olinadi (`createdAt >= lastRunAt`). Ustun qo'shish
   * to'g'riroq bo'lardi, lekin u har signalga yana bitta UPDATE
   * qo'shardi — vaqt oynasi esa bu yerda yetarli aniq: aylanishlar
   * ketma-ket va bir vaqtda ikkitasi ishlamaydi.
   */
  private async sendAlerts(): Promise<void> {
    const config = await this.settings.get();
    if (config.alertChatIds.length === 0) return;

    const minRank = SEVERITY_RANK[config.alertMinSeverity];
    const severities = (Object.keys(SEVERITY_RANK) as SignalSeverity[]).filter(
      (severity) => SEVERITY_RANK[severity] >= minRank,
    );

    const signals = await this.prisma.groupSignal.findMany({
      where: {
        status: SignalStatus.new,
        severity: { in: severities },
        createdAt: { gte: this.lastRunAt ?? new Date(0) },
      },
      include: {
        group: {
          select: { title: true, username: true, chatId: true, mahalla: { select: { name: true } } },
        },
      },
      // ⚠️ CHEGARA: bir aylanishda 50 signal chiqsa (bayram kuni,
      // ommaviy nosozlik), 50 ta xabar yuborish Telegram
      // chegarasiga urib, hech biri yetib bormay qolishi mumkin.
      take: 10,
    });

    if (signals.length === 0) return;

    for (const signal of signals) {
      const link = signal.messageId
        ? signal.group.username
          ? `https://t.me/${signal.group.username}/${signal.messageId}`
          : signal.group.chatId.startsWith("-100")
            ? `https://t.me/c/${signal.group.chatId.slice(4)}/${signal.messageId}`
            : null
        : null;

      await this.notify.sendSignalAlert({
        chatIds: config.alertChatIds,
        groupTitle: signal.group.title,
        mahallaName: signal.group.mahalla?.name ?? null,
        summary: signal.summary,
        messageLink: link,
      });
    }

    this.logger.log(`${signals.length} ta signal bo'yicha xabarnoma yuborildi`);
  }
}
