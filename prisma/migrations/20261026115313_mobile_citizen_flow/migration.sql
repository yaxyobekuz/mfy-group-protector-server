-- CreateEnum
CREATE TYPE "IssueAttachmentKind" AS ENUM ('photo', 'video');

-- AlterEnum
ALTER TYPE "IssueSource" ADD VALUE 'mobile';

-- AlterTable
ALTER TABLE "issue_categories" ADD COLUMN     "icon" TEXT,
ADD COLUMN     "org_name" TEXT,
ADD COLUMN     "sla_hours" INTEGER NOT NULL DEFAULT 72;

-- AlterTable
ALTER TABLE "issues" ADD COLUMN     "address" TEXT,
ADD COLUMN     "citizen_id" TEXT,
ADD COLUMN     "is_hazard" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_long_standing" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_repeat_appeal" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lat" DOUBLE PRECISION,
ADD COLUMN     "lng" DOUBLE PRECISION,
ADD COLUMN     "occurred_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "settings" ADD COLUMN     "mobile_daily_limit" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "mobile_max_attachments" INTEGER NOT NULL DEFAULT 5;

-- CreateTable
CREATE TABLE "issue_attachments" (
    "id" TEXT NOT NULL,
    "issue_id" TEXT NOT NULL,
    "kind" "IssueAttachmentKind" NOT NULL,
    "path" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "original_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "issue_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "citizens" (
    "id" TEXT NOT NULL,
    "telegram_id" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT,
    "username" TEXT,
    "photo_url" TEXT,
    "language_code" TEXT NOT NULL DEFAULT 'uz',
    "phone" TEXT,
    "district_id" TEXT,
    "mahalla_id" TEXT,
    "points" INTEGER NOT NULL DEFAULT 0,
    "is_blocked" BOOLEAN NOT NULL DEFAULT false,
    "block_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "citizens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcements" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "cover_path" TEXT,
    "is_pinned" BOOLEAN NOT NULL DEFAULT false,
    "district_id" TEXT,
    "published_at" TIMESTAMP(3),
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "issue_attachments_issue_id_created_at_idx" ON "issue_attachments"("issue_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "citizens_telegram_id_key" ON "citizens"("telegram_id");

-- CreateIndex
CREATE INDEX "citizens_points_idx" ON "citizens"("points" DESC);

-- CreateIndex
CREATE INDEX "citizens_district_id_idx" ON "citizens"("district_id");

-- CreateIndex
CREATE INDEX "announcements_published_at_idx" ON "announcements"("published_at" DESC);

-- CreateIndex
CREATE INDEX "announcements_district_id_published_at_idx" ON "announcements"("district_id", "published_at" DESC);

-- CreateIndex
CREATE INDEX "issues_citizen_id_created_at_idx" ON "issues"("citizen_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "issues" ADD CONSTRAINT "issues_citizen_id_fkey" FOREIGN KEY ("citizen_id") REFERENCES "citizens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_attachments" ADD CONSTRAINT "issue_attachments_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "citizens" ADD CONSTRAINT "citizens_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "districts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "citizens" ADD CONSTRAINT "citizens_mahalla_id_fkey" FOREIGN KEY ("mahalla_id") REFERENCES "mahallas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "districts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
