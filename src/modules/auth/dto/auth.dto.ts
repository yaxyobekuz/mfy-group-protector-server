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
