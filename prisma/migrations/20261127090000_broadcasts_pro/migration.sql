-- TARQATMA MODULINING KENGAYTIRILISHI
--
-- ⚠️ ENUM QIYMATLARI QO'SHILADI, ALMASHTIRILMAYDI: bazada eski
-- tarqatmalar turibdi va `BroadcastAudience`/`BroadcastStatus`
-- qayta yaratilsa, ular bilan birga butun tarix yo'qolardi.
ALTER TYPE "BroadcastAudience" ADD VALUE IF NOT EXISTS 'citizens_active';
ALTER TYPE "BroadcastAudience" ADD VALUE IF NOT EXISTS 'channels';
ALTER TYPE "BroadcastAudience" ADD VALUE IF NOT EXISTS 'chats';
ALTER TYPE "BroadcastAudience" ADD VALUE IF NOT EXISTS 'all';

ALTER TYPE "BroadcastStatus" ADD VALUE IF NOT EXISTS 'draft';
ALTER TYPE "BroadcastStatus" ADD VALUE IF NOT EXISTS 'scheduled';
ALTER TYPE "BroadcastStatus" ADD VALUE IF NOT EXISTS 'cancelled';

CREATE TYPE "BroadcastTargetKind" AS ENUM ('citizen', 'group', 'channel');
CREATE TYPE "BroadcastDelivery" AS ENUM ('sent', 'failed', 'blocked');
CREATE TYPE "BroadcastParseMode" AS ENUM ('plain', 'html');

-- ⚠️ HAMMASI STANDART QIYMAT BILAN: jadvalda qatorlar bor va
-- `NOT NULL` ustunni standartsiz qo'shish migratsiyani yiqitardi.
ALTER TABLE "broadcasts"
  ADD COLUMN "title"           TEXT,
  ADD COLUMN "parse_mode"      "BroadcastParseMode" NOT NULL DEFAULT 'plain',
  ADD COLUMN "disable_preview" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "silent"          BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "pin_message"     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "buttons"         JSONB,
  ADD COLUMN "scheduled_at"    TIMESTAMP(3),
  ADD COLUMN "cancelled_at"    TIMESTAMP(3),
  ADD COLUMN "chat_ids"        TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "active_days"     INTEGER,
  ADD COLUMN "blocked"         INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "broadcast_recipients" (
  "id"           TEXT NOT NULL,
  "broadcast_id" TEXT NOT NULL,
  "chat_id"      TEXT NOT NULL,
  "kind"         "BroadcastTargetKind" NOT NULL,
  "status"       "BroadcastDelivery" NOT NULL,
  "error"        TEXT,
  "title"        TEXT,
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "broadcast_recipients_pkey" PRIMARY KEY ("id")
);

-- ⚠️ TARQATMA O'CHIRILSA JURNAL HAM KETADI (`CASCADE`): u faqat
-- o'sha tarqatma haqida va yetim qator hech kimga kerak emas.
ALTER TABLE "broadcast_recipients"
  ADD CONSTRAINT "broadcast_recipients_broadcast_id_fkey"
  FOREIGN KEY ("broadcast_id") REFERENCES "broadcasts"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "broadcast_recipients_broadcast_id_status_idx"
  ON "broadcast_recipients"("broadcast_id", "status");

-- ⚠️ JOB HAR DAQIQADA SO'RAYDI: indekssiz u butun jadvalni
-- aylanib chiqardi.
CREATE INDEX "broadcasts_status_scheduled_at_idx"
  ON "broadcasts"("status", "scheduled_at");
