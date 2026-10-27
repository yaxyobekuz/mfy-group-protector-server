-- FUQARO IKKI YO'L BILAN KIRADI: mini-ilova (Telegram) yoki
-- mobil ilova (Google). Shuning uchun `telegram_id` endi IXTIYORIY
-- va yoniga `google_id` qo'shildi.
--
-- ⚠️ MAVJUD QATORLARGA XAVFSIZ: NOT NULL olib tashlanishi
-- ma'lumotni yo'qotmaydi, yangi ustunlar esa bo'sh (NULL) tushadi.

-- AlterTable
ALTER TABLE "citizens" ADD COLUMN     "email" TEXT,
ADD COLUMN     "google_id" TEXT,
ALTER COLUMN "telegram_id" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "citizens_google_id_key" ON "citizens"("google_id");
