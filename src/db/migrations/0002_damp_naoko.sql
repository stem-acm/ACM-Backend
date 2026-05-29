CREATE TYPE "public"."gender" AS ENUM('male', 'female');--> statement-breakpoint
CREATE TYPE "public"."title" AS ENUM('Miss', 'Mr', 'Mrs');--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "title" "title";--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "gender" "gender";