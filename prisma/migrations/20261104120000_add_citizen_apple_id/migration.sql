-- FUQARO UCHINCHI YO'L BILAN HAM KIRADI: iOS'da "Sign in with Apple".
-- App Store qoidasi 4.8 iOS'da Google yonida maxfiylikni himoya
-- qiluvchi muqobil kirishni talab qiladi — `apple_id` shu uchun.
--
-- ⚠️ MAVJUD QATORLARGA XAVFSIZ: ustun bo'sh (NULL) tushadi va
-- yagonalik indeksi faqat NULL bo'lmagan qiymatlarga ta'sir qiladi.

-- AlterTable
ALTER TABLE "citizens" ADD COLUMN     "apple_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "citizens_apple_id_key" ON "citizens"("apple_id");
