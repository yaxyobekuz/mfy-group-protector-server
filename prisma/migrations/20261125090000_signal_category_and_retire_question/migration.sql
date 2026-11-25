-- SIGNALGA YO'NALISH QO'SHILADI VA "SAVOL" TOIFASI NAFAQAGA CHIQADI.
--
-- ⚠️ MUAMMO (tirik shikoyat, 2026-11-25): "juda oddiy signallarni ham
-- tutib olyabdi... birov savol bersa ham signal sifatida saqlab
-- olmoqda". Navbat salomlashuv, oddiy ma'lumot so'rash va bir qatorli
-- izohlar bilan to'lib ketgan edi — va to'lib ketgan ro'yxatda
-- operator HAMMASINI ko'rishni to'xtatadi, ya'ni ortiqcha signal
-- haqiqiy shikoyatni KO'MIB tashlaydi.
--
-- Bu migratsiya IKKI ISHNI qiladi va ikkisi BIRGA kerak:
--   1) `category_id` — "qaysi yo'nalishda muammo ko'p" degan savolga
--      javob beradigan kesim;
--   2) eski `question` yozuvlarini o'chiradi — navbatni tozalaydi.
--
-- Qoida o'zgarishining O'ZI koddadir: `signal-ai.constants.ts`
-- (`PRODUCIBLE_KINDS`, `SYSTEM_PROMPT`) va `signal-ai.service.ts`
-- (`normalizeSignal`). Bu fayl faqat BAZANI moslaydi.

-- ─────────────────────────────────────────────────────────────────────
--  1. AI TAXMIN QILGAN YO'NALISH
-- ─────────────────────────────────────────────────────────────────────
--
-- ⚠️ `issue_categories` GA ISHORA, alohida ro'yxat EMAS: bot ham,
-- ilova ham, AI ham AYNI jadvalni o'qiydi (schema doktrinasi). Signal
-- uchun alohida toifa ro'yxati ochilsa, "qaysi yo'nalishda muammo
-- ko'p" degan savolga IKKITA, bir-biriga to'g'ri kelmaydigan javob
-- chiqardi.
--
-- ⚠️ `NULL` RUXSAT ETILADI va standart qiymat QO'YILMAYDI. Ikki sabab:
--   - MAVJUD signallar yo'nalishsiz qoladi va ularni biror yo'nalishga
--     "taxmin" qilib yozib qo'yish hisobotni YOLG'ON to'ldirardi
--     ("Kommunal — 400 signal", aslida hech biri tekshirilmagan);
--   - model ro'yxatda yo'q id qaytargan holatda ham signal baribir
--     yoziladi (`normalizeSignal`) — shikoyatni yo'nalish taxmini
--     uchun yo'qotish eng yomon natija.
ALTER TABLE "group_signals" ADD COLUMN "category_id" TEXT;

-- ⚠️ `ON DELETE SET NULL`, `RESTRICT` EMAS (`issues` dan FARQLI):
-- taxminni yo'qotish arzon, lekin u yo'nalishni o'chirishni to'sib
-- turmasligi kerak. `issues.category_id` da teskari — u RASMIY FAKT
-- va uni yo'qotish hisobot tarixini buzardi.
--
-- ⚠️ `ON UPDATE CASCADE` — Prisma'ning standart xulqi; qo'lda
-- yozilmasa `prisma migrate diff` keyingi safar farq ko'rsatardi.
ALTER TABLE "group_signals"
  ADD CONSTRAINT "group_signals_category_id_fkey"
  FOREIGN KEY ("category_id") REFERENCES "issue_categories"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ⚠️ INDEKS `status` BILAN BIRGA: hisobotda ikkisi deyarli har doim
-- birga so'raladi ("ko'rilmagan signallar qaysi yo'nalishda").
-- Yolg'iz `category_id` indeksi `status` bo'yicha filtrda yordam
-- bermasdi.
CREATE INDEX "group_signals_category_id_status_idx"
  ON "group_signals"("category_id", "status");

-- ─────────────────────────────────────────────────────────────────────
--  2. "SAVOL" SIGNALLARI O'CHIRILADI
-- ─────────────────────────────────────────────────────────────────────
--
-- ⚠️ O'CHIRISH — MA'MURIYATNING ANIQ QARORI (2026-11-25). Odatda
-- e'tiborsiz qoldirilgan signal SAQLANADI ("AI nimani noto'g'ri
-- topganini ko'rish kerak" — `schema.prisma`), lekin bu yerda saqlash
-- ma'nosi YO'Q: xato bitta va u ALLAQACHON tushunilgan — toifaning
-- o'zi noto'g'ri edi. Yozuvlar esa navbatda turib, operatorni
-- chalg'itadi.
--
-- ⚠️ `attached` HOLATDAGILARI HAM O'CHADI va bu TO'G'RI: ulardan
-- yaratilgan `issues` O'Z JOYIDA QOLADI. Bog'lanish
-- `group_signals.issue_id` orqali va u signal tomonida — ya'ni
-- signalni o'chirish MUROJAATGA tegmaydi (`issues` da signalga FK
-- yo'q). Rasmiy navbat buzilmaydi, faqat "bu muammo signaldan
-- kelgan" degan iz yo'qoladi. Muammoning O'Z manbasi `source` va
-- `sourceMeta` da muhrlangan — u saqlanadi.
DELETE FROM "group_signals" WHERE "kind" = 'question';

-- ⚠️ `SignalKind` ENUM'IDAN `question` OLIB TASHLANMAYDI, garchi
-- yozuvlari qolmagan bo'lsa ham. Postgres'da enum qiymatini olib
-- tashlash butun turni qayta yaratishni talab qiladi (yangi tur +
-- ustunlarni ko'chirish + eski turni tashlash) — bu `group_signals`
-- ni bloklaydi va `settings`/filtrlar bilan birga buzilish xavfi bor.
-- Foydasi esa YO'Q: ishlab chiqarish tomoni ikki joyda to'silgan
-- (`SIGNALS_SCHEMA` enum'i va `normalizeSignal` tekshiruvi), ya'ni
-- yangi `question` yozuvi PAYDO BO'LMAYDI.
