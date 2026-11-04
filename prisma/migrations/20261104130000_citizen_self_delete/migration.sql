-- HISOBNI O'CHIRISH (App Store 5.1.1(v), Google Play talabi).
--
-- Do'konlar ilovaning ICHIDAN hisobni o'chirish yo'lini talab qiladi —
-- usiz ilova RAD ETILADI.
--
-- ── NIMA UCHUN QATOR O'CHIRILMAYDI ───────────────────────────────────
--
-- `deleted_at` — BELGI, o'chirish emas. Murojaatlar (`issues`) va
-- izohlar HISOBOT uchun qoladi: "mart oyida nechta murojaat keldi"
-- degan raqam odam hisobini o'chirgani uchun o'zgarib ketmasligi kerak
-- (`issues.source` muhrlangan qiymat bo'lgani bilan ayni sabab).
--
-- Shaxsiy ma'lumot esa TOZALANADI (`mobile.service.ts#deleteMe`): ism,
-- username, rasm, pochta, telefon, hudud va UCHALA kirish kaliti
-- (`telegram_id`/`google_id`/`apple_id`) `NULL` bo'ladi. Ya'ni qator
-- qoladi, ortidagi ODAM qolmaydi.
--
-- ⚠️ KALITLAR TOZALANGANI UCHUN qayta kirish YANGI fuqaro yaratadi.
-- Bu ataylab: "o'chirdim" degan odam qayta kirganda eski murojaatlari
-- qaytib kelsa, o'chirish ishonchini yo'qotardi.

-- AlterTable
ALTER TABLE "citizens" ADD COLUMN     "apple_refresh_token" TEXT,
ADD COLUMN     "deleted_at" TIMESTAMP(3);

-- CreateIndex
-- ⚠️ REYTING VA RO'YXATLAR `deleted_at IS NULL` bo'yicha filtrlanadi —
-- indekssiz u butun jadvalni skanerlab o'tardi.
CREATE INDEX "citizens_deleted_at_idx" ON "citizens"("deleted_at");
