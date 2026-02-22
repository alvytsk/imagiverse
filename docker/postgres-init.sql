-- Initialize PostgreSQL extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- Enable these extensions on the search_path if needed
-- (They're global extensions in PostgreSQL 16)

-- Future: Initial schema will be managed by Drizzle migrations
-- This file serves as a foundation for bootstrap setup
