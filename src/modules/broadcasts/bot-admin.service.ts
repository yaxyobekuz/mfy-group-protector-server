/**
 * BOTDAGI ADMIN PANELI — SERVER TOMONI.
 *
 * ── NIMA UCHUN BOTGA XODIM OQIMI QAYTDI ───────────────────────────────
 *
 * ⚠️ ESKI XODIM OQIMI OLIB TASHLANGAN EDI va sababi aniq: u FUQARONI
 * boshi berk ko'chaga olib borardi ("Telegram id'ingizni ma'muriyatga
 * yuboring"). Ya'ni muammo xodim oqimida EMAS, uning fuqaro yo'liga
 * ARALASHIB ketganida edi.
 *
 * ⚠️ BU YERDAGI OQIM BOSHQACHA: u faqat `/admin` buyrug'i bilan
 * ochiladi va faqat `User.telegramId` bo'yicha tanilgan XODIMGA
 * ko'rinadi. Tanilmagan odam uchun `/admin` — mavjud bo'lmagan
 * buyruq, ya'ni fuqaro oqimi umuman o'zgarmaydi.
 *
 * ── BOT AYTGAN `userId` GA ISHONILMAYDI ───────────────────────────────
 *
 * ⚠️ XODIM FAQAT `telegramId` BO'YICHA TOPILADI (`bot-citizens` dagi
 * ayni qoida): bu qiymat Telegram tasdiqlagan (`message.from.id`),
 * bot o'ylab topgani emas. Bot aytgan `userId` qabul qilinsa,
 * `X-Bot-Key` tarqalgan holatda istalgan odam o'zini viloyat egasi
 * deb tanishtirib, butun aholiga xabar tarqata olardi.
 */

import { ForbiddenException, Injectable } from "@nestjs/common";
import { ScopeKind } from "@prisma/client";

import { PrismaService } from "../../prisma/prisma.service";
import type { ScopeContext } from "../../common/scope.util";
import { isProvinceWide } from "../../common/scope.util";

/** Botdagi panel uchun kerakli minimal ma'lumot. */
export interface BotAdmin {
  scope: ScopeContext;
  firstName: string;
  lastName: string;
  districtName: string | null;
  /** Viloyat bo'yicha yubora oladimi — botda "Hammaga" tugmasi shunga bog'liq. */
  provinceWide: boolean;
}

/** Tarqatma yuborish huquqi. */
export const BROADCAST_PERMISSION = "broadcast.send";

@Injectable()
export class BotAdminService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * XODIMNI TOPADI VA HUQUQINI TEKSHIRADI.
   *
   * ⚠️ TOPILMASA HAM, HUQUQI BO'LMASA HAM — AYNI 403. Ikkisini
   * ajratib ko'rsatish botga yozgan begona odamga "bu Telegram id
   * tizimda bor, lekin huquqi yo'q" degan ma'lumot berardi.
   *
   * ⚠️ ARXIVLANGAN VA O'CHIRILGAN XODIM O'TMAYDI: panelga kira
   * olmaydigan odam bot orqali ham ish qila olmasligi kerak — aks
   * holda "ishdan ketgan xodim hali ham xabar tarqatyapti" degan
   * holat chiqardi.
   */
  async resolve(telegramId: string): Promise<BotAdmin> {
    const user = await this.prisma.user.findUnique({
      where: { telegramId: telegramId.trim() },
      select: {
        id: true,
        role: true,
        scopeKind: true,
        districtId: true,
        permissions: true,
        isActive: true,
        isArchived: true,
        firstName: true,
        lastName: true,
        district: { select: { name: true } },
      },
    });

    const denied = new ForbiddenException(
      "Bu bo'lim faqat tizim xodimlari uchun. Telegram hisobingiz panelda bog'lanmagan bo'lishi mumkin.",
    );

    if (!user || !user.isActive || user.isArchived) throw denied;

    /**
     * ⚠️ `owner` RUXSAT RO'YXATIDAN O'TMAYDI (`PermissionsGuard` bilan
     * ayni qoida): uning ruxsati umuman o'qilmaydi, aks holda yangi
     * huquq qo'shilganda ega uni OLMAY qolishi mumkin edi.
     */
    if (user.role !== "owner" && !user.permissions.includes(BROADCAST_PERMISSION)) {
      throw denied;
    }

    const scope: ScopeContext = {
      userId: user.id,
      role: user.role,
      scopeKind: user.scopeKind,
      districtId: user.districtId,
    };

    return {
      scope,
      firstName: user.firstName,
      lastName: user.lastName,
      districtName: user.district?.name ?? null,
      provinceWide: isProvinceWide(scope),
    };
  }

  /**
   * BOTDAGI TUGMALAR UCHUN HUDUD RO'YXATI.
   *
   * ⚠️ QAMROV BO'YICHA KESILADI: tuman xodimi botda boshqa tumanlarni
   * KO'RMASLIGI kerak — ro'yxatda ko'rinib, bosilganda 403 bo'lish
   * eng yomon tajriba.
   *
   * ⚠️ ARXIVLANGANLAR CHIQARILADI: eski MFY ga e'lon yuborish
   * mumkin emas.
   */
  async territory(scope: ScopeContext) {
    const districtWhere = {
      isArchived: false,
      ...(isProvinceWide(scope)
        ? {}
        : { id: scope.districtId ?? "__yo'q__" }),
    };

    const districts = await this.prisma.district.findMany({
      where: districtWhere,
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    });

    const mahallas = await this.prisma.mahalla.findMany({
      where: {
        isArchived: false,
        districtId: { in: districts.map((district) => district.id) },
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, districtId: true },
    });

    return { districts, mahallas };
  }
}
