import { IsString, MaxLength, MinLength } from "class-validator";

export class LoginDto {
  @IsString()
  @MinLength(3, { message: "username kamida 3 belgi" })
  @MaxLength(64)
  username!: string;

  /**
   * ⚠️ UZUNLIK CHEGARASI BOR: argon2 uzun satrni ham hisoblaydi va
   * 1 MB parol yuborish CPU'ni band qilib qo'yishning arzon yo'li
   * bo'lardi (DoS).
   */
  @IsString()
  @MinLength(6, { message: "parol kamida 6 belgi" })
  @MaxLength(128)
  password!: string;
}

export class RefreshDto {
  @IsString()
  refreshToken!: string;
}

/**
 * O'Z PAROLINI ALMASHTIRISH.
 *
 * ⚠️ ESKI PAROL HAM TALAB QILINADI, token yetarli emas: panel ochiq
 * qoldirilgan kompyuterga kelgan odam parolni o'zgartirib, hisobni
 * butunlay egallab olardi. Token "kim" degan savolga javob beradi,
 * eski parol esa "shu odammi" degan savolga.
 *
 * ⚠️ `MinLength(8)` — `LoginDto` DAGI 6 DAN KO'P: u yerda chegara
 * ESKI parollarni ham o'tkazishi kerak (bazada allaqachon bor),
 * bu yerda esa YANGI parol qo'yiladi va unga qattiqroq talab
 * qo'yish mumkin. Pasaytirilsa, tashkilot tayyor parolini "123456"
 * ga almashtirib qo'yardi.
 */
export class ChangePasswordDto {
  @IsString() @MaxLength(128) currentPassword!: string;

  @IsString()
  @MinLength(8, { message: "Yangi parol kamida 8 belgi" })
  @MaxLength(128)
  newPassword!: string;
}
