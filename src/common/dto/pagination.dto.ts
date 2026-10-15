/**
 * SAHIFALASH — barcha ro'yxat endpoint'lari uchun bitta shakl.
 *
 * ⚠️ CHEGARA MAJBURIY VA YUQORIDAN QULFLANGAN (`MAX_LIMIT`). Mijoz
 * `limit=100000` yuborsa, so'rov butun jadvalni xotiraga tortib,
 * javobni ham o'zini ham yiqitardi. Bu chegara mijozning iltimosi
 * emas, serverning qarori.
 */

import { Type } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";

export const MAX_LIMIT = 200;
export const DEFAULT_LIMIT = 50;

export class PaginationQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "page butun son bo'lishi kerak" })
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "limit butun son bo'lishi kerak" })
  @Min(1)
  @Max(MAX_LIMIT, { message: `limit ${MAX_LIMIT} dan oshmasligi kerak` })
  limit: number = DEFAULT_LIMIT;

  get skip(): number {
    return (this.page - 1) * this.limit;
  }
}

/** Ro'yxat javobining yagona shakli. */
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  /** Panel "keyingi" tugmasini shundan hal qiladi. */
  hasMore: boolean;
}

export const paginate = <T>(
  items: T[],
  total: number,
  query: PaginationQuery,
): Paginated<T> => ({
  items,
  total,
  page: query.page,
  limit: query.limit,
  hasMore: query.skip + items.length < total,
});
