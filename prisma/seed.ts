/**
 * BOSHLANG'ICH MA'LUMOT.
 *
 * ⚠️ IDEMPOTENT: qayta ishga tushirsa hech narsa buzilmaydi
 * (`upsert`). Seed'ni "bir marta ishlatiladi" deb yozish amalda
 * doim buziladi — deploy skripti uni har chiqarishda chaqiradi.
 *
 * ⚠️ `owner` FAQAT SHU YERDA yaratiladi, panel orqali emas
 * (`users.service.ts#create` uni rad etadi). Aks holda admin o'ziga
 * owner yasab, butun ruxsat tizimini aylanib o'tardi.
 *
 * ⚠️ DEMO TUMAN/MFY YARATILMAYDI. Ularni seed'ga qo'yish vasvasasi
 * bor ("tizim bo'sh ko'rinmasin"), lekin o'sha qatorlar ishlab
 * chiqarishga ham tushib, haqiqiy ma'lumot orasida chalkashlik
 * berardi. Faqat KATEGORIYALAR yaratiladi: ularsiz botdagi oqim
 * umuman BOSHLANMAYDI.
 */

import * as argon2 from "argon2";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** `auth.service.ts` dagi bilan AYNI parametrlar. */
const ARGON_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

/**
 * MFY MUROJAATLARINING ODATIY TOIFALARI.
 *
 * ⚠️ BU RO'YXAT HAQIQIY MUROJAATLARDAN: AI prompt'idagi misollar
 * bilan AYNI toifalar (`signal-ai.constants.ts`). Ikkisi mos
 * kelmasa, AI topgan signalni biriktirishda mos kategoriya
 * topilmasdi.
 */
const CATEGORIES = [
  { name: "Kommunal xizmatlar", color: "#2563eb", description: "Suv, gaz, elektr, isitish", sortOrder: 10, icon: "water", slaHours: 48, orgName: "Kommunal xizmat ko'rsatish bo'limi" },
  { name: "Yo'l va infratuzilma", color: "#ea580c", description: "Yo'l, chiroq, quduq, transport", sortOrder: 20, icon: "road", slaHours: 72, orgName: "Obodonlashtirish boshqarmasi" },
  { name: "Tozalik va ekologiya", color: "#16a34a", description: "Axlat, hovli, ko'kalamzorlashtirish", sortOrder: 30, icon: "trash", slaHours: 24, orgName: "Obodonlashtirish va chiqindi xizmatlari" },
  { name: "Ijtimoiy yordam", color: "#9333ea", description: "Nafaqa, moddiy yordam, ro'yxat", sortOrder: 40, icon: "social", slaHours: 120, orgName: "Ijtimoiy himoya bo'limi" },
  { name: "Xavfsizlik", color: "#dc2626", description: "Xavfli holat, tartib buzilishi", sortOrder: 50, icon: "shield", slaHours: 12, orgName: "Jamoat xavfsizligi bo'limi" },
  { name: "Xodim faoliyati", color: "#c2410c", description: "MFY xodimlari ishi haqida", sortOrder: 60, icon: "staff", slaHours: 72 },
  { name: "Hujjat va ma'lumotnoma", color: "#0891b2", description: "Rasmiy hujjat olish masalalari", sortOrder: 70, icon: "document", slaHours: 72 },
  { name: "Boshqa", color: "#64748b", description: "Yuqoridagilarga kirmaydigan murojaatlar", sortOrder: 100, icon: "more", slaHours: 72 },
];

async function main(): Promise<void> {
  // ── SOZLAMALAR ──────────────────────────────────────────────────
  await prisma.settings.upsert({
    where: { id: "singleton" },
    update: {},
    // Barcha qiymatlar schema'dagi `@default` dan.
    create: { id: "singleton" },
  });
  console.log("✓ Sozlamalar");

  // ── KATEGORIYALAR ───────────────────────────────────────────────
  for (const category of CATEGORIES) {
    await prisma.issueCategory.upsert({
      where: { name: category.name },
      // ⚠️ `update` BO'SH: mavjud kategoriyaning nomi/rangi panelda
      // o'zgartirilgan bo'lishi mumkin va seed uni qaytarib
      // yozmasligi kerak.
      update: {},
      create: category,
    });
  }
  console.log(`✓ ${CATEGORIES.length} kategoriya`);

  // ── TIZIM EGASI ─────────────────────────────────────────────────
  const username = (process.env.SEED_OWNER_USERNAME || "owner").trim().toLowerCase();
  const password = process.env.SEED_OWNER_PASSWORD || "owner123";

  const existing = await prisma.user.findUnique({ where: { username } });

  if (existing) {
    // ⚠️ PAROL QAYTA YOZILMAYDI: seed deploy'da har marta
    // chaqiriladi va parolni tiklab yuborsa, almashtirilgan parol
    // jimgina `.env` dagi standart qiymatga qaytardi.
    console.log(`✓ Tizim egasi mavjud: ${username} (parol o'zgartirilmadi)`);
  } else {
    await prisma.user.create({
      data: {
        username,
        passwordHash: await argon2.hash(password, ARGON_OPTIONS),
        firstName: "Tizim",
        lastName: "Egasi",
        role: "owner",
        // ⚠️ Egada qamrov HAR DOIM viloyat: uni tumanga qamab
        // qo'yish mumkin emas (`scope.util.ts#isProvinceWide`
        // baribir o'tkazadi, lekin ma'lumot ham to'g'ri bo'lsin).
        scopeKind: "province",
        // ⚠️ `permissions` BO'SH: egada ular umuman O'QILMAYDI
        // (`PermissionsGuard` uni darhol o'tkazadi). Ro'yxat
        // to'ldirilsa, yangi ruxsat qo'shilganda egadan jimgina
        // olib qo'yilishi mumkin edi.
        permissions: [],
      },
    });
    console.log(`✓ Tizim egasi yaratildi: ${username} / ${password}`);
    console.log("  ⚠️ Birinchi kirgandan keyin parolni ALMASHTIRING");
  }
}

main()
  .catch((error) => {
    console.error("Seed xatosi:", error);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
