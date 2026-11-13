CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"actor_id" integer NOT NULL,
	"actor_username" varchar(255) NOT NULL,
	"actor_role" varchar(20) NOT NULL,
	"type" varchar(64) NOT NULL,
	"entity" varchar(64) NOT NULL,
	"entity_id" varchar(64) NOT NULL,
	"entity_label" varchar(1024) NOT NULL,
	"parent_entity" varchar(64),
	"parent_id" varchar(64),
	"parent_label" varchar(1024),
	"changes" jsonb NOT NULL
);
--> statement-breakpoint
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_type_idx" ON "audit_logs" USING btree ("type");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_entity_id_idx" ON "audit_logs" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_id_idx" ON "audit_logs" USING btree ("actor_id");