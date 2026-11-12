ALTER TABLE "forms" ADD COLUMN "public_token" text;--> statement-breakpoint
ALTER TABLE "forms" ADD CONSTRAINT "forms_publicToken_unique" UNIQUE("public_token");