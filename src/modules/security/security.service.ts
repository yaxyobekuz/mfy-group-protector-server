/**
 * XAVFSIZLIK — guruhda aniqlangan zararli kontent jurnali.
 *
 * Bu modul IKKI TOMONGA qaraydi:
 *
 *   BOT  →  `report` (tahdid aniqlandi / o'chirildi)
 *   PANEL → `list` / `stats` / `config` / `setGuard`
 *
 * ── NIMA UCHUN SIGNALDAN ALOHIDA ──────────────────────────────────────
 *
 * ⚠️ `SecurityEvent` — `GroupSignal` EMAS va ular aralashtirilmaydi.
 * Signal — AI TAXMINI, u odam qaroriga muhtoj va xato bo'lishi mumkin.
 * Bu yerda esa qoida QAT'IY (`.apk` = zararli) va bot DARHOL harakat
 * qiladi. Ikkisini bitta jadvalga qo'shish "signallar — tekshirilmagan
 * taxmin" degan doktrinani buzardi.
 *
 * ── QALQON `isOfficial` GA BOG'LIQ EMAS ──────────────────────────────
 *
 * ⚠️ `isOfficial` — yozishmani O'QISHGA rozilik; `guardEnabled` esa
 * aholini himoya qiladi. Guruh "kuzatuvga yopiq" bo'lsa ham undagi
 * odamlarni virusdan himoya qilish mumkin va bu ikki qaror BIR-BIRIGA
 * BOG'LIQ EMAS.
 */

import { Injectable, Logger, NotFoundException } from "@nestjs/common";

import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../common/audit.service";
import {
  canTouchDistrict,
  signalScopeWhere,
  type ScopeContext,
} from "../../common/scope.util";
import { paginate, type Paginated } from "../../common/dto/pagination.dto";
import type {
  ListSecurityQuery,
  ReportThreatDto,
  SetGuardDto,
} from "./dto/security.dto";

/** Xabar matnining saqlanadigan uzunligi. */
const MAX_EVIDENCE_TEXT = 2000;

@Injectable()
export class SecurityService {
  private readonly logger = new Logger(SecurityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ═══════════════════════════════════════════════════════════════
  //  BOT TOMONI
  // ═══════════════════════════════════════════════════════════════

  /**
   * QALQON SOZLAMASI — bot har guruh uchun shuni so'raydi.
   *
   * ⚠️ QORA RO'YXAT SERVERDA TURADI va botga UZATILADI: botda nusxa
   * saqlansa, panelda domen qo'shilgach u yangilanmay qolardi
   * (botda Prisma yo'q, ya'ni u bazani o'qiy olmaydi).
   */
  async guardConfig(chatId: string) {
    const [group, settings] = await Promise.all([
      this.prisma.telegramGroup.findUnique({
        where: { chatId },
        select: { guardEnabled: true },
      }),
      this.prisma.settings.findUnique({ where: { id: "singleton" } }),
    ]);

    return {
      // ⚠️ GURUH REYESTRDA YO'Q BO'LSA — QALQON O'CHIQ. Noma'lum
      // guruhda xabar o'chirish mumkin emas: bot u yerga tasodifan
      // qo'shilgan bo'lishi mumkin.
      guardEnabled: Boolean(group?.guardEnabled),
      deleteFiles: settings?.guardDeleteFiles ?? true,
      deleteUrls: settings?.guardDeleteUrls ?? true,
      blockedHosts: settings?.guardBlockedHosts ?? [],
      allowedHosts: settings?.guardAllowedHosts ?? [],
    };
  }

  /**
   * TAHDID QAYD ETILDI.
   *
   * ⚠️ `upsert`, `create` EMAS: bir xabar ikki marta kelishi mumkin
   * (bot qayta ishga tushdi, Telegram takrorladi) va dublikat yozuv
   * hisobotni shishirardi. Unique kalit — `(chatId, messageId)`.
   */
  async report(dto: ReportThreatDto) {
    const group = await this.prisma.telegramGroup.findUnique({
      where: { chatId: dto.chatId },
      select: { chatId: true },
    });

    // ⚠️ NOMA'LUM GURUH JIM TASHLANADI: reyestrda yo'q guruh uchun
    // yozuv yaratish begona chatni hisobotga olib kirardi.
    if (!group) return { skipped: true };

    const data = {
      chatId: dto.chatId,
      messageId: dto.messageId ?? null,
      kind: dto.kind as never,
      action: dto.action as never,
      senderTgId: dto.senderTgId ?? null,
      senderName: dto.senderName ?? null,
      senderUsername: dto.senderUsername ?? null,
      fileName: dto.fileName ?? null,
      fileMime: dto.fileMime ?? null,
      fileSize: dto.fileSize ?? null,
      fileUniqueId: dto.fileUniqueId ?? null,
      url: dto.url ?? null,
      urlHost: dto.urlHost ?? null,
      reason: dto.reason,
      messageText: dto.messageText?.slice(0, MAX_EVIDENCE_TEXT) ?? null,
      errorMessage: dto.errorMessage ?? null,
      sentAt: dto.sentAt ? new Date(dto.sentAt * 1000) : null,
    };

    // ⚠️ `messageId` BO'LMASA `upsert` KALITI YO'Q — shunda oddiy
    // `create`. Bu kamdan-kam holat (Telegram deyarli har doim
    // raqam beradi), lekin `upsert` undefined kalit bilan
    // yiqilardi.
    const event = dto.messageId
      ? await this.prisma.securityEvent.upsert({
          where: {
            chatId_messageId: { chatId: dto.chatId, messageId: dto.messageId },
          },
          create: data,
          update: {
            // ⚠️ FAQAT NATIJA YANGILANADI: qolgan maydonlar
            // DALIL va ular o'zgarmasligi kerak.
            action: data.action,
            errorMessage: data.errorMessage,
          },
        })
      : await this.prisma.securityEvent.create({ data });

    this.logger.warn(
      `${dto.chatId} — ${dto.kind} (${dto.reason}) → ${dto.action}`,
    );

    return { id: event.id, recorded: true };
  }

  // ═══════════════════════════════════════════════════════════════
  //  PANEL TOMONI
  // ═══════════════════════════════════════════════════════════════

  /**
   * ⚠️ QAMROV GURUH ORQALI (`signalScopeWhere`): `SecurityEvent` da
   * hudud ustuni YO'Q va bu ataylab — signal bilan bir xil sabab
   * (hodisa yangi, hududi guruhning JORIY holatidan kelib chiqadi).
   *
   * ⚠️ `includeUnassigned`: MFY biriktirilmagan guruhdagi tahdid ham
   * KO'RINISHI kerak — aks holda eng e'tiborsiz qolgan guruhlardagi
   * xavf jimgina yashirinib yurardi.
   */
  async list(
    query: ListSecurityQuery,
    scope: ScopeContext,
  ): Promise<Paginated<unknown>> {
    const where: Record<string, unknown> = {
      ...signalScopeWhere(scope, { includeUnassigned: true }),
    };

    if (query.chatId) where.chatId = query.chatId;
    if (query.kind) where.kind = query.kind;
    if (query.action) where.action = query.action;
    if (query.senderTgId) where.senderTgId = query.senderTgId;

    if (query.districtId || query.mahallaId) {
      where.group = {
        ...(query.mahallaId
          ? { mahallaId: query.mahallaId }
          : { mahalla: { districtId: query.districtId } }),
      };
    }

    if (query.from || query.to) {
      const createdAt: Record<string, Date> = {};
      if (query.from) createdAt.gte = new Date(query.from);
      // ⚠️ `to` KUN OXIRIGACHA: `2026-10-15` yozilganda o'sha kunning
      // o'zi ham kirishi kerak, aks holda oxirgi kun tushib qolardi.
      if (query.to) {
        const end = new Date(query.to);
        end.setUTCHours(23, 59, 59, 999);
        createdAt.lte = end;
      }
      where.createdAt = createdAt;
    }

    const [items, total] = await Promise.all([
      this.prisma.securityEvent.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: query.skip,
        take: query.limit,
        include: {
          group: {
            select: {
              chatId: true,
              title: true,
              username: true,
              guardEnabled: true,
              mahalla: {
                select: {
                  id: true,
                  name: true,
                  district: { select: { id: true, name: true } },
                },
              },
            },
          },
        },
      }),
      this.prisma.securityEvent.count({ where }),
    ]);

    return paginate(items, total, query);
  }

  /** Panel sarlavhasidagi raqamlar. */
  async stats(scope: ScopeContext) {
    const where = signalScopeWhere(scope, { includeUnassigned: true });

    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [total, deleted, failed, last24h, byKind, guardedGroups, totalGroups] =
      await Promise.all([
        this.prisma.securityEvent.count({ where }),
        this.prisma.securityEvent.count({ where: { ...where, action: "deleted" } }),
        // ⚠️ "O'CHIRILMADI" ALOHIDA SANALADI: bot admin bo'lmasa
        // o'chira olmaydi va bu holat KO'RINISHI kerak — aks holda
        // ma'muriyat "himoya ishlayapti" deb o'ylab yuraverardi.
        this.prisma.securityEvent.count({
          where: { ...where, action: { in: ["detected", "delete_failed"] } },
        }),
        this.prisma.securityEvent.count({
          where: { ...where, createdAt: { gte: since24h } },
        }),
        this.prisma.securityEvent.groupBy({
          by: ["kind"],
          where,
          _count: { _all: true },
        }),
        this.prisma.telegramGroup.count({
          where: { guardEnabled: true, status: { not: "left" } },
        }),
        this.prisma.telegramGroup.count({ where: { status: { not: "left" } } }),
      ]);

    return {
      total,
      deleted,
      failed,
      last24h,
      byKind: Object.fromEntries(
        byKind.map((row) => [row.kind, row._count._all]),
      ),
      guardedGroups,
      totalGroups,
    };
  }

  /**
   * QALQONNI YOQISH/O'CHIRISH — guruh bo'yicha.
   *
   * ⚠️ `canTouchDistrict` MAJBURIY: bu amal id bilan keladi va
   * ro'yxat filtridan O'TMAYDI. Usiz tuman operatori boshqa
   * tumandagi guruhning qalqonini o'chirib qo'ya olardi.
   */
  async setGuard(
    chatId: string,
    dto: SetGuardDto,
    scope: ScopeContext,
    actorId: string,
    ip?: string,
  ) {
    const group = await this.prisma.telegramGroup.findUnique({
      where: { chatId },
      select: {
        chatId: true,
        title: true,
        guardEnabled: true,
        mahalla: { select: { districtId: true } },
      },
    });

    if (!group) throw new NotFoundException("Guruh topilmadi");

    if (!canTouchDistrict(scope, group.mahalla?.districtId ?? null)) {
      throw new NotFoundException("Guruh topilmadi");
    }

    const updated = await this.prisma.telegramGroup.update({
      where: { chatId },
      data: {
        guardEnabled: dto.guardEnabled,
        guardAt: dto.guardEnabled ? new Date() : null,
        guardBy: dto.guardEnabled ? actorId : null,
      },
      select: { chatId: true, title: true, guardEnabled: true, guardAt: true },
    });

    await this.audit.record({
      userId: actorId,
      action: dto.guardEnabled ? "group.guard_on" : "group.guard_off",
      entity: "telegram_group",
      entityId: chatId,
      meta: { title: group.title },
      ip,
    });

    return updated;
  }
}
