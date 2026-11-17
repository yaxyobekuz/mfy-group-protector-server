-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  TAHDID RO'YXATI — HAR BIRIGA O'Z YANGILANISH ORALIG'I            ║
-- ╚══════════════════════════════════════════════════════════════════╝
--
-- ⚠️ BITTA SON HAMMASIGA TO'G'RI KELMAYDI. Manbalar tabiatan har xil:
--
--   OpenPhish          —    264 domen, soatlab yangilanadi, ~kilobayt
--   URLhaus ko'zgusi   —  2 081 domen, manbaning O'ZI 12 soatda
--   Phishing Army      — 142 591 domen, kuniga
--   Phishing.Database  — 200 000 domen, 11 MB, ~50 soniya
--   AdGuard DNS filter — 189 909 domen, sekin o'zgaradi (reklama filtri)
--
-- Hammasini 6 soatda yangilash kuniga ~1,4 mln qator yozishni
-- anglatardi; hammasini 3 kunda yangilash esa ENG TIRIK manbani
-- (OpenPhish — bir necha kilobayt) bekorga eskirtirib qo'yardi.
--
-- ⚠️ STANDART 72 SOAT: keyin qo'shiladigan, hajmi o'ylanmagan manba
-- EHTIYOTKOR qiymat bilan boshlanishi kerak — tez yangilanadigan
-- qilib qo'yish bazani jimgina yuklab qo'yardi.

ALTER TABLE "threat_feeds"
  ADD COLUMN "refresh_hours" INTEGER NOT NULL DEFAULT 72;

-- ⚠️ MAVJUD QATORLARGA QIYMAT NOM BO'YICHA BERILADI: seed ham shu
-- qiymatlarni yozadi, lekin u faqat deploy paytida ishlaydi va
-- migratsiya o'z holicha to'liq bo'lishi kerak.
UPDATE "threat_feeds" SET "refresh_hours" = 6   WHERE "name" = 'OpenPhish';
UPDATE "threat_feeds" SET "refresh_hours" = 12  WHERE "name" = 'URLhaus (malware-filter ko''zgusi)';
UPDATE "threat_feeds" SET "refresh_hours" = 24  WHERE "name" = 'Phishing Army (blocklist)';
UPDATE "threat_feeds" SET "refresh_hours" = 24  WHERE "name" = 'Phishing.Database (GitHub, faol)';
UPDATE "threat_feeds" SET "refresh_hours" = 168 WHERE "name" = 'AdGuard DNS filter';
