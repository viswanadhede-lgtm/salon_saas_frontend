-- ============================================================================
-- Migration: 20261111000001_grant_direct_api_access_to_schemas.sql
-- Description: Expose app, shared, and platform schemas to PostgREST API
--              and grant full API permissions to anon, authenticated, service_role.
-- ============================================================================

-- 1. Expose schemas to PostgREST authenticator role
ALTER ROLE authenticator SET pgrst.db_schemas = 'public, app, shared, platform';

-- 2. Grant USAGE on schemas
GRANT USAGE ON SCHEMA app, shared, platform TO anon, authenticated, service_role;

-- 3. Grant access to all tables, sequences, routines
GRANT ALL ON ALL TABLES IN SCHEMA app, shared, platform TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA app, shared, platform TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA app, shared, platform TO anon, authenticated, service_role;

-- 4. Default privileges for future objects
ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA shared GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA platform GRANT ALL ON TABLES TO anon, authenticated, service_role;

-- 5. Reload PostgREST schema cache
NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';

