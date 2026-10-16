CREATE TABLE "book_loans" (
	"id" serial PRIMARY KEY NOT NULL,
	"registration_number" integer NOT NULL,
	"book_title" varchar(255) NOT NULL,
	"borrowing_date" date NOT NULL,
	"expected_return_date" date NOT NULL,
	"effective_return_date" date,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "book_loans" ADD CONSTRAINT "book_loans_registration_number_members_registration_number_fk" FOREIGN KEY ("registration_number") REFERENCES "public"."members"("registration_number") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_loans" ADD CONSTRAINT "book_loans_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;