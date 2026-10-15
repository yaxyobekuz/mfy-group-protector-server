import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from "@nestjs/common";

import {
  CurrentUser,
  RequirePermissions,
  type RequestUser,
} from "../../common/decorators";
import type { ScopeContext } from "../../common/scope.util";
import { SignalsService } from "./signals.service";
import { SignalsJob } from "./signals.job";
import { SignalAiService } from "./ai/signal-ai.service";
import { AttachSignalDto, DismissSignalDto, ListSignalsQuery } from "./dto/signals.dto";

const toScope = (user: RequestUser): ScopeContext => ({
  userId: user.id,
  role: user.role,
  scopeKind: user.scopeKind,
  districtId: user.districtId,
});

@Controller("signals")
export class SignalsController {
  constructor(
    private readonly signals: SignalsService,
    private readonly job: SignalsJob,
    private readonly ai: SignalAiService,
  ) {}

  @Get()
  @RequirePermissions("signals.view")
  list(@CurrentUser() user: RequestUser, @Query() query: ListSignalsQuery) {
    return this.signals.list(toScope(user), query);
  }

  @Get("counts")
  @RequirePermissions("signals.view")
  counts(@CurrentUser() user: RequestUser) {
    return this.signals.getCounts(toScope(user));
  }

  /** Tahlil holati — panelda "oxirgi tekshiruv" satri. */
  @Get("status")
  @RequirePermissions("signals.view")
  status() {
    return {
      aiEnabled: this.ai.isEnabled(),
      model: this.ai.model,
      ...this.job.getStatus(),
    };
  }

  /**
   * HOZIR TEKSHIRISH.
   *
   * ⚠️ ALOHIDA RUXSAT (`signals.run`): har bosishda AI so'rovi
   * ketadi, ya'ni PUL sarflanadi. Hisobot uchun kirgan odam uni
   * qayta-qayta bosib turmasligi kerak.
   *
   * ⚠️ BIR VAQTDA BITTA AYLANISH — `SignalsJob` ichida
   * kafolatlanadi: ikkinchi chaqiruv yangi aylanish boshlamaydi,
   * birinchisini KUTADI.
   */
  @Post("run")
  @RequirePermissions("signals.run")
  @HttpCode(200)
  run() {
    return this.job.runNow();
  }

  @Patch(":id/attach")
  @RequirePermissions("signals.attach")
  attach(
    @Param("id") id: string,
    @Body() dto: AttachSignalDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.signals.attach(id, dto, toScope(user));
  }

  @Patch(":id/dismiss")
  @RequirePermissions("signals.dismiss")
  dismiss(
    @Param("id") id: string,
    @Body() dto: DismissSignalDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.signals.dismiss(id, dto, toScope(user));
  }
}
