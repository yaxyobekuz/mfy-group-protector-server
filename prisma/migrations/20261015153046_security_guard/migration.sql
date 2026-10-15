-- CreateEnum
CREATE TYPE "ThreatKind" AS ENUM ('apk_file', 'unknown_file', 'suspicious_url', 'shortened_url', 'masked_url');

-- CreateEnum
CREATE TYPE "ThreatAction" AS ENUM ('deleted', 'detected', 'delete_failed');

-- AlterTable
ALTER TABLE "settings" ADD COLUMN     "guard_allowed_hosts" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "guard_blocked_hosts" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "guard_delete_files" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "guard_delete_urls" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "telegram_groups" ADD COLUMN     "guard_at" TIMESTAMP(3),
ADD COLUMN     "guard_by" TEXT,
ADD COLUMN     "guard_enabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "security_events" (
    "id" TEXT NOT NULL,
    "chat_id" TEXT NOT NULL,
    "message_id" TEXT,
    "kind" "ThreatKind" NOT NULL,
    "action" "ThreatAction" NOT NULL,
    "sender_tg_id" TEXT,
    "sender_name" TEXT,
    "sender_username" TEXT,
    "file_name" TEXT,
    "file_mime" TEXT,
    "file_size" INTEGER,
    "file_unique_id" TEXT,
    "url" TEXT,
    "url_host" TEXT,
    "reason" TEXT NOT NULL,
    "message_text" TEXT,
    "error_message" TEXT,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "security_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "security_events_chat_id_created_at_idx" ON "security_events"("chat_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "security_events_kind_created_at_idx" ON "security_events"("kind", "created_at" DESC);

-- CreateIndex
CREATE INDEX "security_events_sender_tg_id_idx" ON "security_events"("sender_tg_id");

-- CreateIndex
CREATE UNIQUE INDEX "security_events_chat_id_message_id_key" ON "security_events"("chat_id", "message_id");

-- AddForeignKey
ALTER TABLE "telegram_groups" ADD CONSTRAINT "telegram_groups_guard_by_fkey" FOREIGN KEY ("guard_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_events" ADD CONSTRAINT "security_events_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "telegram_groups"("chat_id") ON DELETE CASCADE ON UPDATE CASCADE;
