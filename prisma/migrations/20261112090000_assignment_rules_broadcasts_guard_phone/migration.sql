-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  IJROCHI QOIDALARI, TARQATMA, QALQON HUQUQI, MAJBURIY TELEFON   ║
-- ╚══════════════════════════════════════════════════════════════════╝
--
-- 1. `mahalla_assignees` — MFY × yo'nalish → xodim (avtomatik ijrochi)
-- 2. `broadcasts`        — tuman/MFY kesimida xabar yuborish
-- 3. `telegram_groups.can_delete_messages` — qalqon ishlay oladimi
-- 4. `telegram_groups.member_count`        — "obunachilar" sanog'i
-- 5. `citizens.last_seen_at`               — botdagi FAOL foydalanuvchi
-- 6. `settings.require_phone`              — telefonsiz murojaat yo'q
--
-- ⚠️ HAMMA USTUN STANDART QIYMAT BILAN QO'SHILADI: mavjud qatorlarni
-- qayta yozish kerak emas va migratsiya katta jadvalni qulflamaydi.


-- CreateEnum
CREATE TYPE "BroadcastAudience" AS ENUM ('citizens', 'groups', 'both');

-- CreateEnum
CREATE TYPE "BroadcastMode" AS ENUM ('text', 'forward', 'copy');

-- CreateEnum
CREATE TYPE "BroadcastStatus" AS ENUM ('pending', 'sending', 'done', 'failed');

-- AlterTable
ALTER TABLE "citizens" ADD COLUMN     "last_seen_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "settings" ADD COLUMN     "require_phone" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "telegram_groups" ADD COLUMN     "can_delete_messages" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "member_count" INTEGER,
ADD COLUMN     "member_count_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "mahalla_assignees" (
    "id" TEXT NOT NULL,
    "mahalla_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "sla_hours" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mahalla_assignees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "broadcasts" (
    "id" TEXT NOT NULL,
    "audience" "BroadcastAudience" NOT NULL,
    "mode" "BroadcastMode" NOT NULL,
    "text" TEXT,
    "from_chat_id" TEXT,
    "source_message_id" TEXT,
    "district_id" TEXT,
    "mahalla_id" TEXT,
    "status" "BroadcastStatus" NOT NULL DEFAULT 'pending',
    "total" INTEGER NOT NULL DEFAULT 0,
    "sent" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "created_by" TEXT NOT NULL,
    "via" TEXT NOT NULL DEFAULT 'panel',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "broadcasts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mahalla_assignees_user_id_idx" ON "mahalla_assignees"("user_id");

-- CreateIndex
CREATE INDEX "mahalla_assignees_category_id_idx" ON "mahalla_assignees"("category_id");

-- CreateIndex
CREATE UNIQUE INDEX "mahalla_assignees_mahalla_id_category_id_key" ON "mahalla_assignees"("mahalla_id", "category_id");

-- CreateIndex
CREATE INDEX "broadcasts_created_at_idx" ON "broadcasts"("created_at" DESC);

-- CreateIndex
CREATE INDEX "broadcasts_status_idx" ON "broadcasts"("status");

-- CreateIndex
CREATE INDEX "citizens_last_seen_at_idx" ON "citizens"("last_seen_at");

-- AddForeignKey
ALTER TABLE "mahalla_assignees" ADD CONSTRAINT "mahalla_assignees_mahalla_id_fkey" FOREIGN KEY ("mahalla_id") REFERENCES "mahallas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mahalla_assignees" ADD CONSTRAINT "mahalla_assignees_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "issue_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mahalla_assignees" ADD CONSTRAINT "mahalla_assignees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mahalla_assignees" ADD CONSTRAINT "mahalla_assignees_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "broadcasts" ADD CONSTRAINT "broadcasts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "broadcasts" ADD CONSTRAINT "broadcasts_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "districts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "broadcasts" ADD CONSTRAINT "broadcasts_mahalla_id_fkey" FOREIGN KEY ("mahalla_id") REFERENCES "mahallas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

