/**
 * AUDIT JURNALI — faqat O'QISH.
 *
 * ⚠️ YOZISH ENDPOINT'I YO'Q va bo'lmaydi: jurnal `AuditService`
 * orqali KOD ichidan yoziladi. Tashqaridan yozish imkoni bo'lsa,
 * jurnalga ishonchning ma'nosi qolmasdi.
 *
 * ⚠️ O'CHIRISH ham YO'Q: audit — append-only. Xato yozuv ham
 * tarixning bir qismi.
 */

import { Controller, Get, Query } from "@nestjs/common";
import { Transform, Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

import { RequirePermissions } from "../../common/decorators";
import { PrismaService } from "../../prisma/prisma.service";
import { paginate } from "../../common/dto/pagination.dto";
import { PaginationQuery } from "../../common/dto/pagination.dto";

class ListAuditQuery extends PaginationQuery {
  @IsOptional() @IsString() @MaxLength(64) action?: string;
  @IsOptional() @IsString() userId?: string;
  @IsOptional() @IsString() @MaxLength(64) entity?: string;
}

@Controller("audit")
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions("audit.view")
  async list(@Query() query: ListAuditQuery) {
    const where = {
      // ⚠️ `startsWith`, `equals` EMAS: panelda bo'lim bo'yicha
      // filtr bor ("signal." → signal.attach, signal.dismiss) va
      // har amalni alohida tanlash ro'yxatni o'nlab qatorga
      // aylantirardi.
      ...(query.action ? { action: { startsWith: query.action } } : {}),
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.entity ? { entity: query.entity } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    // Aktyor ismlari — bitta so'rov bilan.
    const userIds = [...new Set(rows.map((row) => row.userId).filter(Boolean))] as string[];
    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, firstName: true, lastName: true, username: true },
        })
      : [];
    const byId = new Map(users.map((user) => [user.id, user]));

    const items = rows.map((row) => ({
      id: row.id,
      action: row.action,
      entity: row.entity,
      entityId: row.entityId,
      meta: row.meta,
      ip: row.ip,
      createdAt: row.createdAt,
      // ⚠️ Xodim o'chirilgan bo'lsa `null` — audit yozuvi esa
      // QOLADI. Shuning uchun `userId` ham qaytariladi.
      userId: row.userId,
      user: row.userId ? byId.get(row.userId) ?? null : null,
    }));

    return paginate(items, total, query);
  }
}
