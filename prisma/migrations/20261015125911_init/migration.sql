-- CreateEnum
CREATE TYPE "ScopeKind" AS ENUM ('province', 'district');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('owner', 'admin', 'operator', 'viewer');

-- CreateEnum
CREATE TYPE "SignalKind" AS ENUM ('complaint', 'suggestion', 'question');

-- CreateEnum
CREATE TYPE "SignalSeverity" AS ENUM ('low', 'normal', 'high');

-- CreateEnum
CREATE TYPE "SignalStatus" AS ENUM ('new', 'attached', 'dismissed');

-- CreateEnum
CREATE TYPE "IssueSource" AS ENUM ('signal', 'bot', 'manual');

-- CreateEnum
CREATE TYPE "IssueStatus" AS ENUM ('new', 'in_progress', 'resolved', 'rejected');

-- CreateEnum
CREATE TYPE "IssuePriority" AS ENUM ('low', 'normal', 'high', 'urgent');

-- CreateTable
CREATE TABLE "districts" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "districts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mahallas" (
    "id" TEXT NOT NULL,
    "district_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "chairman_name" TEXT,
    "chairman_phone" TEXT,
    "population" INTEGER,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mahallas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "phone" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'operator',
    "scope_kind" "ScopeKind" NOT NULL DEFAULT 'district',
    "district_id" TEXT,
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "archived_at" TIMESTAMP(3),
    "telegram_id" TEXT,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "user_agent" TEXT,
    "ip" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telegram_groups" (
    "chat_id" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'group',
    "title" TEXT NOT NULL,
    "username" TEXT,
    "status" TEXT NOT NULL DEFAULT 'member',
    "can_post_messages" BOOLEAN NOT NULL DEFAULT false,
    "can_invite_users" BOOLEAN NOT NULL DEFAULT false,
    "is_official" BOOLEAN NOT NULL DEFAULT false,
    "official_at" TIMESTAMP(3),
    "official_by" TEXT,
    "mahalla_id" TEXT,
    "added_by_tg_id" TEXT,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "telegram_groups_pkey" PRIMARY KEY ("chat_id")
);

-- CreateTable
CREATE TABLE "group_messages" (
    "id" TEXT NOT NULL,
    "chat_id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "sender_tg_id" TEXT,
    "sender_name" TEXT,
    "text" TEXT NOT NULL,
    "reply_to_text" TEXT,
    "sent_at" TIMESTAMP(3) NOT NULL,
    "analyzed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_signals" (
    "id" TEXT NOT NULL,
    "chat_id" TEXT NOT NULL,
    "message_id" TEXT,
    "kind" "SignalKind" NOT NULL,
    "severity" "SignalSeverity" NOT NULL DEFAULT 'normal',
    "summary" TEXT NOT NULL,
    "sender_tg_id" TEXT,
    "sender_name" TEXT,
    "sent_at" TIMESTAMP(3),
    "message_count" INTEGER NOT NULL DEFAULT 1,
    "model" TEXT,
    "status" "SignalStatus" NOT NULL DEFAULT 'new',
    "issue_id" TEXT,
    "attached_by" TEXT,
    "attached_at" TIMESTAMP(3),
    "dismissed_by" TEXT,
    "dismissed_at" TIMESTAMP(3),
    "dismissed_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "group_signals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issue_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "issue_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issues" (
    "id" TEXT NOT NULL,
    "public_no" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "source" "IssueSource" NOT NULL,
    "mahalla_id" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "IssueStatus" NOT NULL DEFAULT 'new',
    "priority" "IssuePriority" NOT NULL DEFAULT 'normal',
    "author_id" TEXT,
    "author_chat_id" TEXT,
    "source_meta" JSONB,
    "assignee_id" TEXT,
    "due_at" TIMESTAMP(3),
    "resolution" TEXT,
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issue_comments" (
    "id" TEXT NOT NULL,
    "issue_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "issue_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "org_name" TEXT NOT NULL DEFAULT 'Viloyat shtabi',
    "ai_enabled" BOOLEAN NOT NULL DEFAULT true,
    "ai_interval_minutes" INTEGER NOT NULL DEFAULT 30,
    "ai_max_messages_per_run" INTEGER NOT NULL DEFAULT 300,
    "message_retention_hours" INTEGER NOT NULL DEFAULT 24,
    "alert_chat_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "alert_min_severity" "SignalSeverity" NOT NULL DEFAULT 'high',
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT,
    "entity_id" TEXT,
    "meta" JSONB,
    "ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "districts_code_key" ON "districts"("code");

-- CreateIndex
CREATE INDEX "districts_is_archived_sort_order_idx" ON "districts"("is_archived", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "mahallas_code_key" ON "mahallas"("code");

-- CreateIndex
CREATE INDEX "mahallas_district_id_is_archived_sort_order_idx" ON "mahallas"("district_id", "is_archived", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_telegram_id_key" ON "users"("telegram_id");

-- CreateIndex
CREATE INDEX "users_role_is_archived_idx" ON "users"("role", "is_archived");

-- CreateIndex
CREATE INDEX "users_district_id_idx" ON "users"("district_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_revoked_at_idx" ON "sessions"("user_id", "revoked_at");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE INDEX "telegram_groups_is_official_status_idx" ON "telegram_groups"("is_official", "status");

-- CreateIndex
CREATE INDEX "telegram_groups_mahalla_id_idx" ON "telegram_groups"("mahalla_id");

-- CreateIndex
CREATE INDEX "group_messages_analyzed_at_sent_at_idx" ON "group_messages"("analyzed_at", "sent_at");

-- CreateIndex
CREATE UNIQUE INDEX "group_messages_chat_id_message_id_key" ON "group_messages"("chat_id", "message_id");

-- CreateIndex
CREATE UNIQUE INDEX "group_signals_issue_id_key" ON "group_signals"("issue_id");

-- CreateIndex
CREATE INDEX "group_signals_status_created_at_idx" ON "group_signals"("status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "group_signals_chat_id_status_idx" ON "group_signals"("chat_id", "status");

-- CreateIndex
CREATE INDEX "group_signals_severity_status_idx" ON "group_signals"("severity", "status");

-- CreateIndex
CREATE UNIQUE INDEX "issue_categories_name_key" ON "issue_categories"("name");

-- CreateIndex
CREATE INDEX "issue_categories_is_active_sort_order_idx" ON "issue_categories"("is_active", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "issues_public_no_key" ON "issues"("public_no");

-- CreateIndex
CREATE INDEX "issues_status_created_at_idx" ON "issues"("status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "issues_mahalla_id_status_idx" ON "issues"("mahalla_id", "status");

-- CreateIndex
CREATE INDEX "issues_category_id_status_idx" ON "issues"("category_id", "status");

-- CreateIndex
CREATE INDEX "issues_assignee_id_status_idx" ON "issues"("assignee_id", "status");

-- CreateIndex
CREATE INDEX "issue_comments_issue_id_created_at_idx" ON "issue_comments"("issue_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_created_at_idx" ON "audit_logs"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_entity_entity_id_idx" ON "audit_logs"("entity", "entity_id");

-- AddForeignKey
ALTER TABLE "mahallas" ADD CONSTRAINT "mahallas_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "districts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "districts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telegram_groups" ADD CONSTRAINT "telegram_groups_mahalla_id_fkey" FOREIGN KEY ("mahalla_id") REFERENCES "mahallas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telegram_groups" ADD CONSTRAINT "telegram_groups_official_by_fkey" FOREIGN KEY ("official_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_messages" ADD CONSTRAINT "group_messages_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "telegram_groups"("chat_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_signals" ADD CONSTRAINT "group_signals_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "telegram_groups"("chat_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_signals" ADD CONSTRAINT "group_signals_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_signals" ADD CONSTRAINT "group_signals_attached_by_fkey" FOREIGN KEY ("attached_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_signals" ADD CONSTRAINT "group_signals_dismissed_by_fkey" FOREIGN KEY ("dismissed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issues" ADD CONSTRAINT "issues_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "issue_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issues" ADD CONSTRAINT "issues_mahalla_id_fkey" FOREIGN KEY ("mahalla_id") REFERENCES "mahallas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issues" ADD CONSTRAINT "issues_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issues" ADD CONSTRAINT "issues_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issues" ADD CONSTRAINT "issues_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_comments" ADD CONSTRAINT "issue_comments_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_comments" ADD CONSTRAINT "issue_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
