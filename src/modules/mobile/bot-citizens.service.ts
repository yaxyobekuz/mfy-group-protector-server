/**
 * BOTDAN KELGAN FUQARO — topish/yaratish va Telegram faylini olish.
 *
 * ⚠️ BU YERDA MUROJAAT MANTIG'I YO'Q: yaratish, chegara, ball va
 * fayl tekshiruvi `MobileService`/`UploadsService` da qoladi. Bu
 * xizmatning yagona ishi — "bot aytgan `telegramId` ortida qaysi
 * fuqaro turibdi" degan savolga javob berish.
 */

import { ForbiddenException, Injectable, Logger } from "@nestjs/common";
import { ServiceUnavailableException } from "@nestjs/common";

import { env } from "../../config/env.config";
import { PrismaService } from "../../prisma/prisma.service";
import { MAX_FILE_SIZE } from "../uploads/uploads.constants";
import { UploadsService } from "../uploads/uploads.service";

/** Telegram profili — bot har so'rovda yuboradi. */
export interface BotCitizenIdentity {
  telegramId: string;
  firstName?: string;
  lastName?: string;
  username?: string;
  languageCode?: string;
}

@Injectable()
export class BotCitizensService {
  private readonly logger = new Logger(BotCitizensService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: UploadsService,
  ) {}

  /**
   * FUQARONI TOPADI YOKI YARATADI.
   *
   * ⚠️ `telegramId` BO'YICHA, mini-ilovadagi bilan AYNI USTUN. Shu
   * tufayli mini-ilovadan kirgan odam botga yozganda O'SHA fuqaro
   * bo'ladi: murojaatlari bitta tarixda qoladi va javob bitta
   * manzilga boradi. Alohida ustun ochilsa, bir odam ikki fuqaro
   * bo'lib ketardi.
   *
   * ⚠️ GOOGLE BILAN KIRGANI BILAN BIRLASHTIRILMAYDI: u yerda
   * `googleId` kalit va ikkisini bog'laydigan ishonchli belgi yo'q
   * (CLAUDE.md — "bitta odam ikki yo'l bilan kirsa, ikki fuqaro").
   *
   * ⚠️ ISM/USERNAME HAR SO'ROVDA YANGILANADI, HUDUD/TELEFON esa
   * TEGILMAYDI: ularni fuqaroning o'zi kiritadi va Telegram ustiga
   * yozib yuborishi noto'g'ri bo'lardi (`mobile-auth.service.ts`
   * dagi `upsertAndIssue` bilan ayni qoida).
   */
  async resolve(identity: BotCitizenIdentity): Promise<{ id: string }> {
    const telegramId = identity.telegramId.trim();

    const firstName = identity.firstName?.trim() || "Fuqaro";
    const lastName = identity.lastName?.trim() || null;
    const username = identity.username?.trim() || null;

    const citizen = await this.prisma.citizen.upsert({
      where: { telegramId },
      update: { firstName, lastName, username },
      create: {
        telegramId,
        firstName,
        lastName,
        username,
        languageCode: identity.languageCode?.trim().slice(0, 8) || "uz",
      },
      select: { id: true, isBlocked: true, blockReason: true },
    });

    // ⚠️ BLOK KIRISH BOSQICHIDA TO'XTATADI va SABAB qaytariladi: u
    // botda fuqaroga ko'rsatiladi. Sababsiz blok "bot ishlamayapti"
    // degan taassurot qoldirardi (CLAUDE.md — "cheklash sababi
    // majburiy").
    if (citizen.isBlocked) {
      throw new ForbiddenException(
        citizen.blockReason?.trim() || "Hisobingiz vaqtincha cheklangan",
      );
    }

    return { id: citizen.id };
  }

  /**
   * TELEGRAM FAYLINI YUKLAB OLADI va `UploadsService` ga beradi.
   *
   * Ikki qadam (Bot API):
   *   1. `getFile`  → `file_path`
   *   2. `https://api.telegram.org/file/bot<token>/<file_path>`
   *
   * ⚠️ TUR BAYTDAN ANIQLANADI: `UploadsService.save` faylni o'zi
   * tekshiradi va ro'yxatda bo'lmagan turni rad etadi. Telegram
   * "bu surat" degani DALIL emas — fuqaro `.apk` ni hujjat sifatida
   * yuborib, uni murojaatga ilova qilishga urinishi mumkin.
   *
   * ⚠️ HAJM IKKI JOYDA TEKSHIRILADI: Telegram aytgan `file_size`
   * bo'yicha OLDIN (keraksiz yuklab olmaslik uchun) va baytlar
   * kelgandan keyin `UploadsService` da YANA. Birinchisi — tejash,
   * ikkinchisi — haqiqiy chegara.
   */
  async uploadFromTelegram(fileId: string) {
    if (!env.botToken) {
      this.logger.error("BOT_TOKEN yo'q — Telegram fayli yuklab olinmaydi");
      throw new ServiceUnavailableException("Fayl qabul qilish hozircha sozlanmagan");
    }

    const meta = await this.telegramGetFile(fileId);

    if (meta.fileSize !== null && meta.fileSize > MAX_FILE_SIZE) {
      throw new ForbiddenException("Fayl juda katta (eng ko'pi 25 MB)");
    }

    const url = `https://api.telegram.org/file/bot${env.botToken}/${meta.filePath}`;

    let buffer: Buffer;
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      if (!response.ok) {
        throw new Error(`Telegram ${response.status}`);
      }
      buffer = Buffer.from(await response.arrayBuffer());
    } catch (error) {
      this.logger.warn(`Telegram fayli olinmadi: ${String(error)}`);
      throw new ServiceUnavailableException("Fayl yuklab olinmadi — qaytadan urinib ko'ring");
    }

    // ⚠️ ASL NOM TELEGRAM'DAN OLINMAYDI: diskdagi nom baribir
    // `randomUUID()` va asl nom faqat ko'rsatish uchun saqlanadi.
    // `file_path` ni nom sifatida berish esa unga yo'l bo'laklarini
    // (`photos/file_1.jpg`) qo'shardi.
    return this.uploads.save({ buffer, size: buffer.length });
  }

  private async telegramGetFile(
    fileId: string,
  ): Promise<{ filePath: string; fileSize: number | null }> {
    const endpoint = `https://api.telegram.org/bot${env.botToken}/getFile`;

    let payload: {
      ok?: boolean;
      description?: string;
      result?: { file_path?: string; file_size?: number };
    };

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_id: fileId }),
        signal: AbortSignal.timeout(15_000),
      });
      payload = (await response.json()) as typeof payload;
    } catch (error) {
      this.logger.warn(`getFile chaqirilmadi: ${String(error)}`);
      throw new ServiceUnavailableException("Fayl yuklab olinmadi — qaytadan urinib ko'ring");
    }

    if (!payload?.ok || !payload.result?.file_path) {
      // ⚠️ TELEGRAM 20 MB DAN KATTA FAYLGA `file_path` BERMAYDI
      // (Bot API cheklovi) va bu eng ko'p uchraydigan sabab —
      // shuning uchun matn aynan shuni aytadi.
      this.logger.warn(`getFile rad etdi: ${payload?.description ?? "noma'lum"}`);
      throw new ForbiddenException(
        "Bu faylni yuklab bo'lmadi. Hajmi 20 MB dan kichik surat yoki video yuboring.",
      );
    }

    return {
      filePath: payload.result.file_path,
      fileSize: payload.result.file_size ?? null,
    };
  }
}
