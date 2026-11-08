CREATE TABLE "forms" (
	"id" text PRIMARY KEY NOT NULL,
	"definition" jsonb NOT NULL,
	"reusable" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "respondents" ALTER COLUMN "email" DROP NOT NULL;