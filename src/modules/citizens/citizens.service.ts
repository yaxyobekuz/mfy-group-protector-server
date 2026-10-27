/**
 * FUQAROLAR — panel tomoni.
 *
 * ⚠️ FUQARO — XODIM EMAS: bu yerda parol, ruxsat, qamrov yo'q. Panel
 * faqat ro'yxatni ko'radi va kerak bo'lsa BLOKLAYDI (sabab bilan).
 *
 * ⚠️ BLOK — QATTIQ CHORA (`citizens.manage`). U fuqaroni butunlay
 * yopadi va shuning uchun operatorга berilmaydi (`security.guard` bilan
 * ayni sabab).
 */

import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { IssueStatus, type Prisma } from "@prisma/client";

import { env } from "../../config/env.config";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../common/audit.service";
import { paginate } from "../../common/dto/pagination.dto";
import type { BlockCitizenDto, BroadcastDto, ListCitizensQuery } from "./dto/citizens.dto";

const TELEGRAM_API = "https://api.telegram.org";

@Injectable()
export class CitizensService {
  private readonly logger = new Logger(CitizensService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListCitizensQuery) {
    const where: Prisma.CitizenWhereInput = {
      ...(query.districtId ? { districtId: query.districtId } : {}),
      ...(query.blocked !== undefined ? { isBlocked: query.blocked } : {}),
      ...(query.search
        ? {
            OR: [
              { firstName: { contains: query.search, mode: "insensitive" } },
              { lastName: { contains: query.search, mode: "insensitive" } },
              { username: { contains: query.search, mode: "insensitive" } },
              { phone: { contains: query.search } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.citizen.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: query.skip,
        take: query.limit,
        include: {
          district: { select: { name: true } },
          _count: { select: { issues: true } },
        },
      }),
      this.prisma.citizen.count({ where }),
    ]);

    return paginate(
      items.map((c) => ({
        id: c.id,
        telegramId: c.telegramId,
        name: [c.firstName, c.lastName].filter(Boolean).join(" "),
        username: c.username,
        phone: c.phone,
        photoUrl: c.photoUrl,
        districtName: c.district?.name ?? null,
        points: c.points,
        appeals: c._count.issues,
        isBlocked: c.isBlocked,
        blockReason: c.blockReason,
        createdAt: c.createdAt,
      })),
      total,
      query,
    );
  }

  async findOne(id: string) {
    const citizen = await this.prisma.citizen.findUnique({
      where: { id },
      include: {
        district: { select: { name: true } },
        mahalla: { select: { name: true } },
      },
    });
    if (!citizen) throw new NotFoundException("Fuqaro topilmadi");

    const [total, open, resolved] = await Promise.all([
      this.prisma.issue.count({ where: { citizenId: id } }),
      this.prisma.issue.count({
        where: { citizenId: id, status: { in: [IssueStatus.new, IssueStatus.in_progress] } },
      }),
      this.prisma.issue.count({ where: { citizenId: id, status: IssueStatus.resolved } }),
    ]);

    return {
      id: citizen.id,
      telegramId: citizen.telegramId,
      name: [citizen.firstName, citizen.lastName].filter(Boolean).join(" "),
      username: citizen.username,
      phone: citizen.phone,
      photoUrl: citizen.photoUrl,
      languageCode: citizen.languageCode,
      districtName: citizen.district?.name ?? null,
      mahallaName: citizen.mahalla?.name ?? null,
      points: citizen.points,
      isBlocked: citizen.isBlocked,
      blockReason: citizen.blockReason,
      createdAt: citizen.createdAt,
      stats: { total, open, resolved },
    };
  }

  async setBlocked(id: string, dto: BlockCitizenDto, userId: string) {
    const citizen = await this.prisma.citizen.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!citizen) throw new NotFoundException("Fuqaro topilmadi");

    // ⚠️ BLOKLASHDA SABAB MAJBURIY (DTO ixtiyoriy — bu yerda
    // majburlanadi): fuqaroga ilovada shu sabab ko'rinadi.
    if (dto.blocked && !dto.reason?.trim()) {
      throw new BadRequestException("Bloklash uchun sabab ko'rsating");
    }

    await this.prisma.citizen.update({
      where: { id },
      data: {
        isBlocked: dto.blocked,
        blockReason: dto.blocked ? dto.reason!.trim() : null,
      },
    });

    await this.audit.record({
      userId,
      action: dto.blocked ? "citizen.block" : "citizen.unblock",
      entity: "Citizen",
      entityId: id,
      meta: dto.blocked ? { reason: dto.reason } : undefined,
    });

    return { ok: true };
  }

  /**
   * FUQAROLARGA XABAR YUBORISH — ularning SHAXSIY chatiga.
   *
   * ⚠️ YANGILIK E'LONIDAN FARQI: e'lon ilovada ko'rinadi (fuqaro o'zi
   * ochadi); bu esa Telegram'da PUSH sifatida darhol yetib boradi.
   * Shuning uchun u kuchliroq amal — `citizens.manage` va audit.
   *
   * ⚠️ BLOKLANGANLARGA YUBORILMAYDI. Ketma-ket yuboriladi (Telegram
   * 429 bermasligi uchun) — `issue-notify.service.ts` bilan ayni sabab.
   *
   * ⚠️ XATO BITTA FUQARODA TO'XTATMAYDI: kimdir botni bloklagan
   * bo'lsa (Telegram 403), qolganlarga yuborilaveradi.
   */
  async broadcast(dto: BroadcastDto, userId: string) {
    if (!env.botToken) {
      throw new BadRequestException(
        "BOT_TOKEN sozlanmagan — xabar yuborib bo'lmaydi",
      );
    }

    const recipients = await this.prisma.citizen.findMany({
      where: {
        isBlocked: false,
        // ⚠️ TELEGRAM HISOBI BORLAR: mobil ilovadan (Google bilan)
        // kirgan fuqaroda `telegramId` YO'Q va unga Telegram orqali
        // xabar yuborib bo'lmaydi. Filtrsiz ular "failed" bo'lib
        // sanalardi va panelda "yuborilmadi: 400" degan qo'rqinchli
        // son chiqardi — aslida esa hech narsa buzilmagan.
        telegramId: { not: null },
        ...(dto.districtId ? { districtId: dto.districtId } : {}),
      },
      select: { telegramId: true },
    });

    const text = this.escapeHtml(dto.message.trim());
    let sent = 0;
    let failed = 0;

    for (const citizen of recipients) {
      if (!citizen.telegramId) continue;
      const ok = await this.sendTelegram(citizen.telegramId, text);
      if (ok) sent += 1;
      else failed += 1;
    }

    await this.audit.record({
      userId,
      action: "citizen.broadcast",
      entity: "Citizen",
      meta: { districtId: dto.districtId ?? null, recipients: recipients.length, sent, failed },
    });

    return { recipients: recipients.length, sent, failed };
  }

  // ───────────────────────────────────────────────────────────────

  private async sendTelegram(chatId: string, html: string): Promise<boolean> {
    try {
      const response = await fetch(`${TELEGRAM_API}/bot${env.botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: html,
          parse_mode: "HTML",
          link_preview_options: { is_disabled: true },
        }),
      });
      return response.ok;
    } catch (error) {
      this.logger.warn(`Xabar yuborilmadi (${chatId}): ${(error as Error).message}`);
      return false;
    }
  }

  /** `parse_mode: HTML` uchun — `issue-notify.service.ts` bilan ayni. */
  private escapeHtml(value: string): string {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
}
