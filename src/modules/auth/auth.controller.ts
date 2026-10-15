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

import {
  ClientIp,
  CurrentUser,
  Public,
  type RequestUser,
} from "../../common/decorators";
import { AuthService } from "./auth.service";
import { LoginDto, RefreshDto } from "./dto/auth.dto";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post("login")
  @HttpCode(200)
  login(
    @Body() dto: LoginDto,
    @ClientIp() ip: string | null,
    @Headers("user-agent") userAgent?: string,
  ) {
    return this.auth.login(dto.username, dto.password, { ip, userAgent });
  }

  @Public()
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
  @Get("me")
  me(@CurrentUser() user: RequestUser) {
    return user;
  }
}
