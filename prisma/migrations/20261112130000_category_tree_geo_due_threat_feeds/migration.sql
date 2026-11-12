-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  KICHIK YO'NALISHLAR, MFY GEOMETRIYASI, MUDDAT MANBASI,          ║
-- ║  TASHQI TAHDID RO'YXATLARI                                       ║
-- ╚══════════════════════════════════════════════════════════════════╝
--
-- 1. `issue_categories.parent_id` — ikki darajali yo'nalish daraxti
-- 2. `mahallas.geo_json` / `lat` / `lng` — xaritadagi MFY kesimi
-- 3. `issues.due_source` — "muddat qayerdan keldi" savoliga javob
-- 4. `threat_feeds` / `threat_hosts` — o'zi yangilanadigan fishing
--    va zararli domen ro'yxatlari
--
-- ⚠️ HAMMA USTUN `NULL` BO'LISHI MUMKIN yoki standart qiymatli:
-- mavjud qatorlarni qayta yozish kerak emas va migratsiya katta
-- jadvalni qulflamaydi.
--
-- ⚠️ `parent_id` FK `RESTRICT`: ichida kichik yo'nalishlari bor
-- yo'nalishni o'chirish bolalarni "egasiz" qoldirardi.


-- CreateEnum
CREATE TYPE "ThreatFeedFormat" AS ENUM ('hosts', 'domains', 'adguard', 'urlhaus');

-- AlterTable
ALTER TABLE "issue_categories" ADD COLUMN     "parent_id" TEXT;

-- AlterTable
ALTER TABLE "issues" ADD COLUMN     "due_source" TEXT;

-- AlterTable
ALTER TABLE "mahallas" ADD COLUMN     "geo_json" JSONB,
ADD COLUMN     "lat" DOUBLE PRECISION,
ADD COLUMN     "lng" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "threat_feeds" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "format" "ThreatFeedFormat" NOT NULL DEFAULT 'domains',
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_fetched_at" TIMESTAMP(3),
    "last_count" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "threat_feeds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "threat_hosts" (
    "feed_id" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "threat_hosts_pkey" PRIMARY KEY ("feed_id","host")
);

-- CreateIndex
CREATE UNIQUE INDEX "threat_feeds_name_key" ON "threat_feeds"("name");

-- CreateIndex
CREATE INDEX "threat_hosts_host_idx" ON "threat_hosts"("host");

-- CreateIndex
CREATE INDEX "issue_categories_parent_id_sort_order_idx" ON "issue_categories"("parent_id", "sort_order");

-- AddForeignKey
ALTER TABLE "issue_categories" ADD CONSTRAINT "issue_categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "issue_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "threat_hosts" ADD CONSTRAINT "threat_hosts_feed_id_fkey" FOREIGN KEY ("feed_id") REFERENCES "threat_feeds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

