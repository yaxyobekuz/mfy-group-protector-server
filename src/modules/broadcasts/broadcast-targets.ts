/**
 * TARQATMA MANZILLARI — KIMGA KETADI.
 *
 * ⚠️ XIZMATDAN AJRATILDI: auditoriya hisobi "nechta odamga
 * ketadi" degan ko'rsatkichda ham, YUBORISH siklida ham AYNI
 * bo'lishi shart. Nusxa yozilsa, panelda "1 240 kishiga
 * yuboriladi" deb ko'rsatilib, aslida 900 kishiga ketardi — va
 * bu farqni hech narsa tushuntirmasdi.
 *
 * ⚠️ HAR MANZIL O'Z TURI BILAN KELADI (`kind`): jurnalda va
 * sanoqda guruh, kanal va fuqaro ajratiladi — ularga yetmaslik
 * sabablari ham, choralari ham boshqa-boshqa.
 */

import { BroadcastAudience, BroadcastTargetKind, type PrismaClient } from "@prisma/client";

import { activeCitizenWhere } from "../../common/citizen-deleted";
import { isChannel } from "../../common/chat-type";

export interface BroadcastTarget {
  chatId: string;
  kind: BroadcastTargetKind;
  /** Panelda ko'rinadigan nom — jurnalga NUSXA bo'lib yoziladi. */
  title: string | null;
}

export interface TargetFilters {
  audience: BroadcastAudience;
  districtId: string | null;
  mahallaId: string | null;
  /** `citizens_active` uchun — necha kun ichida faol bo'lganlar. */
  activeDays: number | null;
  /** `chats` uchun — aniq ko'rsatilgan manzillar. */
  chatIds: string[];
}

/** Auditoriyada fuqarolar bormi. */
const wantsCitizens = (audience: BroadcastAudience): boolean =>
  audience === BroadcastAudience.citizens ||
  audience === BroadcastAudience.citizens_active ||
  audience === BroadcastAudience.both ||
  audience === BroadcastAudience.all;

/** Auditoriyada MFY guruhlari bormi. */
const wantsGroups = (audience: BroadcastAudience): boolean =>
  audience === BroadcastAudience.groups ||
  audience === BroadcastAudience.both ||
  audience === BroadcastAudience.all;

/** Auditoriyada rasmiy kanallar bormi. */
const wantsChannels = (audience: BroadcastAudience): boolean =>
  audience === BroadcastAudience.channels || audience === BroadcastAudience.all;

/**
 * FUQARO MANZILLARI — BOTGA YOZGANLAR.
 *
 * ⚠️ `telegramId` MAJBURIY TEKSHIRILADI: Google bilan kirgan
 * fuqaroda u YO'Q va unga Telegram orqali xabar yuborib
 * bo'lmaydi (doktrina: "`telegramId` endi ixtiyoriy").
 *
 * ⚠️ BLOKLANGAN FUQARO OLINMAYDI: u ma'muriy chora bilan
 * yopilgan va unga e'lon yuborish o'sha chorani bekor qilardi.
 */
const citizenTargets = async (
  prisma: PrismaClient,
  filters: TargetFilters,
): Promise<BroadcastTarget[]> => {
  /**
   * ⚠️ FAOLLIK FILTRI — `lastSeenAt` BO'YICHA: botni bir marta
   * ochib tashlab ketgan odam ro'yxatda abadiy qoladi va unga
   * yuborilgan xabar deyarli har doim `403` beradi. Katta
   * auditoriyada bu yuzlab befoyda so'rov demakdir.
   */
  const since =
    filters.audience === BroadcastAudience.citizens_active && filters.activeDays
      ? new Date(Date.now() - filters.activeDays * 24 * 60 * 60 * 1000)
      : null;

  const rows = await prisma.citizen.findMany({
    where: {
      isBlocked: false,
      ...activeCitizenWhere,
      telegramId: { not: null },
      ...(filters.districtId ? { districtId: filters.districtId } : {}),
      ...(filters.mahallaId ? { mahallaId: filters.mahallaId } : {}),
      ...(since ? { lastSeenAt: { gte: since } } : {}),
    },
    select: { telegramId: true, firstName: true, lastName: true },
  });

  return rows
    .filter((row): row is typeof row & { telegramId: string } => Boolean(row.telegramId))
    .map((row) => ({
      chatId: row.telegramId,
      kind: BroadcastTargetKind.citizen,
      title: [row.firstName, row.lastName].filter(Boolean).join(" ") || null,
    }));
};

/**
 * GURUH VA KANAL MANZILLARI.
 *
 * ⚠️ MFY BIRIKTIRILMAGAN CHATGA YUBORILMAYDI (doktrina): u qaysi
 * tumanga tegishli ekani noma'lum va reyestrda test, tasodifiy
 * chatlar ham bor.
 *
 * ⚠️ BOT CHIQARIB YUBORILGAN CHAT OLINMAYDI (`leftAt`): unga
 * yuborish kafolatli xato beradi va hisobotni befoyda
 * "nosozlik" bilan to'ldirardi.
 */
const chatTargets = async (
  prisma: PrismaClient,
  filters: TargetFilters,
  kinds: { groups: boolean; channels: boolean },
): Promise<BroadcastTarget[]> => {
  const rows = await prisma.telegramGroup.findMany({
    where: {
      leftAt: null,
      ...(filters.mahallaId
        ? { mahallaId: filters.mahallaId }
        : filters.districtId
          ? { mahalla: { districtId: filters.districtId } }
          : { mahallaId: { not: null } }),
    },
    select: { chatId: true, title: true, type: true },
  });

  return rows
    .filter((row) => (isChannel(row.type) ? kinds.channels : kinds.groups))
    .map((row) => ({
      chatId: row.chatId,
      kind: isChannel(row.type)
        ? BroadcastTargetKind.channel
        : BroadcastTargetKind.group,
      title: row.title,
    }));
};

/**
 * ANIQ KO'RSATILGAN MANZILLAR (`audience = chats`).
 *
 * ⚠️ REYESTRDAN TASDIQLANADI, ISHONILMAYDI: mijoz bergan
 * `chatId` ro'yxatiga ishonib yuborilsa, u istalgan chatga
 * xabar tarqatish yo'li bo'lardi. Reyestrda topilmagani esa
 * FUQARO manzili bo'lishi mumkin (qayta yuborishda) — shuning
 * uchun u ham tekshiriladi.
 */
const explicitTargets = async (
  prisma: PrismaClient,
  chatIds: string[],
): Promise<BroadcastTarget[]> => {
  if (chatIds.length === 0) return [];

  const [chats, citizens] = await Promise.all([
    prisma.telegramGroup.findMany({
      where: { chatId: { in: chatIds }, leftAt: null },
      select: { chatId: true, title: true, type: true },
    }),
    prisma.citizen.findMany({
      where: {
        telegramId: { in: chatIds },
        isBlocked: false,
        ...activeCitizenWhere,
      },
      select: { telegramId: true, firstName: true, lastName: true },
    }),
  ]);

  const found = new Map<string, BroadcastTarget>();

  for (const row of chats) {
    found.set(row.chatId, {
      chatId: row.chatId,
      kind: isChannel(row.type)
        ? BroadcastTargetKind.channel
        : BroadcastTargetKind.group,
      title: row.title,
    });
  }

  for (const row of citizens) {
    if (!row.telegramId || found.has(row.telegramId)) continue;
    found.set(row.telegramId, {
      chatId: row.telegramId,
      kind: BroadcastTargetKind.citizen,
      title: [row.firstName, row.lastName].filter(Boolean).join(" ") || null,
    });
  }

  // ⚠️ TARTIB SAQLANADI: qayta yuborishda operator ro'yxatni
  // o'sha tartibda ko'rgan bo'ladi.
  return chatIds
    .map((chatId) => found.get(chatId))
    .filter((target): target is BroadcastTarget => Boolean(target));
};

/**
 * AUDITORIYANI YIG'ADI.
 *
 * ⚠️ TAKRORLAR OLIB TASHLANADI: bitta odam ham fuqaro, ham
 * guruh a'zosi bo'lishi mumkin emas (chat id'lari boshqa), lekin
 * `all` da bir chat ikki marta tushishi mumkin — va o'shanda u
 * AYNI xabarni ikki marta olardi.
 */
export const collectTargets = async (
  prisma: PrismaClient,
  filters: TargetFilters,
): Promise<BroadcastTarget[]> => {
  if (filters.audience === BroadcastAudience.chats) {
    return explicitTargets(prisma, filters.chatIds);
  }

  const [citizens, chats] = await Promise.all([
    wantsCitizens(filters.audience)
      ? citizenTargets(prisma, filters)
      : Promise.resolve([]),
    wantsGroups(filters.audience) || wantsChannels(filters.audience)
      ? chatTargets(prisma, filters, {
          groups: wantsGroups(filters.audience),
          channels: wantsChannels(filters.audience),
        })
      : Promise.resolve([]),
  ]);

  const seen = new Set<string>();
  const targets: BroadcastTarget[] = [];

  /**
   * ⚠️ CHATLAR AVVAL: guruh va kanalga yuborish SEKINROQ (pauza
   * kattaroq) va ularni oxiriga qoldirish "e'lon chiqdi, lekin
   * guruhlarda hali yo'q" degan uzun oraliqni hosil qilardi —
   * holbuki aynan guruh eng ko'p odamga yetadi.
   */
  for (const target of [...chats, ...citizens]) {
    if (seen.has(target.chatId)) continue;
    seen.add(target.chatId);
    targets.push(target);
  }

  return targets;
};

/** Auditoriya hajmi — tur bo'yicha. */
export const summarizeTargets = (targets: BroadcastTarget[]) => ({
  citizens: targets.filter((t) => t.kind === BroadcastTargetKind.citizen).length,
  groups: targets.filter((t) => t.kind === BroadcastTargetKind.group).length,
  channels: targets.filter((t) => t.kind === BroadcastTargetKind.channel).length,
  total: targets.length,
});
