/**
 * PRISMA — bitta client, butun tizim uchun.
 *
 * ⚠️ study-tracker'dagi Proxy + AsyncLocalStorage qatlami BU YERDA
 * YO'Q va kerak emas. U yerda har filial O'Z PostgreSQL schema'sida
 * yashaydi, shuning uchun client joriy filialga qarab tanlanadi. Bu
 * yerda baza BITTA: hududiy ajratish ma'lumot darajasida (FK +
 * `scope.util.ts`), ulanish darajasida emas.
 *
 * ⚠️ NIMA UCHUN SHUNDAY SODDA: viloyat shtabi — bitta tashkilot.
 * Multi-tenant qatlami qo'shilsa, u darhol har so'rovga tushadigan,
 * lekin hech qachon ikkinchi tenantga ega bo'lmaydigan murakkablik
 * bo'lib qolardi.
 */

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";

import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      // ⚠️ FAQAT XATOLAR. `query` logi ishlab chiqarishda har so'rovni
      // yozib, log hajmini portlatardi va u yerdan hech narsa
      // topilmasdi.
      log: [{ emit: "stdout", level: "error" }],
    });
  }

  async onModuleInit(): Promise<void> {
    // ⚠️ STARTUP'DA ULANAMIZ: ulanish xatosi shu yerda chiqsin,
    // birinchi so'rovda emas. Aks holda server "ishlayapti" deb
    // turib, har so'rovga 500 qaytarardi.
    await this.$connect();
    this.logger.log("PostgreSQL ulandi");
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
