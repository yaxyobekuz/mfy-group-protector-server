/**
 * FAYL YUKLASH — surat/video DISKKA, imzolangan havola bilan.
 *
 * ⚠️ TUR BAYTDAN ANIQLANADI (`Content-Type` dan emas): mijoz
 * `Content-Type` ni istalgancha yozadi. Zararli kontent qalqoni bilan
 * AYNI mantiq — taxminga emas, DALILGA tayanadi.
 *
 * ⚠️ DISKDAGI NOM `randomUUID`: asl nom (`../../.env`) yo'l sifatida
 * ISHLATILMAYDI. Asl nom faqat ma'lumot uchun saqlanadi.
 *
 * ⚠️ NATIJA IMZOLANGAN TOKEN (`signed-ref.ts`): murojaat yaratishda
 * mijoz shu tokenni qaytaradi va server undan fayl ma'lumotini
 * TIKLAYDI — mijoz aytgan yo'l/turga ishonmaydi. Imzo 6 soat yaroqli
 * (qoralama muddati bilan ayni).
 */

import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { BadRequestException, Injectable } from "@nestjs/common";

import { signRef, verifyRef } from "../../common/signed-ref";
import {
  MAX_FILE_SIZE,
  SIGNATURES,
  UPLOADS_DIR,
  type AttachmentKind,
} from "./uploads.constants";

/** Imzolangan token ichidagi fayl ma'lumoti. */
export interface AttachmentRef {
  kind: AttachmentKind;
  path: string;
  mime: string;
  size: number;
  originalName: string | null;
}

const SIGN_CONTEXT = "upload";

@Injectable()
export class UploadsService {
  /**
   * Faylni tekshiradi, saqlaydi va imzolangan havola qaytaradi.
   */
  async save(
    file: {
      buffer: Buffer;
      size: number;
      originalname?: string;
    },
    /**
     * RUXSAT ETILGAN TURLAR — chaqiruvchi cheklaydi.
     *
     * ⚠️ NIMA UCHUN KANALGA QARAB FARQ QILADI: mobil ilova FAQAT
     * surat tanlaydi (`image_picker.pickImage`), ya'ni undan video
     * kelishi mumkin emas — kelsa, bu ilova emas, QO'LDA yasalgan
     * so'rov. Botda esa fuqaro Telegram'da videoni ATAYLAB yuboradi
     * va u haqiqiy dalil bo'ladi.
     *
     * ⚠️ RO'YXAT TOR TOMONGA cheklanadi, keng tomonga EMAS: bu
     * parametr `SIGNATURES` ga yangi tur QO'SHMAYDI, faqat
     * mavjudlarining bir qismini tanlaydi. Shuning uchun uni
     * noto'g'ri berib ro'yxatdan tashqari faylni o'tkazib
     * yuborish imkoni yo'q.
     *
     * ⚠️ STANDART — IKKISI HAM: mavjud chaqiruvchilar (bot yo'li)
     * o'zgarmaydi.
     */
    allowedKinds: readonly AttachmentKind[] = ["photo", "video"],
  ): Promise<{ token: string; kind: AttachmentKind; url: string; size: number }> {
    if (!file?.buffer || file.size === 0) {
      throw new BadRequestException("Fayl bo'sh");
    }

    /**
     * ⚠️ HAJM IKKI JOYDA TEKSHIRILADI: `FileInterceptor` ning
     * `limits.fileSize` si ham bor (`mobile.controller.ts`), lekin
     * unga TAYANIB bo'lmaydi — u faqat HTTP yuklash yo'lida
     * ishlaydi, bot yo'lida esa baytlar Telegram'dan keladi va
     * interceptor umuman ishtirok etmaydi. HAQIQIY chegara SHU
     * YERDA.
     */
    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException("Fayl juda katta (eng ko'pi 25 MB)");
    }

    const signature = this.detect(file.buffer);
    if (!signature) {
      throw new BadRequestException(
        "Fayl turi qo'llab-quvvatlanmaydi — faqat surat yoki video",
      );
    }

    /**
     * ⚠️ TUR BAYTDAN ANIQLANGANDAN KEYIN tekshiriladi, `Content-Type`
     * dan EMAS: `.mp4` ni `image/jpeg` deb e'lon qilib yuborish bir
     * qatorlik ish va o'shanda cheklov aylanib o'tilardi.
     */
    if (!allowedKinds.includes(signature.kind)) {
      throw new BadRequestException(
        "Bu yerda faqat surat yuborish mumkin",
      );
    }

    // ⚠️ DISK NOMI UUID — asl nomdan mustaqil (yo'l hujumidan himoya).
    const diskName = `${randomUUID()}${signature.ext}`;

    await mkdir(UPLOADS_DIR, { recursive: true });
    await writeFile(join(UPLOADS_DIR, diskName), file.buffer);

    const ref: AttachmentRef = {
      kind: signature.kind,
      path: `/uploads/${diskName}`,
      mime: signature.mime,
      size: file.size,
      // ⚠️ ASL NOM KESILADI va faqat saqlanadi — hech qachon yo'l
      // sifatida ishlatilmaydi.
      originalName: file.originalname?.slice(0, 200) ?? null,
    };

    return {
      token: signRef(SIGN_CONTEXT, ref),
      kind: signature.kind,
      url: ref.path,
      size: file.size,
    };
  }

  /**
   * Imzolangan tokendan fayl ma'lumotini TIKLAYDI (murojaat yaratishda).
   *
   * ⚠️ `null` — token buzilgan/eskirgan/soxta. Mijoz aytgan qiymatga
   * ishonilmaydi: faqat server imzolagani qabul qilinadi.
   */
  resolveToken(token: string): AttachmentRef | null {
    return verifyRef<AttachmentRef>(SIGN_CONTEXT, token);
  }

  /**
   * Fayl boshidagi baytlarni ro'yxatdagi imzolar bilan solishtiradi.
   */
  private detect(buffer: Buffer): (typeof SIGNATURES)[number] | null {
    for (const sig of SIGNATURES) {
      const offset = sig.offset ?? 0;
      if (buffer.length < offset + sig.magic.length) continue;

      let match = true;
      for (let i = 0; i < sig.magic.length; i += 1) {
        const expected = sig.magic[i];
        // `null` — istalgan bayt (WebP hajm maydoni kabi).
        if (expected === null) continue;
        if (buffer[offset + i] !== expected) {
          match = false;
          break;
        }
      }

      if (match) return sig;
    }

    return null;
  }
}
