/**
 * TARQATMA — PANELDAN VA BOTDAN YUBORILADIGAN XABAR.
 *
 * ⚠️ IKKI YO'L, BITTA XIZMAT (doktrina): `POST /broadcasts`
 * (panel) va `POST /bot/admin/broadcasts` (bot) SHU yerga keladi.
 * Nusxa yozilsa, "paneldan yuborilgani MFY siz guruhlarni
 * chetlab o'tadi, botdan yuborilgani esa yo'q" kabi ajralishlar
 * paydo bo'lardi.
 *
 * ── NIMA O'ZGARDI (2026-11-27) ────────────────────────────────
 *
 * Avval tarqatma "matn yoz va yubor" dan iborat edi. Endi:
 *
 *   auditoriya  — fuqaro / faol fuqaro / guruh / KANAL / aniq
 *                 chatlar / hammasi
 *   ko'rinish   — tugmalar, HTML, havola ko'rinishi, ovozsiz,
 *                 guruhga QADASH
 *   vaqt        — hoziroq yoki REJALASHTIRILGAN
 *   nazorat     — BEKOR QILISH, yetkazish JURNALI, faqat yetib
 *                 bormaganlariga QAYTA yuborish
 *
 * ⚠️ HAR QADAM NAZORAT QILINADIGAN BO'LISHI SHART: guruhga
 * yuborilgan xabarni O'CHIRIB BO'LMAYDI va u yuzlab odamning
 * ko'z o'ngida turadi. Shuning uchun yuborishdan oldin auditoriya
 * hajmi ko'rsatiladi, yuborish paytida uni to'xtatish mumkin, va
 * yuborilgandan keyin "kimga yetdi" degan savolga aniq javob
 * bor.
 */

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleInit,
} from "@nestjs/common";
import {
  BroadcastAudience,
  BroadcastDelivery,
  BroadcastMode,
  BroadcastParseMode,
  BroadcastStatus,
  Prisma,
} from "@prisma/client";

import { paginate, type Paginated } from "../../common/dto/pagination.dto";
import {
  canTouchDistrict,
  districtScopeWhere,
  isProvinceWide,
  type ScopeContext,
} from "../../common/scope.util";
import {
  copyMessage,
  escapeHtml,
  forwardMessage,
  pinChatMessage,
  sendMessage,
  type SendOptions,
  type TelegramButton,
} from "../../common/telegram";
import { env } from "../../config/env.config";
import { PrismaService } from "../../prisma/prisma.service";
import {
  collectTargets,
  summarizeTargets,
  type BroadcastTarget,
} from "./broadcast-targets";
import type {
  CreateBroadcastDto,
  ListBroadcastsQuery,
  ListRecipientsQuery,
} from "./dto/broadcasts.dto";

/**
 * ⚠️ PAUZA MAJBURIY: Telegram sekundiga ~30 xabarga ruxsat beradi
 * va pauzasiz tarqatma birinchi 30 tadan keyin to'xtab qolardi.
 */
const SEND_GAP_MS = 40;

/**
 * ⚠️ GURUHGA PAUZA KATTA: guruh va kanalga yuborishda Telegram
 * chegarasi ANCHA qattiq (daqiqasiga ~20 xabar) va 40 ms bilan
 * birinchi o'nlikdan keyin `429` boshlanardi.
 */
const GROUP_GAP_MS = 1000;

/**
 * ⚠️ HAR 25 MANZILDA BAZAGA YOZILADI: har xabardan keyin yozish
 * bazani bekorga yuklardi, umuman yozmaslik esa panelda
 * "0 yuborildi" degan qotib qolgan sonni ko'rsatardi — operator
 * tarqatma ishlamayapti deb o'ylardi.
 */
const PROGRESS_EVERY = 25;

/** Jurnal qatorlari ham bo'laklab yoziladi. */
const LOG_CHUNK = 200;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** Tugmalar `Json` ustunidan o'qiladi. */
const parseButtons = (value: Prisma.JsonValue | null): TelegramButton[] => {
  if (!Array.isArray(value)) return [];

  return value
    .filter(
      (item): item is { text: string; url: string } =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as { text?: unknown }).text === "string" &&
        typeof (item as { url?: unknown }).url === "string",
    )
    .map((item) => ({ text: item.text, url: item.url }));
};

@Injectable()
export class BroadcastsService implements OnModuleInit {
  private readonly logger = new Logger(BroadcastsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * ⚠️ YARIM QOLGAN TARQATMALAR YOPILADI: server qayta ishga
   * tushganda xotiradagi sikl yo'qoladi va yozuv abadiy
   * `sending` da qolardi — panelda u "hozir yuborilyapti" bo'lib
   * ko'rinib, operator kutib yurardi.
   *
   * ⚠️ REJALASHTIRILGANLARGA TEGILMAYDI: ular hali boshlanmagan
   * va ularning vaqti kelganda job o'zi oladi.
   */
  async onModuleInit(): Promise<void> {
    const staleBefore = new Date(Date.now() - 2 * 60 * 60 * 1000);

    const { count } = await this.prisma.broadcast
      .updateMany({
        where: {
          status: { in: [BroadcastStatus.pending, BroadcastStatus.sending] },
          createdAt: { lt: staleBefore },
        },
        data: {
          status: BroadcastStatus.failed,
          error:
            "Server qayta ishga tushganda uzilib qoldi — yetib bormaganlariga qayta yuborish mumkin",
          finishedAt: new Date(),
        },
      })
      .catch(() => ({ count: 0 }));

    if (count > 0) {
      this.logger.warn(`${count} ta yarim qolgan tarqatma yopildi`);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  TEKSHIRUV VA QAMROV
  // ═══════════════════════════════════════════════════════════════

  /**
   * MAZMUN TEKSHIRUVI.
   *
   * ⚠️ YUBORISHDAN OLDIN, YOZUV YARATILMASDAN: nosoz tarqatma
   * bazada "failed" bo'lib qolsa, tarix befoyda qatorlar bilan
   * to'lardi va "nechta tarqatma yuborildi" degan son buzilardi.
   */
  private assertContent(dto: {
    mode: BroadcastMode;
    message?: string;
    fromChatId?: string;
    sourceMessageId?: string;
    buttons?: TelegramButton[];
  }): void {
    if (!env.botToken) {
      throw new BadRequestException("BOT_TOKEN sozlanmagan — xabar yuborib bo'lmaydi");
    }

    if (dto.mode === BroadcastMode.text) {
      if (!dto.message?.trim()) {
        throw new BadRequestException("Xabar matni bo'sh");
      }
    } else if (!dto.fromChatId || !dto.sourceMessageId) {
      throw new BadRequestException(
        "Uzatiladigan xabar ko'rsatilmagan — avval xabarni botga tashlang",
      );
    }

    /**
     * ⚠️ TUGMA FAQAT `text` VA `copy` DA: Telegram
     * `forwardMessage` da `reply_markup` ni UMUMAN qabul qilmaydi
     * va tugmalar JIMGINA yo'qolardi — operator ularni
     * qo'ygan deb o'ylab yurardi.
     */
    if (dto.buttons?.length && dto.mode === BroadcastMode.forward) {
      throw new BadRequestException(
        "Uzatilgan xabarga tugma qo'shib bo'lmaydi — «asl holatda» (copy) rejimini tanlang",
      );
    }

    for (const button of dto.buttons ?? []) {
      /**
       * ⚠️ FAQAT `https`: Telegram `http` havolali tugmani ba'zi
       * mijozlarda ochmaydi va xabar yuborilgandan keyin buni
       * TUZATIB BO'LMAYDI.
       */
      if (!/^https:\/\//i.test(button.url)) {
        throw new BadRequestException(
          `Tugma havolasi «https://» bilan boshlanishi kerak: ${button.text}`,
        );
      }
    }
  }

  /**
   * QAMROVNI HAL QILADI VA TEKSHIRADI.
   *
   * ⚠️ TUMAN QAMROVLI XODIM BUTUN VILOYATGA YUBORA OLMAYDI
   * (doktrina): unga `districtId` majburiy va faqat o'z tumani.
   */
  private async resolveScope(
    dto: { districtId?: string; mahallaId?: string },
    scope: ScopeContext,
  ): Promise<{ districtId: string | null; mahallaId: string | null }> {
    let districtId = dto.districtId ?? null;
    let mahallaId = dto.mahallaId ?? null;

    if (mahallaId) {
      const mahalla = await this.prisma.mahalla.findUnique({
        where: { id: mahallaId },
        select: { id: true, districtId: true },
      });
      if (!mahalla) throw new NotFoundException("MFY topilmadi");

      if (districtId && districtId !== mahalla.districtId) {
        throw new BadRequestException("Tanlangan MFY bu tumanga tegishli emas");
      }
      districtId = mahalla.districtId;
    }

    if (!isProvinceWide(scope)) {
      if (!districtId) {
        throw new ForbiddenException(
          "Butun viloyatga yuborish uchun viloyat qamrovi kerak — tuman yoki MFY tanlang",
        );
      }
      if (!canTouchDistrict(scope, districtId)) {
        throw new ForbiddenException("Bu tuman sizning qamrovingizda emas");
      }
    } else if (districtId && !canTouchDistrict(scope, districtId)) {
      throw new ForbiddenException("Bu tuman sizning qamrovingizda emas");
    }

    return { districtId, mahallaId };
  }

  /**
   * AUDITORIYA HAJMI — YUBORISHDAN OLDIN.
   *
   * ⚠️ "1 240 kishiga yuboriladi" degan son hudud noto'g'ri
   * tanlanganini TO'XTATADI. Usiz xato faqat yuborilgandan keyin
   * bilinardi — qaytarib bo'lmaydigan paytda.
   */
  async preview(
    dto: {
      audience: BroadcastAudience;
      districtId?: string;
      mahallaId?: string;
      activeDays?: number;
      chatIds?: string[];
    },
    scope: ScopeContext,
  ) {
    const { districtId, mahallaId } = await this.resolveScope(dto, scope);

    const targets = await collectTargets(this.prisma, {
      audience: dto.audience,
      districtId,
      mahallaId,
      activeDays: dto.activeDays ?? null,
      chatIds: dto.chatIds ?? [],
    });

    return summarizeTargets(targets);
  }

  // ═══════════════════════════════════════════════════════════════
  //  YARATISH
  // ═══════════════════════════════════════════════════════════════

  async create(dto: CreateBroadcastDto, scope: ScopeContext, via: "panel" | "bot") {
    this.assertContent(dto);

    const { districtId, mahallaId } = await this.resolveScope(dto, scope);

    /**
     * ⚠️ O'TMISHDAGI SANA RAD ETILADI (e'lonlardagi ayni qoida):
     * "kechagi soat 9" ga qo'yilgan tarqatma job birinchi
     * aylanishida DARHOL chiqib ketardi — xodim esa uni kelajakka
     * qo'ydim deb o'ylab yurardi.
     */
    const scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : null;

    if (scheduledAt) {
      if (Number.isNaN(scheduledAt.getTime())) {
        throw new BadRequestException("Rejalashtirilgan vaqt noto'g'ri");
      }
      if (scheduledAt.getTime() < Date.now() - 60_000) {
        throw new BadRequestException("Rejalashtirilgan vaqt o'tib ketgan");
      }
    }

    /**
     * ⚠️ QADASH FAQAT CHAT AUDITORIYASIDA: shaxsiy chatda Telegram
     * uni rad etadi va hisobotda yolg'on "xato" paydo bo'lardi.
     */
    const pinMessage =
      dto.pinMessage === true &&
      dto.audience !== BroadcastAudience.citizens &&
      dto.audience !== BroadcastAudience.citizens_active;

    const broadcast = await this.prisma.broadcast.create({
      data: {
        title: dto.title?.trim() || null,
        audience: dto.audience,
        mode: dto.mode,
        text: dto.mode === BroadcastMode.text ? dto.message!.trim() : null,
        fromChatId: dto.fromChatId ?? null,
        sourceMessageId: dto.sourceMessageId ?? null,
        districtId,
        mahallaId,
        activeDays:
          dto.audience === BroadcastAudience.citizens_active
            ? (dto.activeDays ?? 30)
            : null,
        chatIds: dto.audience === BroadcastAudience.chats ? (dto.chatIds ?? []) : [],
        parseMode: dto.parseMode ?? BroadcastParseMode.plain,
        disablePreview: dto.disablePreview ?? true,
        silent: dto.silent ?? false,
        pinMessage,
        buttons: dto.buttons?.length ? (dto.buttons as unknown as Prisma.InputJsonValue) : undefined,
        scheduledAt,
        status: scheduledAt ? BroadcastStatus.scheduled : BroadcastStatus.pending,
        createdBy: scope.userId,
        via,
      },
      select: { id: true, status: true, scheduledAt: true, createdAt: true },
    });

    /**
     * ⚠️ YUBORISH FON'DA (doktrina): HTTP so'rovi minglab xabarni
     * kutib turolmaydi — nginx ham, brauzer ham uzib qo'yardi va
     * "yubordimmi yo'qmi" degan savol javobsiz qolardi.
     *
     * ⚠️ REJALASHTIRILGANI DARHOL BOSHLANMAYDI: uni job o'z
     * vaqtida oladi.
     */
    if (!scheduledAt) {
      void this.run(broadcast.id).catch((error: Error) => {
        this.logger.error(`Tarqatma ${broadcast.id} yiqildi: ${error.message}`);
      });
    }

    return broadcast;
  }

  // ═══════════════════════════════════════════════════════════════
  //  YUBORISH
  // ═══════════════════════════════════════════════════════════════

  /**
   * ⚠️ `public`: rejalashtirilgan tarqatmalarni job shu metod
   * orqali ishga tushiradi.
   */
  async run(id: string): Promise<void> {
    const broadcast = await this.prisma.broadcast.findUnique({ where: { id } });
    if (!broadcast) return;

    // ⚠️ IKKI MARTA ISHGA TUSHMAYDI: job va qo'lda yuborish
    // ustma-ust tushsa, xabar HAMMAGA IKKI MARTA ketardi.
    if (
      broadcast.status === BroadcastStatus.sending ||
      broadcast.status === BroadcastStatus.done ||
      broadcast.status === BroadcastStatus.cancelled
    ) {
      return;
    }

    const targets = await collectTargets(this.prisma, {
      audience: broadcast.audience,
      districtId: broadcast.districtId,
      mahallaId: broadcast.mahallaId,
      activeDays: broadcast.activeDays,
      chatIds: broadcast.chatIds,
    });

    await this.prisma.broadcast.update({
      where: { id },
      data: {
        status: BroadcastStatus.sending,
        startedAt: new Date(),
        total: targets.length,
      },
    });

    const options: SendOptions = {
      disablePreview: broadcast.disablePreview,
      silent: broadcast.silent,
      buttons: parseButtons(broadcast.buttons),
    };

    /**
     * ⚠️ `plain` DA MATN EKRANLANADI: panelda yozilgan `<` yoki
     * `&` belgisi HTML sifatida o'qilsa, Telegram BUTUN xabarni
     * rad etardi — ya'ni bitta qavs butun tarqatmani to'xtatardi.
     */
    const body =
      broadcast.text === null
        ? ""
        : broadcast.parseMode === BroadcastParseMode.html
          ? broadcast.text
          : escapeHtml(broadcast.text);

    let sent = 0;
    let failed = 0;
    let blocked = 0;
    let cancelled = false;

    const log: Prisma.BroadcastRecipientCreateManyInput[] = [];

    const flushLog = async (): Promise<void> => {
      if (log.length === 0) return;
      const chunk = log.splice(0, log.length);
      await this.prisma.broadcastRecipient
        .createMany({ data: chunk })
        .catch((error: Error) => {
          // ⚠️ JURNAL XATOSI TARQATMANI TO'XTATMAYDI: xabarlar
          // allaqachon yetib bordi va ularni "yuborilmagan" deb
          // ko'rsatish haqiqatdan uzoqlashtirardi.
          this.logger.warn(`Jurnal yozilmadi: ${error.message}`);
        });
    };

    for (let index = 0; index < targets.length; index += 1) {
      const target = targets[index]!;

      const result = await this.deliver(broadcast, target, body, options);

      if (result.ok) sent += 1;
      else if (result.blocked) blocked += 1;
      else failed += 1;

      log.push({
        broadcastId: id,
        chatId: target.chatId,
        kind: target.kind,
        status: result.ok
          ? BroadcastDelivery.sent
          : result.blocked
            ? BroadcastDelivery.blocked
            : BroadcastDelivery.failed,
        error: result.ok ? null : (result.description ?? null),
        title: target.title,
      });

      if (log.length >= LOG_CHUNK) await flushLog();

      if (result.retryAfter) {
        // ⚠️ TELEGRAM AYTGAN VAQT KUTILADI: o'zimiznikini
        // o'ylab topsak, chegara yana urilardi.
        await sleep(Math.min(result.retryAfter, 60) * 1000);
      } else if (index < targets.length - 1) {
        await sleep(target.kind === "citizen" ? SEND_GAP_MS : GROUP_GAP_MS);
      }

      if ((index + 1) % PROGRESS_EVERY === 0) {
        await this.prisma.broadcast
          .update({ where: { id }, data: { sent, failed, blocked } })
          .catch(() => undefined);

        /**
         * ⚠️ BEKOR QILISH SHU YERDA O'QILADI: operator tugmani
         * bosganda sikl allaqachon ishlab turgan bo'ladi va uni
         * to'xtatishning boshqa yo'li yo'q. Har xabardan keyin
         * o'qilsa, bazaga minglab keraksiz so'rov ketardi.
         */
        const fresh = await this.prisma.broadcast.findUnique({
          where: { id },
          select: { cancelledAt: true },
        });

        if (fresh?.cancelledAt) {
          cancelled = true;
          break;
        }
      }
    }

    await flushLog();

    await this.prisma.broadcast.update({
      where: { id },
      data: {
        status: cancelled ? BroadcastStatus.cancelled : BroadcastStatus.done,
        sent,
        failed,
        blocked,
        finishedAt: new Date(),
        ...(cancelled
          ? { error: `Operator to'xtatdi — ${sent} ta xabar allaqachon yetib bordi` }
          : {}),
      },
    });

    this.logger.log(
      `Tarqatma ${id}: ${sent} yuborildi, ${failed} xato, ${blocked} bloklangan` +
        (cancelled ? " (to'xtatildi)" : ""),
    );
  }

  /**
   * BITTA MANZILGA YUBORADI.
   *
   * ⚠️ QADASH YUBORISHDAN KEYIN VA ALOHIDA: `pinChatMessage`
   * xatosi xabarning O'ZINI "yuborilmadi" qilib ko'rsatmasligi
   * kerak — u yetib bordi, faqat qadalmadi.
   */
  private async deliver(
    broadcast: {
      mode: BroadcastMode;
      fromChatId: string | null;
      sourceMessageId: string | null;
      pinMessage: boolean;
    },
    target: BroadcastTarget,
    body: string,
    options: SendOptions,
  ) {
    const result =
      broadcast.mode === BroadcastMode.text
        ? await sendMessage(target.chatId, body, options)
        : broadcast.mode === BroadcastMode.forward
          ? await forwardMessage(
              target.chatId,
              broadcast.fromChatId!,
              broadcast.sourceMessageId!,
              options,
            )
          : await copyMessage(
              target.chatId,
              broadcast.fromChatId!,
              broadcast.sourceMessageId!,
              options,
            );

    if (
      result.ok &&
      broadcast.pinMessage &&
      result.messageId &&
      target.kind !== "citizen"
    ) {
      await pinChatMessage(target.chatId, result.messageId);
    }

    return result;
  }

  // ═══════════════════════════════════════════════════════════════
  //  NAZORAT
  // ═══════════════════════════════════════════════════════════════

  /**
   * TO'XTATADI.
   *
   * ⚠️ YUBORILGANLARNI QAYTARIB BO'LMAYDI va panel buni OCHIQ
   * aytadi: to'xtatish faqat QOLGANLARINI to'xtatadi.
   */
  async cancel(id: string, scope: ScopeContext) {
    const broadcast = await this.findOne(id, scope);

    if (
      broadcast.status !== BroadcastStatus.sending &&
      broadcast.status !== BroadcastStatus.pending &&
      broadcast.status !== BroadcastStatus.scheduled
    ) {
      throw new BadRequestException("Bu tarqatmani to'xtatib bo'lmaydi — u tugagan");
    }

    /**
     * ⚠️ REJALASHTIRILGANI DARHOL YOPILADI: u hali boshlanmagan,
     * ya'ni kutadigan sikl yo'q. Ishlab turgani esa `cancelledAt`
     * ni o'qib, o'zi to'xtaydi.
     */
    const running = broadcast.status === BroadcastStatus.sending;

    await this.prisma.broadcast.update({
      where: { id },
      data: {
        cancelledAt: new Date(),
        ...(running
          ? {}
          : {
              status: BroadcastStatus.cancelled,
              finishedAt: new Date(),
              error: "Yuborilmasdan bekor qilindi",
            }),
      },
    });

    return { id, stopping: running };
  }

  /**
   * YETIB BORMAGANLARIGA QAYTA YUBORADI.
   *
   * ⚠️ YANGI TARQATMA YARATILADI, ESKISI O'ZGARMAYDI: tarqatma —
   * append-only dalil (doktrina) va uning sonlarini keyin
   * o'zgartirish "kimga nima yuborilgani" haqidagi yozuvni
   * soxtalashtirardi.
   *
   * ⚠️ FAQAT `failed`, `blocked` EMAS: odam botni bloklagan
   * bo'lsa, qayta yuborish AYNI xatoni beradi — bu befoyda
   * minglab so'rov va Telegram chegarasini bekorga yeyish.
   */
  async retry(id: string, scope: ScopeContext) {
    const broadcast = await this.findOne(id, scope);

    const failures = await this.prisma.broadcastRecipient.findMany({
      where: { broadcastId: id, status: BroadcastDelivery.failed },
      select: { chatId: true },
    });

    if (failures.length === 0) {
      throw new BadRequestException("Qayta yuboradigan manzil yo'q");
    }

    const source = await this.prisma.broadcast.findUniqueOrThrow({
      where: { id },
      select: {
        title: true,
        mode: true,
        text: true,
        fromChatId: true,
        sourceMessageId: true,
        parseMode: true,
        disablePreview: true,
        silent: true,
        pinMessage: true,
        buttons: true,
        districtId: true,
        mahallaId: true,
      },
    });

    const created = await this.prisma.broadcast.create({
      data: {
        ...source,
        buttons: source.buttons ?? Prisma.DbNull,
        title: source.title ? `${source.title} — qayta` : "Qayta yuborish",
        audience: BroadcastAudience.chats,
        chatIds: failures.map((row) => row.chatId),
        status: BroadcastStatus.pending,
        createdBy: scope.userId,
        via: "panel",
      },
      select: { id: true, status: true, createdAt: true },
    });

    void this.run(created.id).catch((error: Error) => {
      this.logger.error(`Qayta yuborish ${created.id} yiqildi: ${error.message}`);
    });

    return { ...created, targets: failures.length };
  }

  /**
   * SINOV XABARI — FAQAT YUBORUVCHINING O'ZIGA.
   *
   * ⚠️ TARQATMADAN OLDIN: guruhga yuborilgan xabarni o'chirib
   * bo'lmaydi, shuning uchun uning qanday ko'rinishini (tugmalar,
   * formatlash, havola) OLDIN ko'rish kerak.
   *
   * ⚠️ YOZUV YARATILMAYDI: sinov — tarqatma emas va u tarixga
   * tushsa, "nechta tarqatma yuborildi" degan son buzilardi.
   */
  async testSend(dto: CreateBroadcastDto, userId: string) {
    this.assertContent(dto);

    /**
     * ⚠️ `telegramId` TOKENDAN EMAS, BAZADAN: u `RequestUser` da
     * yo'q va uni JWT ga qo'shish butun tokenni kattalashtirardi
     * — holbuki u faqat shu yerda kerak.
     */
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { telegramId: true },
    });

    const telegramId = user?.telegramId;

    if (!telegramId) {
      throw new BadRequestException(
        "Sinov uchun Telegram hisobingiz ulanmagan — Adminlar bo'limida Telegram id'ingizni qo'ying",
      );
    }

    const options: SendOptions = {
      disablePreview: dto.disablePreview ?? true,
      silent: dto.silent ?? false,
      buttons: dto.buttons ?? [],
    };

    const body =
      dto.mode === BroadcastMode.text
        ? dto.parseMode === BroadcastParseMode.html
          ? dto.message!.trim()
          : escapeHtml(dto.message!.trim())
        : "";

    const result =
      dto.mode === BroadcastMode.text
        ? await sendMessage(telegramId, body, options)
        : dto.mode === BroadcastMode.forward
          ? await forwardMessage(telegramId, dto.fromChatId!, dto.sourceMessageId!, options)
          : await copyMessage(telegramId, dto.fromChatId!, dto.sourceMessageId!, options);

    if (!result.ok) {
      throw new BadRequestException(
        result.blocked
          ? "Botni bloklagansiz yoki unga hali yozmagansiz — avval botga /start yuboring"
          : `Sinov yuborilmadi: ${result.description ?? "noma'lum xato"}`,
      );
    }

    return { ok: true };
  }

  // ═══════════════════════════════════════════════════════════════
  //  O'QISH
  // ═══════════════════════════════════════════════════════════════

  async list(
    scope: ScopeContext,
    query: ListBroadcastsQuery,
  ): Promise<Paginated<unknown>> {
    const where = {
      ...(isProvinceWide(scope) ? {} : districtScopeWhere(scope)),
      ...(query.status ? { status: query.status } : {}),
      ...(query.audience ? { audience: query.audience } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.broadcast.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: query.skip,
        take: query.limit,
        select: this.listSelect,
      }),
      this.prisma.broadcast.count({ where }),
    ]);

    return paginate(items, total, query);
  }

  /**
   * ⚠️ RO'YXAT VA TAFSILOT BITTA SHAKLDAN: ikki joyda yozilsa,
   * maydon qo'shilganda bittasi unutilib, panelda "tafsilotda bor,
   * ro'yxatda yo'q" degan farq paydo bo'lardi.
   */
  private readonly listSelect = {
    id: true,
    title: true,
    audience: true,
    mode: true,
    text: true,
    status: true,
    total: true,
    sent: true,
    failed: true,
    blocked: true,
    error: true,
    via: true,
    parseMode: true,
    disablePreview: true,
    silent: true,
    pinMessage: true,
    buttons: true,
    scheduledAt: true,
    cancelledAt: true,
    activeDays: true,
    createdAt: true,
    startedAt: true,
    finishedAt: true,
    districtId: true,
    district: { select: { id: true, name: true } },
    mahalla: { select: { id: true, name: true } },
    author: { select: { id: true, firstName: true, lastName: true } },
  } satisfies Prisma.BroadcastSelect;

  async findOne(id: string, scope: ScopeContext) {
    const broadcast = await this.prisma.broadcast.findUnique({
      where: { id },
      select: this.listSelect,
    });
    if (!broadcast) throw new NotFoundException("Tarqatma topilmadi");

    if (!isProvinceWide(scope) && !canTouchDistrict(scope, broadcast.districtId)) {
      throw new ForbiddenException("Bu tarqatma sizning qamrovingizda emas");
    }

    return broadcast;
  }

  /**
   * YETKAZISH JURNALI.
   *
   * ⚠️ STANDART HOLDA FAQAT NOSOZLIKLAR: 10 000 ta "yuborildi"
   * qatorini varaqlashning ma'nosi yo'q — operatorga aynan
   * YETIB BORMAGANLARI kerak.
   */
  async recipients(id: string, scope: ScopeContext, query: ListRecipientsQuery) {
    await this.findOne(id, scope);

    const where = {
      broadcastId: id,
      ...(query.status ? { status: query.status } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.broadcastRecipient.findMany({
        where,
        orderBy: { createdAt: "asc" },
        skip: query.skip,
        take: query.limit,
        select: {
          id: true,
          chatId: true,
          kind: true,
          status: true,
          error: true,
          title: true,
          createdAt: true,
        },
      }),
      this.prisma.broadcastRecipient.count({ where }),
    ]);

    return paginate(items, total, query);
  }

  /**
   * REJALASHTIRILGAN TARQATMALAR — JOB UCHUN.
   *
   * ⚠️ BEKOR QILINGANI OLINMAYDI: operator uni to'xtatgan va
   * vaqti kelganda u baribir chiqib ketardi.
   */
  async dueScheduled(): Promise<string[]> {
    const rows = await this.prisma.broadcast.findMany({
      where: {
        status: BroadcastStatus.scheduled,
        cancelledAt: null,
        scheduledAt: { lte: new Date() },
      },
      select: { id: true },
      orderBy: { scheduledAt: "asc" },
      take: 20,
    });

    return rows.map((row) => row.id);
  }
}
