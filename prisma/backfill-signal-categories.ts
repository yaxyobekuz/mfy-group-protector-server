/**
 * YO'NALISHSIZ SIGNALLARGA YO'NALISH BIRIKTIRISH — BIR MARTALIK ISH.
 *
 * ⚠️ NIMA UCHUN KERAK: `group_signals.category_id` ustuni 2026-11-25
 * da qo'shilgan (`20261125090000_signal_category_and_retire_question`),
 * ya'ni undan OLDIN yozilgan signallarda yo'nalish BO'LISHI MUMKIN
 * EMAS edi — 3192 yozuv. Ularsiz "qaysi yo'nalishda muammo ko'p"
 * degan hisobot yarim bo'sh qoladi.
 *
 * ⚠️ TIRIK TAHLILDAN FARQI: bu skript SIGNAL MATNINI o'qiydi (guruh
 * suhbatini emas) va FAQAT yo'nalishni tanlaydi. Signal yaratmaydi,
 * o'chirmaydi, jiddiylikni o'zgartirmaydi.
 *
 * ⚠️ YO'NALISHNI RAQAM BILAN SO'RAYDI, cuid BILAN EMAS. Model
 * 25 belgili `cmwdi6xln0009nqofidckpiuy` ni xato ko'chirishi mumkin
 * (tirik oqimda to'ldirish 88–95%, ya'ni har 10 signaldan biri
 * yo'nalishsiz qolardi). Shuning uchun ro'yxat `K1..Kn` deb
 * beriladi va javob shu kalit bilan qaytadi — xato ko'chirish
 * imkoniyati YO'Q. Ayni mantiq signalning o'ziga ham qo'llanadi:
 * `1..20` tartib raqami, `id` emas.
 *
 * ⚠️ "MOS KELMADI" HOLATI JIM TASHLANMAYDI: model `kat: "YOQ"` va
 * qisqa `taklif` qaytaradi. Takliflar yig'ilib, oxirida sanab
 * beriladi — yangi yo'nalish ochish ODAM qaroriga qoladi, chunki
 * yo'nalish bot va ilovada FUQAROGA tugma bo'lib ko'rinadi
 * (`schema.prisma` → "yo'nalishlar ilovaga alohida ochilmaydi").
 *
 * Ishlatish:
 *   npx tsx prisma/backfill-signal-categories.ts          # quruq
 *   npx tsx prisma/backfill-signal-categories.ts --yoz    # yozadi
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { PrismaClient } from "@prisma/client";
import OpenAI from "openai";

/**
 * ⚠️ `.env` QO'LDA O'QILADI. Bu skript Nest konteksti TASHQARISIDA
 * ishlaydi, ya'ni `env.config.ts` ishlamaydi; `tsx` ham `.env` ni
 * o'zi yuklamaydi. Qobiqda `. .env` qilish esa qiymat ichidagi
 * qo'shtirnoq va `#` da buzilardi.
 */
function envdan(kalit: string): string | undefined {
  const matn = readFileSync(resolve(__dirname, "..", ".env"), "utf8");
  for (const qator of matn.split("\n")) {
    if (!qator.includes("=") || qator.trimStart().startsWith("#")) continue;
    const i = qator.indexOf("=");
    if (qator.slice(0, i).trim() !== kalit) continue;
    return qator.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  return undefined;
}

const MODEL = "qwen3.5:122b";
/** Bitta so'rovga beriladigan signal — tirik oqimdagi 15 bilan ayni mulohaza. */
const BATCH = 20;
const TIMEOUT_MS = 60_000;

const prisma = new PrismaClient();

const client = new OpenAI({
  apiKey: process.env.AI_API_KEY ?? envdan("AI_API_KEY"),
  baseURL: process.env.AI_BASE_URL ?? envdan("AI_BASE_URL"),
});

interface Kat {
  kalit: string;
  id: string;
  label: string;
}

/**
 * ⚠️ TAVSIF HAM YUBORILADI — VA BUNI O'TKAZIB YUBORISH QIMMAT
 * BO'LDI. Birinchi ishlashda faqat nom berilgan edi va model
 * o'zbekcha "svet" (UYDAGI elektr) ni "Ko'cha yoritish tizimi" ga
 * tashlab yubordi: o'sha yo'nalishga tushgan 215 signaldan FAQAT 9
 * tasi haqiqatan chiroq haqida edi. Tirik oqim (`buildUserText`)
 * tavsifni BERADI — shuning uchun uning aniqligi yuqoriroq
 * bo'lgan.
 */
function label(c: {
  name: string;
  description: string | null;
  parent: { name: string } | null;
}): string {
  const nom = c.parent ? `${c.parent.name} → ${c.name}` : c.name;
  return c.description ? `${nom} (${c.description})` : nom;
}

const SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          n: { type: "integer" },
          kat: { type: "string" },
          taklif: { type: "string" },
        },
        required: ["n", "kat", "taklif"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
} as const;

function tizimPrompti(kats: Kat[]): string {
  return [
    "Sen E Murojaat tizimining yordamchisisan.",
    "Senga mahalla (MFY) guruhidan olingan SHIKOYAT matnlari beriladi.",
    "Vazifang — har biriga eng mos YO'NALISHni tanlash.",
    "",
    "YO'NALISHLAR:",
    ...kats.map((k) => `${k.kalit} = ${k.label}`),
    "",
    "QOIDALAR:",
    "- Har bir xabar uchun BITTA yo'nalish kaliti qaytar (K1, K2, ...).",
    "- Kalitni AYNAN ro'yxatdan ol — o'zingdan kalit o'ylab topma.",
    "- Kichik yo'nalish bo'lsa ANIQROG'INI tanla: \"Kommunal xizmatlar\"",
    "  emas, \"Kommunal xizmatlar → Elektr energiyasi\".",
    "- Mazmunan HECH QAYSI yo'nalishga tushmasa: kat=\"YOQ\" deb yoz va",
    "  \"taklif\" ga 2-4 so'zli yo'nalish nomini yoz (masalan \"Uy-joy",
    "  va ta'mirlash\"). Faqat shu holatda taklif yoziladi.",
    "- \"Boshqa\" yo'nalishini FAQAT mavzu haqiqatan tarqoq bo'lsa tanla.",
    "  Aniq mavzusi bor xabarni \"Boshqa\" ga tashlama.",
    // ⚠️ ALOHIDA AYTILADI: tavsif o'zi yetmagan. "svet" — o'zbekcha
    // SO'ZLASHUV shakli va u UYDAGI elektrni bildiradi; model esa
    // uni "yoritish" deb o'qib, ko'cha chiroqlariga tashlardi
    // (215 signaldan 206 tasi xato).
    "- MUHIM: \"svet\", \"свет\", \"сивет\", \"тук\", \"фаза\" — UYDAGI yoki",
    "  mahalladagi ELEKTR ta'minoti. \"Svet o'chdi\", \"svet yo'q\" —",
    "  elektr energiyasi yo'nalishi.",
    "  Ko'cha yoritishi esa FAQAT ko'chadagi chiroq/fonar haqida:",
    "  \"ko'chada chiroq yonmaydi\", \"ustun buzuq\", \"ko'cha qorong'i\".",
    "- Har bir xabarga javob ber, birortasini qoldirma.",
    "",
    'Javob FAQAT shu JSON: {"items":[{"n":1,"kat":"K2","taklif":""}]}',
  ].join("\n");
}

async function main(): Promise<void> {
  const yoz = process.argv.includes("--yoz");

  const cats = await prisma.issueCategory.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      name: true,
      description: true,
      parent: { select: { name: true } },
    },
  });

  const kats: Kat[] = cats.map((c, i) => ({
    kalit: `K${i + 1}`,
    id: c.id,
    label: label(c),
  }));
  const kalitdan = new Map(kats.map((k) => [k.kalit.toUpperCase(), k.id]));

  /**
   * ⚠️ `--qayta "<yo'nalish nomi>"` — XATO TASNIFLANGANNI TUZATISH
   * UCHUN. Standart holda faqat yo'nalishsizlari olinadi, lekin bir
   * marta xato tasniflangan to'plamni ("svet" ni ko'cha yoritishiga
   * tashlab yuborgan 215 signalni) qayta ko'rish kerak bo'ldi.
   * Yo'nalishni qo'lda tozalab, skriptni qaytadan yurgizish o'sha
   * signallarni bir muddat "yo'nalishsiz" qoldirardi — hisobotda esa
   * bu "AI aniqlay olmadi" bo'lib ko'rinardi.
   */
  const qaytaIndex = process.argv.indexOf("--qayta");
  const qaytaNomi = qaytaIndex > -1 ? process.argv[qaytaIndex + 1] : undefined;

  const signals = await prisma.groupSignal.findMany({
    where: qaytaNomi ? { category: { name: qaytaNomi } } : { categoryId: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, summary: true },
  });

  if (qaytaNomi) console.log(`QAYTA TASNIFLASH    : "${qaytaNomi}"`);
  console.log(`ko'riladigan signal : ${signals.length}`);
  console.log(`yo'nalish (faol)    : ${kats.length}`);
  console.log(`rejim               : ${yoz ? "YOZADI" : "quruq (hech narsa yozilmaydi)"}\n`);

  const system = tizimPrompti(kats);
  let belgilandi = 0;
  let mosKelmadi = 0;
  let xatoBatch = 0;
  const takliflar = new Map<string, number>();
  const kesim = new Map<string, number>();

  for (let i = 0; i < signals.length; i += BATCH) {
    const batch = signals.slice(i, i + BATCH);
    const user = batch
      .map((s, j) => `${j + 1}) ${s.summary.replace(/\s+/g, " ").slice(0, 280)}`)
      .join("\n");

    let content: string | null | undefined;
    try {
      const res = await client.chat.completions.create(
        {
          model: MODEL,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          response_format: {
            type: "json_schema",
            json_schema: { name: "kesim", schema: SCHEMA },
          },
          max_tokens: 4000,
        },
        { timeout: TIMEOUT_MS, maxRetries: 1 },
      );
      if (res.choices[0]?.finish_reason === "length") throw new Error("javob kesildi");
      content = res.choices[0]?.message?.content;
    } catch (error) {
      xatoBatch += 1;
      console.log(`  ! ${i}-${i + batch.length}: ${(error as Error).message}`);
      continue;
    }

    if (!content) { xatoBatch += 1; continue; }

    let items: { n?: unknown; kat?: unknown; taklif?: unknown }[];
    try {
      const parsed = JSON.parse(content) as { items?: unknown };
      items = Array.isArray(parsed.items) ? (parsed.items as typeof items) : [];
    } catch {
      xatoBatch += 1;
      console.log(`  ! ${i}: JSON emas`);
      continue;
    }

    for (const it of items) {
      const n = Number(it.n);
      const source = batch[n - 1];
      if (!source) continue;

      const kat = String(it.kat ?? "").trim().toUpperCase();
      const id = kalitdan.get(kat);

      if (!id) {
        mosKelmadi += 1;
        const t = String(it.taklif ?? "").trim();
        if (t) takliflar.set(t, (takliflar.get(t) ?? 0) + 1);
        continue;
      }

      kesim.set(id, (kesim.get(id) ?? 0) + 1);
      belgilandi += 1;

      if (yoz) {
        await prisma.groupSignal
          .update({ where: { id: source.id }, data: { categoryId: id } })
          .catch(() => undefined);
      }
    }

    if ((i / BATCH) % 10 === 0) {
      process.stdout.write(
        `  ${i + batch.length}/${signals.length} — belgilandi ${belgilandi}, mos kelmadi ${mosKelmadi}\n`,
      );
    }
  }

  console.log(`\n=== NATIJA ===`);
  console.log(`belgilandi     : ${belgilandi}`);
  console.log(`mos kelmadi    : ${mosKelmadi}`);
  console.log(`yiqilgan to'plam: ${xatoBatch}`);

  const nomlar = new Map(kats.map((k) => [k.id, k.label]));
  console.log(`\n=== YO'NALISH KESIMI ===`);
  for (const [id, n] of [...kesim].sort((a, b) => b[1] - a[1])) {
    console.log(`${String(n).padStart(5)}  ${nomlar.get(id)}`);
  }

  if (takliflar.size > 0) {
    console.log(`\n=== YANGI YO'NALISH TAKLIFLARI (odam qaroriga) ===`);
    for (const [t, n] of [...takliflar].sort((a, b) => b[1] - a[1]).slice(0, 25)) {
      console.log(`${String(n).padStart(5)}  ${t}`);
    }
  }

  await prisma.$disconnect();
}

void main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
