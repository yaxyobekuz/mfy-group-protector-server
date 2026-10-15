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
import { IssueSource, SignalStatus } from "@prisma/client";
import { IssuesService } from "../issues/issues.service";
import { SettingsService } from "../settings/settings.service";
import { SignalAiService } from "./ai/signal-ai.service";
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
      return { analyzed: 0, signals: 0, groups: 0, failedGroups: 0, pending: 0, skipped: true };
    }

    const pending = await this.prisma.groupMessage.findMany({
      where: { analyzedAt: null },
      orderBy: { sentAt: "asc" },
      take: config.aiMaxMessagesPerRun,
    });

    if (pending.length === 0) {
      return { analyzed: 0, signals: 0, groups: 0, failedGroups: 0, pending: 0, skipped: false };
    }

    const byChat = new Map<string, typeof pending>();
    for (const message of pending) {
      const bucket = byChat.get(message.chatId);
      if (bucket) bucket.push(message);
      else byChat.set(message.chatId, [message]);
    }

    let created = 0;
    // ⚠️ HAQIQATAN TAHLIL QILINGANI SANALADI, OLINGANI EMAS. AI
    // yiqilsa xabar navbatda qoladi va uni "ko'rildi" deb sanash
    // panelda "4 ta xabar ko'rildi — gap topilmadi" degan YOLG'ON
    // xabarga aylanardi: aslida hech narsa ko'rilmagan edi.
    let analyzed = 0;
    let failedGroups = 0;

    for (const [chatId, messages] of byChat) {
      const result = await this.ai.analyze(messages);

      // ⚠️ NOSOZLIKDA `analyzedAt` QO'YILMAYDI: qo'yilsa xabarlar
      // tahlilsiz qolib, keyingi aylanishda ham olinmasdi — ya'ni
      // jimgina yo'qolardi.
      if (!result) {
        this.logger.warn(`${chatId} tahlil qilinmadi — keyingi aylanishda qayta uriniladi`);
        failedGroups += 1;
        continue;
      }

      analyzed += messages.length;

      for (const signal of result.signals) {
        try {
          await this.prisma.groupSignal.create({
            data: {
              chatId: signal.chatId,
              messageId: signal.messageId,
              kind: signal.kind,
              severity: signal.severity,
              summary: signal.summary,
              senderTgId: signal.senderTgId,
              senderName: signal.senderName,
              sentAt: signal.sentAt,
              // Qamrov: AI nechta xabarni ko'rib shu xulosaga kelgan.
              messageCount: messages.length,
              model: result.model,
            },
          });
          created += 1;
        } catch (error) {
          // ⚠️ BITTA SIGNAL YOZILMASA QOLGANLARI YOZILADI: aks holda
          // bitta yaroqsiz yozuv butun guruhning tahlilini
          // yo'qotardi.
          this.logger.warn(`Signal yozilmadi: ${(error as Error).message}`);
        }
      }

      // Shu guruhning xabarlari ko'rib chiqildi.
      await this.prisma.groupMessage.updateMany({
        where: { id: { in: messages.map((message) => message.id) } },
        data: { analyzedAt: new Date() },
      });
    }

    if (analyzed > 0) {
      this.logger.log(
        `${byChat.size} guruh, ${analyzed} xabar tahlil qilindi — ${created} signal`,
      );
    }

    return {
      analyzed,
      signals: created,
      groups: byChat.size,
      failedGroups,
      pending: pending.length - analyzed,
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
      ...(query.mahallaId ? { group: { mahallaId: query.mahallaId } } : {}),
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
