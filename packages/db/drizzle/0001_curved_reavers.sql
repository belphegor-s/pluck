CREATE TYPE "public"."proxy_tier" AS ENUM('datacenter', 'residential');--> statement-breakpoint
CREATE TABLE "user_proxy" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"label" text NOT NULL,
	"tier" "proxy_tier" NOT NULL,
	"encrypted_url" text NOT NULL,
	"url_hint" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"failures" integer DEFAULT 0 NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_proxy" ADD CONSTRAINT "user_proxy_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_proxy_user_idx" ON "user_proxy" USING btree ("user_id","tier");