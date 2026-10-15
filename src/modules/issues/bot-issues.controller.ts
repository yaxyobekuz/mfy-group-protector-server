/**
 * BOT UCHUN MUAMMO ENDPOINT'LARI.
 *
 * Botdagi oqim: kategoriya tanlanadi → matn yoziladi → muammo
 * yaratiladi.
 *
 * ⚠️ BOT KATEGORIYA YARATMAYDI, faqat FAOL bo'lganlarini o'qiydi.
 * Kategoriya — sozlama, foydalanuvchi kiritadigan ma'lumot emas.
 *
 * ⚠️ MUALLIF `telegramId` BO'YICHA TOPILADI, bot aytgan `userId`
 * bo'yicha EMAS. Bot `X-Bot-Key` bilan kiradi va unga "men
 * falonchi nomidan yozyapman" deyishga ishonib bo'lmaydi: kalit
 * tarqalgan bo'lsa, istalgan xodim nomidan muammo yozish mumkin
 * bo'lardi. `telegramId` esa Telegram tasdiqlagan qiymat.
 */

import { Body, Controller, Get, Post } from "@nestjs/common";
import { ForbiddenException } from "@nestjs/common";
import { IsString, Length, MaxLength } from "class-validator";

import { BotOnly } from "../../common/decorators";
import { PrismaService } from "../../prisma/prisma.service";
import { CategoriesService } from "./categories.service";
import { IssuesService } from "./issues.service";

class BotSubmitDto {
  /** Telegram foydalanuvchi id'si — xodim shu bilan topiladi. */
  @IsString() @MaxLength(64) telegramId!: string;

  /** Javob shu chatga qaytadi. */
  @IsString() @MaxLength(64) chatId!: string;

  @IsString() categoryId!: string;

  /**
   * ⚠️ CHEGARA botdagi bilan AYNI (`bot/src/features/issue/...`).
   * Ikkisi ajralsa, bot qabul qilgan matn serverda rad etilib,
   * foydalanuvchi "yuborildi" deb o'ylab qolardi.
   */
  @IsString() @Length(10, 1500) body!: string;
}

class BotLinkCheckDto {
  @IsString() @MaxLength(64) telegramId!: string;
}

@Controller("bot/issues")
export class BotIssuesController {
  constructor(
    private readonly issues: IssuesService,
    private readonly categories: CategoriesService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * BOG'LANISH TEKSHIRUVI — bot menyuni shunga qarab ko'rsatadi.
   *
   * ⚠️ BOT RUXSATGA QARAB SHOXLANMAYDI: xodimga faqat "muammo
   * yuborish" ochiq va u har doim o'ziga ruxsat etilgan. Ruxsat
   * tekshiruvini botda takrorlash ruxsat tizimini IKKIGA bo'lardi.
   */
  @BotOnly()
  @Post("link-check")
  async linkCheck(@Body() dto: BotLinkCheckDto) {
    const user = await this.prisma.user.findUnique({
      where: { telegramId: dto.telegramId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        isActive: true,
        isArchived: true,
        district: { select: { name: true } },
      },
    });

    if (!user || user.isArchived || !user.isActive) {
      return { linked: false as const };
    }

    return {
      linked: true as const,
      firstName: user.firstName,
      lastName: user.lastName,
      districtName: user.district?.name ?? null,
    };
  }

  /** Klaviatura uchun FAOL kategoriyalar. */
  @BotOnly()
  @Get("categories")
  categoriesList() {
    return this.categories.list(true);
  }

  @BotOnly()
  @Post()
  async submit(@Body() dto: BotSubmitDto) {
    const user = await this.prisma.user.findUnique({
      where: { telegramId: dto.telegramId },
      select: { id: true, isActive: true, isArchived: true },
    });

    // ⚠️ BOG'LANMAGAN TELEGRAMDAN MUAMMO QABUL QILINMAYDI: muallifi
    // yo'q murojaat "kim yozdi" degan savolga javob bermaydi va
    // javob ham qaytib bora olmaydi.
    if (!user || user.isArchived || !user.isActive) {
      throw new ForbiddenException("Bu Telegram hisobi tizimga bog'lanmagan");
    }

    const issue = await this.issues.createFromBot({
      categoryId: dto.categoryId,
      authorId: user.id,
      authorChatId: dto.chatId,
      // ⚠️ SARLAVHA MATNNING BIRINCHI QATORIDAN: botda ikki
      // bosqich (kategoriya + matn) va uchinchi savol
      // ("sarlavhani yozing") oqimni tashlab ketishga olib
      // kelardi.
      title: this.deriveTitle(dto.body),
      body: dto.body.trim(),
    });

    return { publicNo: issue.publicNo, id: issue.id };
  }

  private deriveTitle(body: string): string {
    const first = body.trim().split(/[.!?\n]/)[0]?.trim() || body.trim();
    return first.length > 90 ? `${first.slice(0, 90)}…` : first;
  }
}
