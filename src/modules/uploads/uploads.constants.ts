/**
 * YUKLASH SOZLAMALARI.
 *
 * ⚠️ TUR FAYL ICHIDAN (baytdan) aniqlanadi, `Content-Type` dan EMAS —
 * uni mijoz yozadi va `.exe` ni `image/jpeg` deb yuborish bir qatorlik
 * ish. Bu zararli kontent qalqoni bilan AYNI mantiq: taxminga emas,
 * DALILGA tayanadi.
 */

import { join } from "node:path";

/** Diskdagi ildiz — `/uploads/` manzilidan shu papka ko'rsatiladi. */
export const UPLOADS_DIR = join(process.cwd(), "uploads", "appeals");

/** Eng katta fayl hajmi (bayt). 25 MB — qisqa video ham sig'adi. */
export const MAX_FILE_SIZE = 25 * 1024 * 1024;

export type AttachmentKind = "photo" | "video";

/**
 * RUXSAT ETILGAN TURLAR — magic-byte "imzosi" bo'yicha.
 *
 * ⚠️ RO'YXAT CHEKLANGAN: faqat surat va qisqa video. Hujjat, arxiv,
 * o'rnatma fayl QABUL QILINMAYDI — murojaat DALILI surat/video, boshqa
 * narsa emas, va ruxsat etilmagan tur zararli kontent yo'li bo'lardi.
 */
export interface FileSignature {
  kind: AttachmentKind;
  mime: string;
  ext: string;
  /** Fayl boshidagi baytlar (null — istalgan qiymat). */
  magic: (number | null)[];
  /** `ftyp` qutilaridagi ikkinchi darajali tekshiruv (video uchun). */
  offset?: number;
}

export const SIGNATURES: FileSignature[] = [
  // ── SURAT ──────────────────────────────────────────────────────
  { kind: "photo", mime: "image/jpeg", ext: ".jpg", magic: [0xff, 0xd8, 0xff] },
  { kind: "photo", mime: "image/png", ext: ".png", magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  // WebP: "RIFF????WEBP"
  { kind: "photo", mime: "image/webp", ext: ".webp", magic: [0x52, 0x49, 0x46, 0x46, null, null, null, null, 0x57, 0x45, 0x42, 0x50] },
  // HEIC/HEIF: offset 4 "ftypheic"/"ftypmif1" — zamonaviy iPhone surati.
  { kind: "photo", mime: "image/heic", ext: ".heic", magic: [0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63], offset: 4 },
  { kind: "photo", mime: "image/heif", ext: ".heif", magic: [0x66, 0x74, 0x79, 0x70, 0x6d, 0x69, 0x66, 0x31], offset: 4 },
  // ── VIDEO ──────────────────────────────────────────────────────
  // MP4: offset 4 "ftyp" (keyin isom/mp42/mp41...).
  { kind: "video", mime: "video/mp4", ext: ".mp4", magic: [0x66, 0x74, 0x79, 0x70], offset: 4 },
  // QuickTime (iPhone .mov): offset 4 "ftypqt".
  { kind: "video", mime: "video/quicktime", ext: ".mov", magic: [0x66, 0x74, 0x79, 0x70, 0x71, 0x74], offset: 4 },
];
