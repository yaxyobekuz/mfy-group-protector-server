-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  E'LON MEDIASI VA REJALI NASHR, TAKRORIY/SHUBHALI MUROJAAT,      ║
-- ║  NOTO'G'RI O'CHIRISH BELGISI, TUMAN AHOLISI                      ║
-- ╚══════════════════════════════════════════════════════════════════╝
--
-- 1. `announcement_media`            — e'longa surat/video biriktirish
-- 2. `announcements.scheduled_at`    — rejali nashr (navbat)
-- 3. `issues.duplicate_of_id`        — ommaviy hodisa (20 ta "svet o'chdi")
-- 4. `issues.is_suspicious`          — mazmunsiz murojaatni AJRATIB ko'rsatish
-- 5. `security_events.is_false_positive` — noto'g'ri o'chirishni belgilash
-- 6. `districts.population`          — "har 1000 kishiga nechta murojaat"
--
-- ⚠️ HAMMA USTUN `NULL` BO'LISHI MUMKIN yoki standart qiymatli:
-- mavjud qatorlarni qayta yozish kerak emas.
--
-- ⚠️ `security_events` APPEND-ONLY BO'LIB QOLADI: qo'shilgan uchta
-- ustun DALIL emas, uning ustidan chiqarilgan ODAM XULOSASI.


-- AlterTable
ALTER TABLE "announcements" ADD COLUMN     "scheduled_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "districts" ADD COLUMN     "population" INTEGER;

-- AlterTable
ALTER TABLE "issues" ADD COLUMN     "duplicate_of_id" TEXT,
ADD COLUMN     "is_suspicious" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "suspicion_reason" TEXT;

-- AlterTable
ALTER TABLE "security_events" ADD COLUMN     "is_false_positive" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reviewed_at" TIMESTAMP(3),
ADD COLUMN     "reviewed_by" TEXT;

-- AlterTable

-- CreateTable
CREATE TABLE "announcement_media" (
    "id" TEXT NOT NULL,
    "announcement_id" TEXT NOT NULL,
    "kind" "IssueAttachmentKind" NOT NULL,
    "path" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "original_name" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "announcement_media_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "announcement_media_announcement_id_sort_order_idx" ON "announcement_media"("announcement_id", "sort_order");

-- CreateIndex
CREATE INDEX "announcements_scheduled_at_idx" ON "announcements"("scheduled_at");

-- CreateIndex
CREATE INDEX "issues_duplicate_of_id_idx" ON "issues"("duplicate_of_id");

-- CreateIndex
CREATE INDEX "issues_is_suspicious_created_at_idx" ON "issues"("is_suspicious", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "issues" ADD CONSTRAINT "issues_duplicate_of_id_fkey" FOREIGN KEY ("duplicate_of_id") REFERENCES "issues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_media" ADD CONSTRAINT "announcement_media_announcement_id_fkey" FOREIGN KEY ("announcement_id") REFERENCES "announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;


