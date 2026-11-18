-- SHOVQINLI TASHQI RO'YXATLAR O'CHIRILADI — TIRIK SHIKOYATDAN KEYIN.
--
-- ⚠️ MUAMMO: guruhlarda ODDIY havolalar jimgina o'chib ketardi.
-- Sabab tekshirildi (2026-11-18, ro'yxatlar yuklab olinib
-- solishtirildi):
--
--   Phishing.Database  392 164 yozuv — ichida `telegra.ph` VA 333 ta
--                      `.uz` domeni (oddiy do'kon, tashkilot saytlari)
--   AdGuard DNS        190 553 yozuv — bu REKLAMA filtri, tahdid
--                      ro'yxati emas: reklama domeniga havola
--                      qilgani uchun xabarni o'chirish noto'g'ri
--
--   Phishing Army      145 420 yozuv — `.uz` yo'q, mashhur sayt yo'q
--   URLhaus              2 092 yozuv — tor va aniq
--   OpenPhish              264 yozuv — tirik fishing
--
-- ⚠️ KODDAGI OQ RO'YXAT YETARLI EMAS (`threat-rules.ts`): u
-- `telegra.ph`, `t.me`, `youtube.com` kabi SANOQLI hostni qutqaradi,
-- 333 ta oddiy `.uz` domenini esa oldindan bilib bo'lmaydi.
--
-- ⚠️ `isEnabled` ODATDA MA'MURIYATNIKI va seed unga TEGMAYDI
-- (doktrina). Bu — bir martalik TUZATISH: hozirgi holatda himoya
-- aholining oddiy xabarlarini o'chirayapti, ya'ni zarari foydasidan
-- katta. Panelda ikkalasini qayta yoqish yo'li OCHIQ qoladi.
--
-- ⚠️ HOSTLAR HAM O'CHIRILADI: faqat `is_enabled` ni o'zgartirish
-- yetmaydi — botga yuboriladigan ro'yxat `threat_hosts` dan
-- yig'iladi va o'chirilgan manbaning 580 000 hosti o'sha yerda
-- qolib ketardi.
--
-- ⚠️ YON TA'SIR — 500 000 LIK CHEGARA BO'SHAYDI: avval jami
-- 534 845 host bor edi va ularning 34 845 tasi botga UMUMAN
-- yetib bormasdi (`logger.error` bilan ko'rinib turardi).
-- Endi jami ~148 000 — hammasi sig'adi.

DELETE FROM "threat_hosts"
WHERE "feed_id" IN (
  SELECT "id" FROM "threat_feeds"
  WHERE "name" IN ('Phishing.Database (GitHub, faol)', 'AdGuard DNS filter')
);

UPDATE "threat_feeds"
SET "is_enabled" = false,
    -- ⚠️ `last_fetched_at` TOZALANADI: ro'yxat qayta yoqilganda u
    -- "yaqinda olingan" deb hisoblanib, bo'sh holicha turib
    -- qolardi (`threat-feeds.service.ts` dagi muddat sharti).
    "last_fetched_at" = NULL,
    "last_count" = 0
WHERE "name" IN ('Phishing.Database (GitHub, faol)', 'AdGuard DNS filter');
