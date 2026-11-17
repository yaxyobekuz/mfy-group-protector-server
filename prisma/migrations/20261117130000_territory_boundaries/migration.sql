-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  XARITA CHEGARALARI — VILOYAT VA TUMAN                            ║
-- ╚══════════════════════════════════════════════════════════════════╝
--
-- ⚠️ MFY CHEGARASI ALLAQACHON BOR EDI (`mahallas.geo_json`), lekin
-- xaritada tayanch YO'Q edi: nuqtalar ochiq fonda, qo'shni
-- viloyatlar va qo'shni davlat (Qirg'iziston) ustida suzib turardi.
-- Operator "bu nuqta bizning hududdami" degan savolga ko'z bilan
-- javob bera olmasdi.
--
-- ⚠️ VILOYAT CHEGARASI — SOZLAMADA, ALOHIDA JADVALDA EMAS: tizim
-- BITTA viloyat uchun ishlaydi (`Settings` — singleton). Jadval
-- ochilsa, unda abadiy bitta qator yotardi va "qaysi viloyat
-- joriy" degan savol paydo bo'lardi.
--
-- ⚠️ `jsonb`, `geometry` EMAS: PostGIS o'rnatilmagan va u BU ISH
-- uchun kerak ham emas — chegara faqat CHIZILADI, geometrik so'rov
-- (nuqta poligon ichidami) serverda bajarilmaydi.

ALTER TABLE "districts"
  ADD COLUMN "geo_json" JSONB;

ALTER TABLE "settings"
  ADD COLUMN "province_geo_json" JSONB;
