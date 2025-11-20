-- Initialize ACM database
-- This script runs automatically when PostgreSQL container is first initialized
-- Note: PostgreSQL creates the database specified in POSTGRES_DB automatically
-- This script runs after the database is created, so we're already connected to it

-- Enable UUID extension if needed (for future use)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

