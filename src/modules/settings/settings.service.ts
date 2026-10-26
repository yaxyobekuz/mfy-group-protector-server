/**
 * TIZIM SOZLAMALARI — SINGLETON.
 *
 * ⚠️ QATOR O'ZI YARATILADI (`get` ichida upsert). Migratsiya seed'iga
 * tayanilsa, yangi muhitda (test bazasi, yangi deploy) qator bo'lmay
 * qolib, har o'qishda `null` qaytarardi — va chaqiruvchi kod uni
 * tekshirishni unutib, `undefined.aiEnabled` bilan yiqilardi.
 *
 * ⚠️ KESH YO'Q. Sozlama har tahlil aylanishida bir marta o'qiladi
 * (30 daqiqada bitta so'rov) va panel o'zgartirgan qiymat DARHOL amal
 * qilishi kerak. Kesh qo'yilsa, "AI ni o'chirdim, lekin hali ham
 * ishlayapti" degan holat tug'ilardi.
 */

import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../common/audit.service";
import type { Settings } from "@prisma/client";
import type { UpdateSettingsDto } from "./dto/settings.dto";
import { normalizeHost } from "../security/threat-rules";

const SINGLETON_ID = "singleton";

/**
 * Domen ro'yxatini normallashtiradi va takrorlarni olib tashlaydi.
 *
 * ⚠️ `normalizeHost` XAVFSIZLIK MODULIDAN olinadi — botdagi
 * taqqoslash AYNI shu funksiya bilan ishlaydi. Bu yerda ikkinchi
 * nusxa yozilsa, ikkisi ajralib ketib, panelda qo'shilgan domen
 * botda mos kelmay qolardi.
 */
const normalizeHosts = (hosts: string[]): string[] => [
  ...new Set(hosts.map(normalizeHost).filter(Boolean)),
];

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Sozlamalar — qator bo'lmasa standart qiymatlar bilan yaratiladi. */
  async get(): Promise<Settings> {
    return this.prisma.settings.upsert({
      where: { id: SINGLETON_ID },
      update: {},
      // ⚠️ BO'SH `create`: barcha qiymatlar schema'dagi `@default`
      // dan keladi. Ularni bu yerda takrorlash ikki joyda haqiqat
      // yaratardi.
      create: { id: SINGLETON_ID },
    });
  }

  async update(dto: UpdateSettingsDto, userId: string): Promise<Settings> {
    const before = await this.get();

    const updated = await this.prisma.settings.update({
      where: { id: SINGLETON_ID },
      data: {
        ...(dto.orgName !== undefined ? { orgName: dto.orgName.trim() } : {}),
        ...(dto.aiEnabled !== undefined ? { aiEnabled: dto.aiEnabled } : {}),
        ...(dto.aiIntervalMinutes !== undefined
          ? { aiIntervalMinutes: dto.aiIntervalMinutes }
          : {}),
        ...(dto.aiMaxMessagesPerRun !== undefined
          ? { aiMaxMessagesPerRun: dto.aiMaxMessagesPerRun }
          : {}),
        ...(dto.messageRetentionHours !== undefined
          ? { messageRetentionHours: dto.messageRetentionHours }
          : {}),
        ...(dto.alertChatIds !== undefined ? { alertChatIds: dto.alertChatIds } : {}),
        ...(dto.alertMinSeverity !== undefined
          ? { alertMinSeverity: dto.alertMinSeverity }
          : {}),

        // ── XAVFSIZLIK QALQONI ──────────────────────────────────
        ...(dto.guardDeleteFiles !== undefined
          ? { guardDeleteFiles: dto.guardDeleteFiles }
          : {}),
        ...(dto.guardDeleteUrls !== undefined
          ? { guardDeleteUrls: dto.guardDeleteUrls }
          : {}),
        /**
         * ⚠️ DOMEN NORMALLASHTIRILADI (kichik harf, `www.` olib
         * tashlanadi): panelda `WWW.Evil.COM` yozilsa, u
         * botdagi taqqoslashda (`normalizeHost`) mos kelmay,
         * bloklash JIMGINA ishlamay qolardi.
         */
        ...(dto.guardBlockedHosts !== undefined
          ? { guardBlockedHosts: normalizeHosts(dto.guardBlockedHosts) }
          : {}),
        ...(dto.guardAllowedHosts !== undefined
          ? { guardAllowedHosts: normalizeHosts(dto.guardAllowedHosts) }
          : {}),

        // ── MINI APP ────────────────────────────────────────────
        ...(dto.mobileDailyLimit !== undefined
          ? { mobileDailyLimit: dto.mobileDailyLimit }
          : {}),
        ...(dto.mobileMaxAttachments !== undefined
          ? { mobileMaxAttachments: dto.mobileMaxAttachments }
          : {}),
        updatedBy: userId,
      },
    });

    await this.audit.record({
      userId,
      action: "settings.update",
      entity: "Settings",
      entityId: SINGLETON_ID,
      // ⚠️ ESKI VA YANGI QIYMAT IKKALASI yoziladi: "AI nima uchun
      // o'chib qolgan" degan savolga javob faqat shundan topiladi.
      meta: {
        before: {
          aiEnabled: before.aiEnabled,
          aiIntervalMinutes: before.aiIntervalMinutes,
          alertChatIds: before.alertChatIds,
        },
        after: dto as Record<string, unknown>,
      },
    });

    return updated;
  }
}
