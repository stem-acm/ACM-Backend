CREATE TYPE "public"."day_of_week" AS ENUM('tuesday', 'wednesday', 'thursday', 'friday', 'saturday');--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "emoji" varchar(10);--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "is_periodic" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "day_of_week" "day_of_week";--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "start_time" time NOT NULL;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "end_time" time NOT NULL;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "start_date" date;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "end_date" date;--> statement-breakpoint
ALTER TABLE "activities" DROP COLUMN "is_active";