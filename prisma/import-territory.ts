/**
 * HUDUD IMPORTI — tuman/shahar va MFY ro'yxatini JSON dan bazaga.
 *
 * ⚠️ BU `seed.ts` EMAS va ataylab: seed deploy'ning HAR chiqarishida
 * chaqiriladi va u yerda hududiy ma'lumot bo'lmasligi kerak
 * (`seed.ts` sarlavhasidagi izohga qarang). Hudud BIR MARTA, QO'LDA
 * kiritiladi — shuning uchun alohida buyruq:
 *
 *     npm run db:import:territory [fayl.json]
 *
 * ⚠️ IDEMPOTENT: qayta ishga tushirsa yangi qator qo'shilmaydi
 * (`upsert` + `code`). MAVJUD QATOR TEGILMAYDI (`update: {}`):
 * panelda tuzatilgan nom, rais, aholi soni va tartib raqami importdan
 * keyin ham o'z joyida qoladi. Ya'ni bu skript faqat YETISHMAGANINI
 * qo'shadi.
 *
 * ⚠️ MFY KODIGA TUMAN KODI QO'SHILADI: `Mahalla.code` butun baza
 * bo'ylab `@unique`, "Navbahor" nomli MFY esa 16 tumanning yarmida
 * bor. Prefiksasiz ikkinchisi birinchisining ustiga yozilardi.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** Standart manba — repo ildizidagi fayl. */
const DEFAULT_FILE = path.join(__dirname, "..", "andijon-tumanlar-mfylar.json");

/**
 * Viloyat nomi. ⚠️ VILOYAT JADVALI YO'Q (schema'dagi izoh): tizim
 * bitta viloyat uchun ishlaydi va uning nomi `Settings.orgName` da.
 * Shu sababli viloyat "import qilinadigan" yagona joy — shu maydon.
 *
 * ⚠️ FAQAT STANDART QIYMAT USTIGA yoziladi: nom panelda
 * o'zgartirilgan bo'lsa, import uni qaytarib tashlamaydi.
 */
const PROVINCE_NAME = "Andijon viloyati";
const PROVINCE_DEFAULT = "E Murojaat";

interface DistrictInput {
  tuman: string;
  mfylar: string[];
}

/**
 * NOMDAN KOD. `territory.service.ts#normalizeCode` bilan AYNI
 * natijani berishi kerak (kichik harf, `[a-z0-9-]`), aks holda
 * panelda tahrirlangan kod import kodidan farq qilib, bitta MFY ikki
 * marta tushardi.
 *
 * ⚠️ `ʻ` (U+02BB) va `ʼ` (U+02BC) OLIB TASHLANADI, defisga
 * almashtirilmaydi: "Boʻston" → `boston`, "bo-ston" emas.
 */
function toCode(name: string): string {
  return name
    .replace(/[ʻʼ‘’']/g, "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function readInput(file: string): DistrictInput[] {
  if (!fs.existsSync(file)) {
    throw new Error(`Fayl topilmadi: ${file}`);
  }

  const parsed: unknown = JSON.parse(fs.readFileSync(file, "utf8"));

  if (!Array.isArray(parsed)) {
    throw new Error("JSON ildizi massiv bo'lishi kerak");
  }

  return parsed.map((row, index) => {
    const item = row as Partial<DistrictInput>;

    if (typeof item.tuman !== "string" || !item.tuman.trim()) {
      throw new Error(`[${index}] "tuman" bo'sh`);
    }
    if (!Array.isArray(item.mfylar)) {
      throw new Error(`[${index}] "mfylar" massiv emas`);
    }

    return { tuman: item.tuman.trim(), mfylar: item.mfylar.map((m) => String(m).trim()).filter(Boolean) };
  });
}

async function main(): Promise<void> {
  const file = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_FILE;
  const districts = readInput(file);

  console.log(`Manba: ${file}`);
  console.log(`${districts.length} tuman, ${districts.reduce((sum, d) => sum + d.mfylar.length, 0)} MFY\n`);

  // ── KODLARNI OLDINDAN TEKSHIRISH ────────────────────────────────
  //
  // ⚠️ YOZISHDAN OLDIN: ikki xil nom bitta kodga tushsa
  // ("Oʻzbekiston" va "Ozbekiston"), import yarmida `@unique`
  // xatosiga uchrab, bazani YARIM to'ldirilgan holda qoldirardi.
  const seen = new Map<string, string>();

  for (const district of districts) {
    const districtCode = toCode(district.tuman);

    if (!districtCode) {
      throw new Error(`Tuman nomidan kod chiqmadi: "${district.tuman}"`);
    }

    for (const mahalla of district.mfylar) {
      const mahallaCode = `${districtCode}-${toCode(mahalla)}`;

      if (toCode(mahalla) === "") {
        throw new Error(`MFY nomidan kod chiqmadi: "${mahalla}" (${district.tuman})`);
      }
      if (mahallaCode.length > 50) {
        throw new Error(`Kod 50 belgidan uzun: ${mahallaCode}`);
      }

      const previous = seen.get(mahallaCode);
      if (previous) {
        throw new Error(`Kod takrorlandi: "${mahalla}" va "${previous}" → ${mahallaCode}`);
      }
      seen.set(mahallaCode, `${district.tuman} / ${mahalla}`);
    }
  }

  // ── VILOYAT ─────────────────────────────────────────────────────
  const settings = await prisma.settings.findUnique({ where: { id: "singleton" } });

  if (!settings) {
    console.log("⚠️ Sozlamalar yo'q — avval `npm run db:seed` ishlatilsin, viloyat nomi qo'yilmadi");
  } else if (settings.orgName === PROVINCE_DEFAULT) {
    await prisma.settings.update({ where: { id: "singleton" }, data: { orgName: PROVINCE_NAME } });
    console.log(`✓ Viloyat: ${PROVINCE_NAME} (Settings.orgName)`);
  } else {
    console.log(`✓ Viloyat allaqachon qo'yilgan: ${settings.orgName} (o'zgartirilmadi)`);
  }

  // ── TUMAN → MFY ─────────────────────────────────────────────────
  let districtsCreated = 0;
  let mahallasCreated = 0;
  let mahallasExisting = 0;

  for (const [index, input] of districts.entries()) {
    const code = toCode(input.tuman);

    // ⚠️ TARTIB — FAYLDAGI TARTIB, `sortOrder` ni 10 ga ko'paytirib:
    // keyinchalik oraga yangi tuman qo'yish uchun joy qoladi
    // (11..19), hammasini qayta raqamlash kerak bo'lmaydi.
    const sortOrder = (index + 1) * 10;

    const existing = await prisma.district.findUnique({ where: { code }, select: { id: true } });

    const district = existing
      ? existing
      : await prisma.district.create({
          data: { code, name: input.tuman, sortOrder },
          select: { id: true },
        });

    if (!existing) districtsCreated += 1;

    // ⚠️ `createMany` + `skipDuplicates`: 878 MFY ni bittalab
    // `upsert` qilish 1756 so'rov bo'lardi. `skipDuplicates`
    // mavjud qatorni TEGMAY o'tkazib yuboradi — importning
    // "faqat yetishmaganini qo'sh" qoidasi shu.
    const result = await prisma.mahalla.createMany({
      data: input.mfylar.map((name, position) => ({
        districtId: district.id,
        code: `${code}-${toCode(name)}`,
        name,
        sortOrder: (position + 1) * 10,
      })),
      skipDuplicates: true,
    });

    mahallasCreated += result.count;
    mahallasExisting += input.mfylar.length - result.count;

    console.log(
      `${existing ? "·" : "+"} ${input.tuman.padEnd(20)} ${String(result.count).padStart(3)} yangi MFY` +
        (input.mfylar.length - result.count > 0 ? `, ${input.mfylar.length - result.count} mavjud` : ""),
    );
  }

  console.log(
    `\n✓ Tuman: ${districtsCreated} yangi, ${districts.length - districtsCreated} mavjud` +
      `\n✓ MFY:   ${mahallasCreated} yangi, ${mahallasExisting} mavjud`,
  );
}

main()
  .catch((error: unknown) => {
    console.error("Import xatosi:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
