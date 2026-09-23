-- Organizations: every resource moves from a user to a workspace.
--
-- Each existing user gets a personal workspace whose id is their user id, so
-- the rows that pointed at a user already point at the right workspace and
-- only the foreign keys change. Credits, the webhook secret and the low-balance
-- marker move across with their values.

CREATE TYPE "public"."member_role" AS ENUM('owner', 'admin', 'member');--> statement-breakpoint
CREATE TABLE "organization" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"personal" boolean DEFAULT false NOT NULL,
	"credits" bigint DEFAULT 0 NOT NULL,
	"webhook_secret" text DEFAULT encode(gen_random_bytes(24), 'hex') NOT NULL,
	"low_balance_notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_slug_unique" UNIQUE("slug")
);--> statement-breakpoint
CREATE TABLE "member" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" "member_role" DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"email" text NOT NULL,
	"role" "member_role" DEFAULT 'member' NOT NULL,
	"token_hash" text NOT NULL,
	"invited_by" text,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitation_token_hash_unique" UNIQUE("token_hash")
);--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_invited_by_user_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "member_org_user_uidx" ON "member" USING btree ("org_id","user_id");--> statement-breakpoint
CREATE INDEX "member_user_idx" ON "member" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "invitation_org_idx" ON "invitation" USING btree ("org_id","created_at" DESC NULLS LAST);--> statement-breakpoint

-- A personal workspace per user, with the same id, and its owner.
INSERT INTO "organization" ("id", "name", "slug", "personal", "credits", "webhook_secret", "low_balance_notified_at", "created_at")
SELECT "id", 'Personal', lower("id"), true, "credits", "webhook_secret", "low_balance_notified_at", "created_at" FROM "user";--> statement-breakpoint
INSERT INTO "member" ("id", "org_id", "user_id", "role", "created_at")
SELECT 'mem_' || "id", "id", "id", 'owner', "created_at" FROM "user";--> statement-breakpoint

-- api_key: owned by the workspace, created by the member.
ALTER TABLE "api_key" DROP CONSTRAINT "api_key_user_id_user_id_fk";--> statement-breakpoint
DROP INDEX "api_key_user_idx";--> statement-breakpoint
ALTER TABLE "api_key" RENAME COLUMN "user_id" TO "org_id";--> statement-breakpoint
ALTER TABLE "api_key" ADD COLUMN "created_by" text;--> statement-breakpoint
UPDATE "api_key" SET "created_by" = "org_id";--> statement-breakpoint
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_key_org_idx" ON "api_key" USING btree ("org_id");--> statement-breakpoint

ALTER TABLE "llm_credential" DROP CONSTRAINT "llm_credential_user_id_user_id_fk";--> statement-breakpoint
DROP INDEX "llm_credential_user_provider_uidx";--> statement-breakpoint
ALTER TABLE "llm_credential" RENAME COLUMN "user_id" TO "org_id";--> statement-breakpoint
ALTER TABLE "llm_credential" ADD CONSTRAINT "llm_credential_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "llm_credential_org_provider_uidx" ON "llm_credential" USING btree ("org_id","provider");--> statement-breakpoint

ALTER TABLE "user_proxy" DROP CONSTRAINT "user_proxy_user_id_user_id_fk";--> statement-breakpoint
DROP INDEX "user_proxy_user_idx";--> statement-breakpoint
ALTER TABLE "user_proxy" RENAME COLUMN "user_id" TO "org_id";--> statement-breakpoint
ALTER TABLE "user_proxy" ADD CONSTRAINT "user_proxy_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_proxy_org_idx" ON "user_proxy" USING btree ("org_id","tier");--> statement-breakpoint

ALTER TABLE "credit_ledger" DROP CONSTRAINT "credit_ledger_user_id_user_id_fk";--> statement-breakpoint
DROP INDEX "credit_ledger_user_idx";--> statement-breakpoint
ALTER TABLE "credit_ledger" RENAME COLUMN "user_id" TO "org_id";--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "credit_ledger_org_idx" ON "credit_ledger" USING btree ("org_id","created_at");--> statement-breakpoint

ALTER TABLE "usage_event" DROP CONSTRAINT "usage_event_user_id_user_id_fk";--> statement-breakpoint
DROP INDEX "usage_event_user_time_idx";--> statement-breakpoint
ALTER TABLE "usage_event" RENAME COLUMN "user_id" TO "org_id";--> statement-breakpoint
ALTER TABLE "usage_event" ADD CONSTRAINT "usage_event_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "usage_event_org_time_idx" ON "usage_event" USING btree ("org_id","created_at" DESC NULLS LAST);--> statement-breakpoint

ALTER TABLE "crawl" DROP CONSTRAINT "crawl_user_id_user_id_fk";--> statement-breakpoint
DROP INDEX "crawl_user_idx";--> statement-breakpoint
ALTER TABLE "crawl" RENAME COLUMN "user_id" TO "org_id";--> statement-breakpoint
ALTER TABLE "crawl" ADD CONSTRAINT "crawl_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crawl_org_idx" ON "crawl" USING btree ("org_id","created_at" DESC NULLS LAST);--> statement-breakpoint

ALTER TABLE "monitor" DROP CONSTRAINT "monitor_user_id_user_id_fk";--> statement-breakpoint
DROP INDEX "monitor_user_idx";--> statement-breakpoint
ALTER TABLE "monitor" RENAME COLUMN "user_id" TO "org_id";--> statement-breakpoint
ALTER TABLE "monitor" ADD CONSTRAINT "monitor_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "monitor_org_idx" ON "monitor" USING btree ("org_id","created_at" DESC NULLS LAST);--> statement-breakpoint

ALTER TABLE "webhook_delivery" DROP CONSTRAINT "webhook_delivery_user_id_user_id_fk";--> statement-breakpoint
DROP INDEX "webhook_delivery_user_idx";--> statement-breakpoint
ALTER TABLE "webhook_delivery" RENAME COLUMN "user_id" TO "org_id";--> statement-breakpoint
ALTER TABLE "webhook_delivery" ADD CONSTRAINT "webhook_delivery_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "webhook_delivery_org_idx" ON "webhook_delivery" USING btree ("org_id","created_at" DESC NULLS LAST);--> statement-breakpoint

-- Moved to the workspace above.
ALTER TABLE "user" DROP COLUMN "credits";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "webhook_secret";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "low_balance_notified_at";
