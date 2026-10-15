/**
 * MUAMMO ENDPOINT'LARI.
 *
 * ⚠️ `DELETE` YO'Q. Muammo o'chirilmaydi — rad etiladi (`rejected`)
 * sababi bilan. Rasmiy navbatdan yozuvni yo'q qilish "bu murojaat
 * umuman bo'lmagan" degan ma'noni berardi va hisobot raqamlari
 * orqaga ketardi.
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";

import {
  CurrentUser,
  RequirePermissions,
  type RequestUser,
} from "../../common/decorators";
import type { ScopeContext } from "../../common/scope.util";
import { CategoriesService } from "./categories.service";
import { IssuesService } from "./issues.service";
import {
  AddCommentDto,
  AssignIssueDto,
  CreateCategoryDto,
  CreateIssueDto,
  ListIssuesQuery,
  ResolveIssueDto,
  UpdateCategoryDto,
} from "./dto/issues.dto";

const toScope = (user: RequestUser): ScopeContext => ({
  userId: user.id,
  role: user.role,
  scopeKind: user.scopeKind,
  districtId: user.districtId,
});

@Controller("issues")
export class IssuesController {
  constructor(private readonly issues: IssuesService) {}

  @Get()
  @RequirePermissions("issues.view")
  list(@CurrentUser() user: RequestUser, @Query() query: ListIssuesQuery) {
    return this.issues.list(toScope(user), query);
  }

  @Get("stats")
  @RequirePermissions("issues.view")
  stats(@CurrentUser() user: RequestUser) {
    return this.issues.getStats(toScope(user));
  }

  @Get(":id")
  @RequirePermissions("issues.view")
  findOne(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.issues.findOne(id, toScope(user));
  }

  @Post()
  @RequirePermissions("issues.create")
  create(@Body() dto: CreateIssueDto, @CurrentUser() user: RequestUser) {
    return this.issues.create(dto, toScope(user));
  }

  @Patch(":id/assign")
  @RequirePermissions("issues.assign")
  assign(
    @Param("id") id: string,
    @Body() dto: AssignIssueDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.issues.assign(id, dto, toScope(user));
  }

  @Patch(":id/resolve")
  @RequirePermissions("issues.resolve")
  resolve(
    @Param("id") id: string,
    @Body() dto: ResolveIssueDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.issues.resolve(id, dto, toScope(user));
  }

  @Patch(":id/reopen")
  @RequirePermissions("issues.resolve")
  reopen(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.issues.reopen(id, toScope(user));
  }

  @Post(":id/comments")
  @RequirePermissions("issues.comment")
  addComment(
    @Param("id") id: string,
    @Body() dto: AddCommentDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.issues.addComment(id, dto, toScope(user));
  }
}

@Controller("issue-categories")
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  /**
   * ⚠️ `issues.view` YETARLI, `issues.categories` EMAS: kategoriya
   * ro'yxati muammolar ro'yxatidagi FILTR uchun kerak va u hamma
   * ko'radigan narsa. Boshqarish esa alohida ruxsat talab qiladi.
   */
  @Get()
  @RequirePermissions("issues.view")
  list(@Query("activeOnly") activeOnly?: string) {
    return this.categories.list(activeOnly === "true");
  }

  @Post()
  @RequirePermissions("issues.categories")
  create(@Body() dto: CreateCategoryDto, @CurrentUser() user: RequestUser) {
    return this.categories.create(dto, user.id);
  }

  @Patch(":id")
  @RequirePermissions("issues.categories")
  update(
    @Param("id") id: string,
    @Body() dto: UpdateCategoryDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.categories.update(id, dto, user.id);
  }

  /** ⚠️ Qattiq o'chirish emas — `isActive: false`. */
  @Delete(":id")
  @RequirePermissions("issues.categories")
  deactivate(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.categories.deactivate(id, user.id);
  }
}
