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
  { name: "Kommunal xizmatlar", color: "#2563eb", description: "Suv, gaz, elektr, isitish", sortOrder: 10, icon: "water", slaHours: 48 },
  { name: "Yo'l va infratuzilma", color: "#ea580c", description: "Yo'l, chiroq, quduq, transport", sortOrder: 20, icon: "road", slaHours: 72 },
  { name: "Tozalik va ekologiya", color: "#16a34a", description: "Axlat, hovli, ko'kalamzorlashtirish", sortOrder: 30, icon: "trash", slaHours: 24 },
  { name: "Ijtimoiy yordam", color: "#9333ea", description: "Nafaqa, moddiy yordam, ro'yxat", sortOrder: 40, icon: "social", slaHours: 120 },
  { name: "Xavfsizlik", color: "#dc2626", description: "Xavfli holat, tartib buzilishi", sortOrder: 50, icon: "shield", slaHours: 12 },
  { name: "Xodim faoliyati", color: "#c2410c", description: "MFY xodimlari ishi haqida", sortOrder: 60, icon: "staff", slaHours: 72 },
  { name: "Hujjat va ma'lumotnoma", color: "#0891b2", description: "Rasmiy hujjat olish masalalari", sortOrder: 70, icon: "document", slaHours: 72 },
  { name: "Boshqa", color: "#64748b", description: "Yuqoridagilarga kirmaydigan murojaatlar", sortOrder: 100, icon: "more", slaHours: 72 },
];

/**
 * KICHIK YO'NALISHLAR — ASOSIY YO'NALISH ICHIDA.
 *
 * ── NIMA UCHUN BO'LINDI ──────────────────────────────────
 *
 * ⚠️ "KOMMUNAL XIZMATLAR" DEGAN UYUM HECH NARSA AYTMAYDI. Hisobotda
 * 400 ta murojaat bitta qatorda turganda "qaysi xizmat buzuq" degan
 * savol javobsiz qolardi — va aynan shu savol ma'muriyatga kerak.
 * Ichimlik suvi bilan issiqlik ta'minoti ikki boshqa tashkilot va
 * ikki boshqa muddat.
 *
 * ⚠️ IKKINCHI RO'YXAT OCHILMADI, SHU RO'YXAT CHUQURLASHTIRILDI:
 * "Yo'nalishlar ilovaga alohida ochilmaydi" doktrinasi kuchda — bot,
 * ilova va AI AYNI jadvalni o'qiydi.
 *
 * ⚠️ ASOSIY YO'NALISH O'CHIRILMAYDI va qayta nomlanmaydi: unga
 * bog'langan ESKI murojaatlar bor va ular o'z yo'nalishini saqlashi
 * kerak (`Issue.categoryId` — muhrlangan qiymat). Yangi murojaatlar
 * esa endi kichik yo'nalishga tushadi.
 *
 * ⚠️ SLA KICHIK YO'NALISHDA ANIQROQ: gaz hidi bilan chiqindi
 * bitta muddatga sig'maydi.
 */
const SUBCATEGORIES: {
  parent: string;
  items: { name: string; description: string; icon: string; slaHours: number; sortOrder: number }[];
}[] = [
  {
    parent: "Kommunal xizmatlar",
    items: [
      { name: "Elektr energiyasi", description: "Uzilish, kuchlanish, hisoblagich", icon: "water", slaHours: 24, sortOrder: 11 },
      { name: "Tabiiy gaz", description: "Gaz yo'q, bosim past, gaz hidi", icon: "water", slaHours: 12, sortOrder: 12 },
      { name: "Ichimlik suvi", description: "Suv yo'q, bosim past, sifati", icon: "water", slaHours: 24, sortOrder: 13 },
      { name: "Kanalizatsiya", description: "Toshib ketish, tiqilish, hid", icon: "water", slaHours: 24, sortOrder: 14 },
      { name: "Issiqlik ta'minoti", description: "Isitish yo'q, radiator sovuq", icon: "water", slaHours: 24, sortOrder: 15 },
      { name: "Chiqindilar", description: "Chiqindi olinmagan, konteyner yo'q", icon: "trash", slaHours: 48, sortOrder: 16 },
    ],
  },
  {
    // ⚠️ MIJOZ NOMI — "Ijtimoiy sohalar": bu bo'lim endi faqat
    // moddiy yordam emas, ta'lim va sog'liqni ham o'z ichiga oladi.
    parent: "Ijtimoiy yordam",
    items: [
      { name: "Ta'lim", description: "Maktab, bog'cha, o'qituvchi masalalari", icon: "social", slaHours: 120, sortOrder: 41 },
      { name: "Sog'liqni saqlash", description: "Poliklinika, dori, shifokor", icon: "social", slaHours: 72, sortOrder: 42 },
      { name: "Ijtimoiy himoya", description: "Nafaqa, moddiy yordam, ro'yxat", icon: "social", slaHours: 120, sortOrder: 43 },
      { name: "Bandlik", description: "Ish o'rni, kasb o'rgatish", icon: "social", slaHours: 168, sortOrder: 44 },
    ],
  },
  {
    parent: "Yo'l va infratuzilma",
    items: [
      { name: "Avtomobil yo'llari", description: "O'ra, asfalt, yo'l qoplamasi", icon: "road", slaHours: 168, sortOrder: 21 },
      { name: "Ko'cha yoritish tizimi", description: "Chiroq yonmaydi, ustun buzuq", icon: "road", slaHours: 72, sortOrder: 22 },
      { name: "Obodonlashtirish", description: "Hovli, skver, o'rindiq, maydoncha", icon: "road", slaHours: 168, sortOrder: 23 },
      { name: "Jamoat transporti", description: "Marshrut, bekat, qatnov", icon: "road", slaHours: 120, sortOrder: 24 },
    ],
  },
];

/**
 * TASHQI TAHDID RO'YXATLARI — STANDART MANBALAR.
 *
 * ⚠️ HAMMASI BEPUL VA OCHIQ: ro'yxatga kalit talab qiladigan
 * manba qo'shilmadi — u `.env` ga yana bitta sir qo'shib, deploy
 * paytida unutilardi va ro'yxat jimgina bo'sh qolardi.
 *
 * ⚠️ URLhaus VA OpenPhish — "TIRIK" MANBALAR: ular soatlab
 * yangilanadi va aynan FISHING/zararli havolalarni beradi. AdGuard
 * esa kengroq (reklama ham), shuning uchun u STANDART HOLDA
 * O'CHIRILGAN: reklama domenini o'chirish aholining oddiy xabarini
 * yo'q qilishi mumkin va bu qaror ma'muriyatniki.
 *
 * ⚠️ PhishTank ENDI KALIT TALAB QILADI (2024-yildan) — shuning
 * uchun ro'yxatda yo'q. O'rniga OpenPhish ning bepul ro'yxati.
 */
const THREAT_FEEDS: {
  name: string;
  url: string;
  format: "hosts" | "domains" | "adguard" | "urlhaus";
  isEnabled: boolean;
}[] = [
  {
    // ⚠️ abuse.ch TO'G'RIDAN-TO'G'RI YUKLASHNI YOPDI (HTTP 410) —
    // endi u Auth-Key talab qiladi. Kalitli manba `.env` ga yana
    // bitta sir qo'shib, deploy paytida unutilardi va ro'yxat
    // jimgina bo'sh qolardi. Shuning uchun o'sha ma'lumotning
    // BEPUL KO'ZGUSI olinadi (malware-filter, 12 soatda yangilanadi).
    name: "URLhaus (malware-filter ko'zgusi)",
    url: "https://malware-filter.gitlab.io/malware-filter/urlhaus-filter-hosts.txt",
    format: "hosts",
    isEnabled: true,
  },
  {
    // ⚠️ MIJOZ AYTGAN "GitHub dagi fishing ro'yxatlari" — shu:
    // har kuni yangilanadigan, FAOL fishing domenlari.
    name: "Phishing.Database (GitHub, faol)",
    url: "https://raw.githubusercontent.com/mitchellkrogza/Phishing.Database/master/phishing-domains-ACTIVE.txt",
    format: "domains",
    isEnabled: true,
  },
  {
    name: "OpenPhish",
    url: "https://openphish.com/feed.txt",
    format: "urlhaus",
    isEnabled: true,
  },
  {
    name: "Phishing Army (blocklist)",
    url: "https://phishing.army/download/phishing_army_blocklist_extended.txt",
    format: "domains",
    isEnabled: true,
  },
  {
    name: "AdGuard DNS filter",
    url: "https://adguardteam.github.io/AdGuardSDNSFilter/Filters/filter.txt",
    format: "adguard",
    // ⚠️ STANDART HOLDA O'CHIRILGAN — yuqoridagi izoh.
    isEnabled: false,
  },
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
  console.log(`✓ ${CATEGORIES.length} asosiy yo'nalish`);

  // ── KICHIK YO'NALISHLAR ────────────────────────────────
  //
  // ⚠️ OTA TOPILMASA O'TKAZIB YUBORILADI, XATO OTILMAYDI: ma'muriyat
  // asosiy yo'nalishni panelda qayta nomlagan bo'lishi mumkin va seed
  // butun deploy'ni to'xtatmasligi kerak.
  let subCount = 0;

  for (const group of SUBCATEGORIES) {
    const parent = await prisma.issueCategory.findUnique({
      where: { name: group.parent },
      select: { id: true, color: true },
    });

    if (!parent) {
      console.log(`⚠ "${group.parent}" topilmadi — kichik yo'nalishlar o'tkazildi`);
      continue;
    }

    for (const item of group.items) {
      await prisma.issueCategory.upsert({
        where: { name: item.name },
        // ⚠️ `update` FAQAT `parentId` NI TO'G'RILAYDI: nom, rang va
        // muddat panelda o'zgartirilgan bo'lishi mumkin va seed ularni
        // qaytarib yozmasligi kerak. Lekin daraxtdagi o'rni — tizim
        // qarori, qo'lda emas.
        update: { parentId: parent.id },
        create: {
          ...item,
          // ⚠️ RANG OTADAN OLINADI: xaritada va diagrammada bitta
          // asosiy yo'nalishning kichiklari bir rang oilasida
          // ko'rinishi kerak.
          color: parent.color,
          parentId: parent.id,
        },
      });
      subCount += 1;
    }
  }

  console.log(`✓ ${subCount} kichik yo'nalish`);

  // ── TASHQI TAHDID RO'YXATLARI ──────────────────────────
  //
  // ⚠️ `update` FAQAT MANZILNI TO'G'RILAYDI: manba manzili
  // o'zgarishi mumkin (abuse.ch bir necha marta ko'chirgan) va eski
  // manzil qolsa, ro'yxat JIMGINA yangilanmay qolardi. Yoqilgan/
  // o'chirilgan holati esa MA'MURIYAT qarori — unga tegilmaydi.
  for (const feed of THREAT_FEEDS) {
    await prisma.threatFeed.upsert({
      where: { name: feed.name },
      update: { url: feed.url, format: feed.format },
      create: feed,
    });
  }
  console.log(`✓ ${THREAT_FEEDS.length} tahdid ro'yxati`);

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
