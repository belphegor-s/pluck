CREATE TABLE "admin_audit" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"session_id" text,
	"action" text NOT NULL,
	"detail" jsonb,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_challenge" (
	"id" text PRIMARY KEY NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"ip" text,
	"user_agent" text,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_session" (
	"id" text PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"ip" text,
	"user_agent" text,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_session_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE INDEX "admin_audit_time_idx" ON "admin_audit" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "admin_audit_action_ip_idx" ON "admin_audit" USING btree ("action","ip","created_at");--> statement-breakpoint
/*
  The admin SQL editor runs every statement as this role (SET LOCAL ROLE), so
  Postgres itself, not a pattern list, keeps it to reading and writing rows:
  no superuser powers, no files or programs, no DDL on tables it does not own,
  no TRUNCATE, and no changes to the admin audit trail. Creating a role needs
  CREATEROLE; where the migrating user lacks it, this is skipped and the editor
  refuses to run (it fails closed).
*/
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'pluck_admin_sql') THEN
    CREATE ROLE pluck_admin_sql NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
  GRANT pluck_admin_sql TO CURRENT_USER;
  GRANT USAGE ON SCHEMA public TO pluck_admin_sql;
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO pluck_admin_sql;
  GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO pluck_admin_sql;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO pluck_admin_sql;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO pluck_admin_sql;
  REVOKE INSERT, UPDATE, DELETE ON admin_audit, admin_session, admin_challenge FROM pluck_admin_sql;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'pluck_admin_sql not created: the migrating user cannot create roles. The admin SQL editor stays disabled.';
END $$;
