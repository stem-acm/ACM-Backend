-- The time zone of the app: check-in times and opening hours are read in this zone.
INSERT INTO "app_settings" ("key", "value") VALUES ('timezone', '"Indian/Antananarivo"'::jsonb) ON CONFLICT ("key") DO NOTHING;
