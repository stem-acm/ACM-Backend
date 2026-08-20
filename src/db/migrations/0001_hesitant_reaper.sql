ALTER TABLE "checkins" DROP CONSTRAINT IF EXISTS "checkins_member_id_members_id_fk";--> statement-breakpoint
ALTER TABLE "volunteers" DROP CONSTRAINT IF EXISTS "volunteers_member_id_members_id_fk";--> statement-breakpoint
UPDATE "members" SET "registration_number" = CAST("id" AS varchar);--> statement-breakpoint
ALTER TABLE "members" DROP CONSTRAINT IF EXISTS "members_registration_number_unique";--> statement-breakpoint
ALTER TABLE "members" DROP CONSTRAINT IF EXISTS "members_pkey";--> statement-breakpoint
ALTER TABLE "members" ALTER COLUMN "registration_number" TYPE integer USING "registration_number"::integer;--> statement-breakpoint
ALTER TABLE "members" DROP COLUMN IF EXISTS "id";--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS members_registration_number_seq;--> statement-breakpoint
ALTER TABLE "members" ALTER COLUMN "registration_number" SET DEFAULT nextval('members_registration_number_seq');--> statement-breakpoint
ALTER SEQUENCE members_registration_number_seq OWNED BY "members"."registration_number";--> statement-breakpoint
SELECT setval('members_registration_number_seq', COALESCE((SELECT MAX(registration_number) FROM "members"), 0) + 1, false);--> statement-breakpoint
ALTER TABLE "members" ADD PRIMARY KEY ("registration_number");--> statement-breakpoint
ALTER TABLE "checkins" RENAME COLUMN "member_id" TO "registration_number";--> statement-breakpoint
ALTER TABLE "volunteers" RENAME COLUMN "member_id" TO "registration_number";--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_registration_number_members_registration_number_fk" FOREIGN KEY ("registration_number") REFERENCES "public"."members"("registration_number") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "volunteers" ADD CONSTRAINT "volunteers_registration_number_members_registration_number_fk" FOREIGN KEY ("registration_number") REFERENCES "public"."members"("registration_number") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ALTER COLUMN "last_name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "volunteers" ADD COLUMN IF NOT EXISTS "role" varchar(255);