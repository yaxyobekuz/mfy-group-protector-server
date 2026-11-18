-- TASHKILOTLARGA YO'NALTIRISH.
--
-- ⚠️ PRODDA TIRIK MA'LUMOT BOR (100+ guruh, tirik murojaatlar).
-- Shuning uchun bu migratsiyada MAVJUD QATORLARNI o'zgartiradigan
-- biror bayonot YO'Q: faqat yangi jadvallar, NULL bo'lishi mumkin
-- ustunlar va bitta `DEFAULT false`. Hech qaysi ustun to'ldirilmaydi
-- va hech qaysi qiymat qayta yozilmaydi.

-- ── 1. QAMROV TURIGA "TASHKILOT" QO'SHILADI ──────────────────────────
--
-- ⚠️ ALOHIDA BAYONOT VA BIRINCHI O'RINDA: PostgreSQL'da enum qiymati
-- qo'shilgandan keyin u AYNI tranzaksiya ichida ishlatilib bo'lmaydi
-- (12-versiyadan keyin yumshatilgan, lekin pastdagi `DEFAULT` lar
-- baribir shu qiymatga tegmaydi — ya'ni tartib xavfsiz).
ALTER TYPE "ScopeKind" ADD VALUE IF NOT EXISTS 'org';

-- ── 2. TASHKILOT ─────────────────────────────────────────────────────
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "short_name" TEXT,
    "district_id" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "telegram_chat_id" TEXT,
    "link_code" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "organizations_name_key" ON "organizations"("name");
CREATE UNIQUE INDEX "organizations_telegram_chat_id_key" ON "organizations"("telegram_chat_id");
CREATE UNIQUE INDEX "organizations_link_code_key" ON "organizations"("link_code");
CREATE INDEX "organizations_is_archived_name_idx" ON "organizations"("is_archived", "name");
CREATE INDEX "organizations_district_id_is_archived_idx" ON "organizations"("district_id", "is_archived");

-- ── 3. YO'NALTIRISH QOIDASI (tuman × yo'nalish → tashkilot) ──────────
CREATE TABLE "organization_routes" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "district_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_routes_pkey" PRIMARY KEY ("id")
);

-- ⚠️ BU CHEKLOV VILOYAT ZAXIRASINI (`district_id IS NULL`) HIMOYA
-- QILMAYDI: PostgreSQL `UNIQUE` da NULL larni teng deb hisoblamaydi.
-- Sabab va yechim sxemadagi izohda (tekshiruv `organizations.service.ts`
-- da, qidiruv tartibi `createdAt` bo'yicha).
CREATE UNIQUE INDEX "organization_routes_category_id_district_id_key" ON "organization_routes"("category_id", "district_id");
CREATE INDEX "organization_routes_organization_id_idx" ON "organization_routes"("organization_id");
CREATE INDEX "organization_routes_district_id_idx" ON "organization_routes"("district_id");

-- ── 4. XODIM: TASHKILOT VA PAROL ALMASHTIRISH ────────────────────────
--
-- ⚠️ `must_change_password` STANDART `false`: mavjud shtab xodimlari
-- ertalab panelga kirganda to'siqqa urilmasligi kerak. Majburiy
-- almashtirish faqat TASHKILOTGA yaratilgan yangi hisoblarda yoqiladi.
ALTER TABLE "users" ADD COLUMN "organization_id" TEXT;
ALTER TABLE "users" ADD COLUMN "must_change_password" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "users_organization_id_is_archived_idx" ON "users"("organization_id", "is_archived");

-- ── 5. MUROJAAT: IJROCHI TASHKILOT VA "BAJARILDI" BELGISI ────────────
--
-- ⚠️ ESKI MUROJAATLARDA `NULL` QOLADI VA ORQAGA TO'LDIRILMAYDI: qoida
-- ular yaratilganda mavjud emasdi, ya'ni tashkilotga xabar ham
-- ketmagan. To'ldirilsa, panel "tashkilot xabardor" degan YOLG'ON
-- ko'rsatkich berardi (`Issue.organizationId` — muhrlangan nusxa).
ALTER TABLE "issues" ADD COLUMN "organization_id" TEXT;
ALTER TABLE "issues" ADD COLUMN "org_done_at" TIMESTAMP(3);
ALTER TABLE "issues" ADD COLUMN "org_done_by" TEXT;

CREATE INDEX "issues_organization_id_status_idx" ON "issues"("organization_id", "status");

-- ── 6. TASHQI KALITLAR ───────────────────────────────────────────────
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "districts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "organization_routes" ADD CONSTRAINT "organization_routes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "organization_routes" ADD CONSTRAINT "organization_routes_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "issue_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "organization_routes" ADD CONSTRAINT "organization_routes_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "districts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "organization_routes" ADD CONSTRAINT "organization_routes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "issues" ADD CONSTRAINT "issues_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "issues" ADD CONSTRAINT "issues_org_done_by_fkey" FOREIGN KEY ("org_done_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
