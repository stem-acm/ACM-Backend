CREATE TABLE "app_settings" (
	"key" varchar(64) PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "app_settings" ("key", "value") VALUES ('checkin_schedule', '{"monday":{"open":true,"slots":[{"start":"08:00","end":"12:00"},{"start":"15:00","end":"18:00"}]},"tuesday":{"open":true,"slots":[{"start":"08:00","end":"12:00"},{"start":"15:00","end":"18:00"}]},"wednesday":{"open":true,"slots":[{"start":"08:00","end":"12:00"},{"start":"15:00","end":"18:00"}]},"thursday":{"open":true,"slots":[{"start":"08:00","end":"12:00"},{"start":"15:00","end":"18:00"}]},"friday":{"open":true,"slots":[{"start":"08:00","end":"12:00"},{"start":"15:00","end":"18:00"}]},"saturday":{"open":true,"slots":[{"start":"09:00","end":"16:00"}]},"sunday":{"open":true,"slots":[{"start":"08:00","end":"12:00"},{"start":"15:00","end":"18:00"}]}}'::jsonb) ON CONFLICT ("key") DO NOTHING;