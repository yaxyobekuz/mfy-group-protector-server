/**
 * MUROJAAT TRIAJI — TAKRORIY VA SHUBHALI.
 *
 * ── IKKI ALOHIDA SAVOL, BITTA JOYDA ───────────────────────────────────
 *
 *   1. Bu murojaat ALLAQACHON KELGAN muammomi? (ommaviy hodisa)
 *   2. Bu murojaat UMUMAN murojaatmi? (mazmunsiz matn)
 *
 * ⚠️ IKKALASI HAM FAQAT BELGILAYDI, HECH NARSANI RAD ETMAYDI.
 * Murojaat baribir yaratiladi va fuqaro "qabul qilindi" degan javobni
 * oladi. Avtomatik rad etish xato bo'lsa, HAQIQIY muammo jimgina
 * yo'qolardi — va buni hech kim sezmasdi.
 *
 * ⚠️ QAROR XODIMDA QOLADI (`signals` doktrinasi bilan ayni mantiq):
 * tizim taxmin qiladi, odam hal qiladi.
 */

import { Injectable, Logger } from "@nestjs/common";
import { IssueStatus } from "@prisma/client";

import { PrismaService } from "../../prisma/prisma.service";

/**
 * TAKRORIY DEB HISOBLASH OYNASI.
 *
 * ⚠️ 12 SOAT — HODISA UZUNLIGI, SUTKA EMAS. Transformator o'chganda
 * xabarlar bir-ikki soat ichida keladi; ertasi kuni kelgan xabar esa
 * odatda BOSHQA uzilish (yoki hal qilinmagani haqidagi shikoyat) va
 * uni eskisiga ulab qo'yish yangi muammoni KO'MIB yuborardi.
 *
 * ⚠️ SUTKA QILINMADI: kechqurun boshlangan uzilish ertalabgi
 * xabarlarni ham qamrab olishi uchun 12 soat yetarli, lekin "kecha
 * bo'lgan narsa" ga ulanib ketmaydi.
 */
const DUPLICATE_WINDOW_MS = 12 * 60 * 60 * 1000;

/**
 * ⚠️ FAQAT OCHIQ MUROJAATGA ULANADI: yopilgan muammoga yangi
 * murojaatni ulash uni KO'MIB yuborardi — javob allaqachon berilgan
 * va yangi fuqaro hech narsa olmasdi.
 */
const OPEN_STATUSES = [IssueStatus.new, IssueStatus.in_progress];

/** Matn shu uzunlikdan qisqa bo'lsa — mazmunsiz deb belgilanadi. */
const MIN_MEANINGFUL_LENGTH = 25;

/** Shu sondan kam NOYOB so'z — mazmunsiz. */
const MIN_UNIQUE_WORDS = 4;

export interface TriageResult {
  duplicateOfId: string | null;
  isSuspicious: boolean;
  suspicionReason: string | null;
}

@Injectable()
export class AppealTriageService {
  private readonly logger = new Logger(AppealTriageService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * MUROJAATNI TEKSHIRADI (yaratishdan OLDIN).
   *
   * ⚠️ XATO YUTILADI: triaj — QULAYLIK va u ishlamagani uchun murojaat
   * yo'qolmasligi kerak. Xato bo'lsa, murojaat oddiy holda yaratiladi.
   */
  async triage(input: {
    body: string;
    categoryId: string;
    mahallaId: string | null;
    /** Fuqaro ismi — matn shunchaki ism bo'lsa aniqlash uchun. */
    citizenName?: string | null;
    /** AI ishonch foizi (0-100) — bo'lsa, belgi sifatida ishlatiladi. */
    aiConfidence?: number | null;
  }): Promise<TriageResult> {
    const suspicion = this.suspicion(input.body, input.citizenName, input.aiConfidence);

    let duplicateOfId: string | null = null;

    /**
     * ⚠️ SHUBHALI MUROJAAT TAKRORIY DEB ULANMAYDI va bu TIRIK
     * sinovda topilgan xato edi: matni "nilufar xalilova" bo'lgan
     * murojaat o'sha MFY dagi transformator hodisasiga ulanib
     * qoldi — ya'ni hodisa yopilganda odam "Transformator
     * almashtirildi" degan javobni olardi.
     *
     * ⚠️ SABAB MANTIQDA: "takroriy" degani — bu AYNI hodisa
     * ekanini BILAMIZ. Mazmunsiz matnda esa hodisa nima ekani
     * NOMA'LUM va taxminga asoslangan ulash fuqaroga BEGONA
     * javob yuborardi.
     *
     * ⚠️ IKKI BELGI BIRGA TURSA, SHUBHA USTUN: shubhali murojaat
     * XODIM ko'rishi uchun ajratilgan, takroriy esa AVTOMATIK
     * yopiladi — ikkisi birga bo'lsa, ajratishning ma'nosi
     * yo'qolardi (hech kim ko'rmasdan yopilib ketardi).
     */
    if (suspicion === null) {
      try {
        duplicateOfId = await this.findDuplicate(input.mahallaId, input.categoryId);
      } catch (error) {
        this.logger.warn(`Takroriy tekshiruvi o'tmadi: ${(error as Error).message}`);
      }
    }

    return {
      duplicateOfId,
      isSuspicious: suspicion !== null,
      suspicionReason: suspicion,
    };
  }

  /**
   * AYNI MFY + AYNI YO'NALISHDAGI OCHIQ MUROJAATNI TOPADI.
   *
   * ⚠️ MATN SOLISHTIRILMAYDI va bu ataylab. "Svet yo'q", "elektr
   * o'chdi", "света нет" — bitta hodisa, uch xil matn. Matn bo'yicha
   * o'xshashlik qidirish (yoki AI) ularni BOG'LAMASDI, lekin
   * "kanalizatsiya toshdi" va "kanalizatsiya hidi" kabi IKKI BOSHQA
   * muammoni bog'lab qo'yardi.
   *
   * ⚠️ MFY + YO'NALISH + VAQT — UCHALASI BIRGA yetarlicha aniq:
   * bitta mahallada, bitta sutkada, bitta xizmat bo'yicha ikki
   * ALOHIDA muammo bo'lishi kamdan-kam.
   *
   * ⚠️ MFY BO'LMASA UMUMAN QIDIRILMAYDI: hududsiz murojaatlarni
   * bir-biriga ulash butun viloyatdagi tasodifiy ikki odamni
   * bog'lardi.
   *
   * ⚠️ ZANJIR QURILMAYDI: topilgan murojaatning o'zi takroriy bo'lsa,
   * uning ASOSIYSI olinadi. Aks holda "A → B → C" zanjiri paydo
   * bo'lib, javob yetkazishda uni oxirigacha aylanib chiqish kerak
   * bo'lardi.
   */
  private async findDuplicate(
    mahallaId: string | null,
    categoryId: string,
  ): Promise<string | null> {
    if (!mahallaId) return null;

    const since = new Date(Date.now() - DUPLICATE_WINDOW_MS);

    const recent = await this.prisma.issue.findFirst({
      where: {
        mahallaId,
        categoryId,
        status: { in: OPEN_STATUSES },
        createdAt: { gte: since },
      },
      orderBy: { createdAt: "asc" },
      select: { id: true, duplicateOfId: true },
    });

    if (!recent) return null;

    return recent.duplicateOfId ?? recent.id;
  }

  /**
   * MATN MAZMUNLIMI.
   *
   * ⚠️ QOIDALAR QAT'IY, AI EMAS (`threat-rules.ts` bilan ayni
   * yondashuv): "bu murojaat mazmunsiz" degan xulosa fuqaroning
   * ishiga ta'sir qiladi va u TEKSHIRILADIGAN bo'lishi kerak.
   *
   * ⚠️ SABAB QAYTARILADI, `true`/`false` emas: panelda xodim NIMA
   * uchun ajratilganini ko'rishi kerak — aks holda u yorliqqa
   * ishonmasdi.
   */
  private suspicion(
    body: string,
    citizenName?: string | null,
    aiConfidence?: number | null,
  ): string | null {
    const text = body.trim();

    /**
     * ⚠️ MATN FUQARONING O'Z ISMI — HAQIQIY HOLATDAN: panelda
     * murojaat matni "нилуфар халилова" bo'lgan, ya'ni odam
     * maydonga o'z ismini yozgan (yoki tizimni sinab ko'rgan).
     */
    if (citizenName) {
      const normalized = (value: string): string =>
        value
          .toLocaleLowerCase("uz")
          .replace(/[^\p{L}\p{N}]+/gu, " ")
          .trim();

      const normalizedBody = normalized(text);
      const normalizedName = normalized(citizenName);

      if (normalizedName.length > 3 && normalizedBody === normalizedName) {
        return "matn — fuqaroning o'z ismi";
      }
    }

    if (text.length < MIN_MEANINGFUL_LENGTH) {
      return "matn juda qisqa";
    }

    /**
     * ⚠️ NOYOB SO'ZLAR SANALADI, UMUMIY EMAS: "test test test test
     * test test" uzun, lekin mazmunsiz.
     */
    const words = text
      .toLocaleLowerCase("uz")
      .split(/[^\p{L}\p{N}]+/u)
      .filter((word) => word.length > 1);

    const unique = new Set(words);

    if (unique.size < MIN_UNIQUE_WORDS) {
      return "matnda ma'noli so'z kam";
    }

    /**
     * ⚠️ AI ISHONCHI PAST — UCHINCHI DARAJALI BELGI va u YAKKA
     * ishlamaydi: model mavzuni tanimasligi mumkin (yangi, noodatiy
     * muammo) va bu murojaatni mazmunsiz qilmaydi. Shuning uchun u
     * faqat MATN HAM qisqa bo'lganda qo'shiladi — lekin o'sha holat
     * yuqorida allaqachon ushlangan. Ya'ni bu yerda u faqat ANIQ
     * past qiymatda ishlaydi.
     */
    if (typeof aiConfidence === "number" && aiConfidence > 0 && aiConfidence < 20) {
      return "AI yo'nalishni aniqlay olmadi";
    }

    return null;
  }
}
