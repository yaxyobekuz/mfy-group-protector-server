-- AUDIT JURNALI OLIB TASHLANDI (sozlama qarori, 2026-11-25).
--
-- Panelda "Audit jurnali" sahifasi ham, serverda yozish ham yo'q
-- qilindi: `AuditService` 16 servisdan olindi (45 chaqiruv),
-- `audit.view` ruxsati ham olib tashlandi. Jadval ishlatilmay
-- qolgani uchun tushiriladi.
--
-- ⚠️ TARIX QAYTMAYDI: "kim nima o'zgartirgan" yozuvlari butunlay
-- o'chadi. Bu ataylab so'ralgan.
DROP TABLE IF EXISTS "audit_logs";
