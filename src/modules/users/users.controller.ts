import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";

import {
  CurrentUser,
  RequirePermissions,
  type RequestUser,
} from "../../common/decorators";
import { PERMISSION_GROUPS, ROLE_DEFAULT_PERMISSIONS } from "../../common/permissions";
import type { ScopeContext } from "../../common/scope.util";
import { UsersService } from "./users.service";
import {
  ArchiveUserDto,
  CreateUserDto,
  ListUsersQuery,
  ResetPasswordDto,
  UpdateUserDto,
} from "./dto/users.dto";

const toScope = (user: RequestUser): ScopeContext => ({
  userId: user.id,
  role: user.role,
  scopeKind: user.scopeKind,
  districtId: user.districtId,
});

@Controller("users")
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /**
   * RUXSAT KATALOGI — panel formani shundan quradi.
   *
   * ⚠️ SERVERDAN KELADI, panelda nusxa yo'q. `common/permissions.ts`
   * va panel nusxasi qo'lda sinxron bo'lishi talab qilinardi va u
   * albatta eskirardi: panelda tugma ko'rinib, server 403 qaytarardi.
   * Katalogni serverdan berish bu muammoni butunlay yo'q qiladi.
   */
  @Get("permissions-catalog")
  @RequirePermissions("users.view")
  catalog() {
    return { groups: PERMISSION_GROUPS, roleDefaults: ROLE_DEFAULT_PERMISSIONS };
  }

  @Get()
  @RequirePermissions("users.view")
  list(@CurrentUser() user: RequestUser, @Query() query: ListUsersQuery) {
    return this.users.list(toScope(user), query);
  }

  @Post()
  @RequirePermissions("users.manage")
  create(@Body() dto: CreateUserDto, @CurrentUser() user: RequestUser) {
    return this.users.create(dto, toScope(user));
  }

  @Patch(":id")
  @RequirePermissions("users.manage")
  update(
    @Param("id") id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.users.update(id, dto, toScope(user));
  }

  @Patch(":id/archive")
  @RequirePermissions("users.manage")
  archive(
    @Param("id") id: string,
    @Body() dto: ArchiveUserDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.users.archive(id, dto.archived, toScope(user));
  }

  @Patch(":id/password")
  @RequirePermissions("users.manage")
  resetPassword(
    @Param("id") id: string,
    @Body() dto: ResetPasswordDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.users.resetPassword(id, dto, toScope(user));
  }
}
