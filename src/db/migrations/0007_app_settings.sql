CREATE TABLE "app_settings" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"timezone" varchar(64) DEFAULT 'Indian/Antananarivo' NOT NULL,
	"checkin_schedule" jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "app_settings_single_row" CHECK ("app_settings"."id" = 1)
);
--> statement-breakpoint
INSERT INTO "app_settings" ("id", "checkin_schedule") VALUES (1, '{"monday":{"open":true,"slots":[{"start":"08:00","end":"12:00"},{"start":"15:00","end":"18:00"}]},"tuesday":{"open":true,"slots":[{"start":"08:00","end":"12:00"},{"start":"15:00","end":"18:00"}]},"wednesday":{"open":true,"slots":[{"start":"08:00","end":"12:00"},{"start":"15:00","end":"18:00"}]},"thursday":{"open":true,"slots":[{"start":"08:00","end":"12:00"},{"start":"15:00","end":"18:00"}]},"friday":{"open":true,"slots":[{"start":"08:00","end":"12:00"},{"start":"15:00","end":"18:00"}]},"saturday":{"open":true,"slots":[{"start":"09:00","end":"16:00"}]},"sunday":{"open":true,"slots":[{"start":"08:00","end":"12:00"},{"start":"15:00","end":"18:00"}]}}'::jsonb) ON CONFLICT ("id") DO NOTHING;
