/**
 * KIRISH ENDPOINT'LARI.
 *
 * ⚠️ REFRESH TOKEN JAVOB TANASIDA ketadi, cookie'da emas. Sabab:
 * panel BOSHQA domenda (`localhost:3000` → `localhost:4000`, ishlab
 * chiqarishda ham alohida) va cross-site cookie `SameSite=None;
 * Secure` talab qiladi — u esa HTTPS'siz ishlamaydi va ba'zi
 * brauzerlarda umuman bloklanadi. Tanada yuborilganda panel uni
 * o'zi saqlaydi va har muhitda bir xil ishlaydi.
 */

import { Body, Controller, Headers, HttpCode, Post, Get } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";

import {
  AllowPendingPassword,
  ClientIp,
  CurrentUser,
  Public,
  type RequestUser,
} from "../../common/decorators";
import { THROTTLE } from "../../common/throttle";
import { AuthService } from "./auth.service";
import { ChangePasswordDto, LoginDto, RefreshDto } from "./dto/auth.dto";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /**
   * ⚠️ TEZLIK CHEGARASI (`THROTTLE.AUTH`) — BU YERDA ENG MUHIM, chunki
   * bu TIZIMDAGI YAGONA PAROLLI kirish: fuqaro yo'llarida parol
   * umuman yo'q (Google/Apple/Telegram tasdiqlaydi), xodim esa parol
   * bilan kiradi. Chegarasiz qoldirilsa, lug'at hujumi bilan parolni
   * sinab ko'rish yo'li OCHIQ qolardi — va panelga kirgan odam butun
   * viloyat ma'lumotini ko'rardi.
   *
   * ⚠️ IP BO'YICHA (`throttler.guard.ts`): kirish paytida token yo'q.
   */
  @Public()
  @Throttle({ [THROTTLE.AUTH]: {} })
  @Post("login")
  @HttpCode(200)
  login(
    @Body() dto: LoginDto,
    @ClientIp() ip: string | null,
    @Headers("user-agent") userAgent?: string,
  ) {
    return this.auth.login(dto.username, dto.password, { ip, userAgent });
  }

  // ⚠️ `refresh` HAM CHEGARALANADI: u ham tokensiz kiradigan yo'l va
  // refresh tokenni taxmin qilishga urinish mumkin bo'lardi.
  @Public()
  @Throttle({ [THROTTLE.AUTH]: {} })
  @Post("refresh")
  @HttpCode(200)
  refresh(
    @Body() dto: RefreshDto,
    @ClientIp() ip: string | null,
    @Headers("user-agent") userAgent?: string,
  ) {
    return this.auth.refresh(dto.refreshToken, { ip, userAgent });
  }

  /**
   * ⚠️ `@Public()`: tokeni muddati tugagan odam ham chiqa olishi
   * kerak. Token talab qilinsa, u "chiqish" tugmasini bosib 401
   * olardi va panelda qolib ketardi.
   */
  @Public()
  @Post("logout")
  @HttpCode(200)
  logout(@Body() dto: Partial<RefreshDto>) {
    return this.auth.logout(dto.refreshToken);
  }

  /**
   * JORIY XODIM — panel har yuklanishda shuni so'raydi.
   *
   * ⚠️ RUXSATLAR SHU YERDAN KELADI, tokendan emas: ruxsat
   * o'zgarganda panel DARHOL yangi ro'yxatni oladi (`JwtAuthGuard`
   * ham bazadan o'qiydi — ayni mantiq).
   */
  /**
   * ⚠️ PAROL ALMASHTIRILMAGAN BO'LSA HAM ISHLAYDI: panel
   * `mustChangePassword` ni aynan shu javobdan biladi va usiz
   * foydalanuvchi "nimadir xato" degan ekranda qolardi.
   */
  @AllowPendingPassword()
  @Get("me")
  me(@CurrentUser() user: RequestUser) {
    return user;
  }

  /**
   * O'Z PAROLINI ALMASHTIRISH.
   *
   * ⚠️ RUXSAT TALAB QILINMAYDI (`@RequirePermissions` YO'Q): o'z
   * parolini har kim almashtirishi kerak va tashkilot xodimida
   * `users.manage` yo'q. Himoya — ESKI PAROL
   * (`auth.service.ts#changePassword`).
   *
   * ⚠️ `THROTTLE.AUTH` BILAN: bu yerda ham parol tekshiriladi,
   * ya'ni token o'g'irlangan holatda eski parolni sinab ko'rish
   * yo'li bo'lardi.
   */
  @AllowPendingPassword()
  @Throttle({ [THROTTLE.AUTH]: {} })
  @Post("change-password")
  @HttpCode(200)
  changePassword(
    @CurrentUser() user: RequestUser,
    @Body() dto: ChangePasswordDto,
    @ClientIp() ip: string | null,
    @Headers("user-agent") userAgent?: string,
  ) {
    return this.auth.changePassword(user.id, dto.currentPassword, dto.newPassword, {
      ip,
      userAgent,
    });
  }
}
