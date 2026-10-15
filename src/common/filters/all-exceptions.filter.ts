/**
 * XATO JAVOBI — YAGONA SHAKL.
 *
 * Panel har xatoni bir xil o'qiydi:
 *
 *     { statusCode, message, errors?, path, timestamp }
 *
 * ⚠️ KUTILMAGAN XATO MATNI TASHQARIGA CHIQMAYDI. Prisma xatosi ustun
 * va jadval nomlarini, stack esa fayl yo'llarini oshkor qiladi.
 * Shuning uchun 500 holatida panelga umumiy matn ketadi, HAQIQIY
 * sabab esa LOGGA — ikkalasi bitta `requestId` bilan bog'lanadi.
 */

import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";

interface ErrorBody {
  statusCode: number;
  message: string;
  /** Maydon bo'yicha xatolar (validatsiya) — panel formada ko'rsatadi. */
  errors?: Record<string, string[]>;
  path: string;
  timestamp: string;
  /** Faqat 500 da: log bilan bog'lash uchun. */
  requestId?: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger("Exception");

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const body = this.buildBody(exception, request);

    if (body.statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `[${body.requestId}] ${request.method} ${request.url} — ${(exception as Error)?.message}`,
        (exception as Error)?.stack,
      );
    }

    response.status(body.statusCode).json(body);
  }

  private buildBody(exception: unknown, request: Request): ErrorBody {
    const base = {
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();

      // `ValidationPipe` obyekt qaytaradi: { message: string[] | string }
      if (typeof payload === "object" && payload !== null) {
        const record = payload as { message?: unknown; errors?: unknown };

        if (Array.isArray(record.message)) {
          return {
            ...base,
            statusCode: status,
            message: "Kiritilgan ma'lumot yaroqsiz",
            errors: this.groupMessages(record.message as string[]),
          };
        }

        return {
          ...base,
          statusCode: status,
          message:
            typeof record.message === "string" ? record.message : exception.message,
          errors: (record.errors as Record<string, string[]>) ?? undefined,
        };
      }

      return { ...base, statusCode: status, message: exception.message };
    }

    // ── PRISMA ──────────────────────────────────────────────────────
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const mapped = this.mapPrisma(exception);
      if (mapped) return { ...base, ...mapped };
    }

    // ⚠️ QOLGANI — 500 va HAQIQIY SABAB AYTILMAYDI (fayl yo'llari,
    // ustun nomlari). Log bilan bog'lash uchun `requestId` beriladi.
    return {
      ...base,
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: "Serverda kutilmagan xato",
      requestId: randomUUID(),
    };
  }

  /**
   * ⚠️ FAQAT TANIB OLINGAN KODLAR tarjima qilinadi. Qolganlari 500
   * bo'lib ketadi va bu TO'G'RI: tanimagan Prisma xatosining matnini
   * tashqariga chiqarish schema'ni oshkor qilardi.
   */
  private mapPrisma(
    error: Prisma.PrismaClientKnownRequestError,
  ): { statusCode: number; message: string } | null {
    switch (error.code) {
      case "P2002": {
        const target = (error.meta?.target as string[] | undefined)?.join(", ");
        return {
          statusCode: HttpStatus.CONFLICT,
          message: target
            ? `Bu qiymat allaqachon mavjud: ${target}`
            : "Bu qiymat allaqachon mavjud",
        };
      }
      case "P2003":
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          message: "Bog'lanish yaroqsiz: ko'rsatilgan yozuv topilmadi",
        };
      case "P2025":
        return { statusCode: HttpStatus.NOT_FOUND, message: "Yozuv topilmadi" };
      // P2014 — bog'liq yozuvlar bor, o'chirish mumkin emas.
      case "P2014":
        return {
          statusCode: HttpStatus.CONFLICT,
          message: "Bu yozuvga bog'liq ma'lumotlar bor — o'chirib bo'lmaydi",
        };
      default:
        return null;
    }
  }

  /** "field must be..." → { field: ["..."] } */
  private groupMessages(messages: string[]): Record<string, string[]> {
    const grouped: Record<string, string[]> = {};

    for (const message of messages) {
      const field = message.split(" ")[0] ?? "_";
      (grouped[field] ??= []).push(message);
    }

    return grouped;
  }
}
