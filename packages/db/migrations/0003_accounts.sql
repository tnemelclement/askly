CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"plan" text DEFAULT 'trial' NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"stripe_customer_id" text,
	"subscription_status" text,
	"api_token_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_email_unique" UNIQUE("email"),
	CONSTRAINT "accounts_stripeCustomerId_unique" UNIQUE("stripe_customer_id"),
	CONSTRAINT "accounts_apiTokenHash_unique" UNIQUE("api_token_hash")
);
--> statement-breakpoint
-- Les données existantes vont à un compte « propriétaire » d'id fixe, que le démarrage de l'API
-- rattache ensuite à ADMIN_EMAIL / ADMIN_PASSWORD (voir ensureOwner).
INSERT INTO "accounts" ("id", "email", "password_hash", "plan")
  SELECT '00000000-0000-0000-0000-000000000001', 'owner@localhost', '', 'unlimited'
  WHERE EXISTS (SELECT 1 FROM "forms") OR EXISTS (SELECT 1 FROM "respondents") OR EXISTS (SELECT 1 FROM "files");--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "account_id" uuid;--> statement-breakpoint
ALTER TABLE "forms" ADD COLUMN "account_id" uuid;--> statement-breakpoint
ALTER TABLE "respondents" ADD COLUMN "account_id" uuid;--> statement-breakpoint
UPDATE "files" SET "account_id" = '00000000-0000-0000-0000-000000000001';--> statement-breakpoint
UPDATE "forms" SET "account_id" = '00000000-0000-0000-0000-000000000001';--> statement-breakpoint
UPDATE "respondents" SET "account_id" = '00000000-0000-0000-0000-000000000001';--> statement-breakpoint
ALTER TABLE "files" ALTER COLUMN "account_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "forms" ALTER COLUMN "account_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "respondents" ALTER COLUMN "account_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "forms" DROP CONSTRAINT "forms_pkey";--> statement-breakpoint
ALTER TABLE "forms" ADD CONSTRAINT "forms_account_id_id_pk" PRIMARY KEY("account_id","id");--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forms" ADD CONSTRAINT "forms_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "respondents" ADD CONSTRAINT "respondents_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;
