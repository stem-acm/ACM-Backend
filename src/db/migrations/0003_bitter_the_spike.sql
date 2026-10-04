CREATE TABLE "role_policies" (
	"role" varchar(20) PRIMARY KEY NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"permissions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" varchar(20) DEFAULT 'volunteer' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
UPDATE "users" SET "role" = 'admin';--> statement-breakpoint
INSERT INTO "role_policies" ("role", "active", "permissions") VALUES
('admin', true, '{}'),
('intern', true, '{"dashboard.view":true,"members.view":true,"members.create":true,"members.update":true,"members.cards":true,"volunteers.view":true,"activities.view":true,"activities.create":true,"activities.update":true,"checkins.create":true,"checkins.view":true}'),
('volunteer', true, '{"dashboard.view":true,"members.view":true,"volunteers.view":true,"activities.view":true,"checkins.create":true}');
