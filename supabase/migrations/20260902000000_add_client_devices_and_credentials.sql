-- ============================================================================
-- Migration: Add missing client columns (password, device_ids, device_count, client_code)
-- and add 'client' & 'customer' to user_role enum
-- Fixes HTTP 400 Bad Request when updating or creating clients in Admin Portal
-- ============================================================================

-- 1. Ensure user_role enum has both 'client' and 'customer'
DO $$ BEGIN
  ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'client';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'customer';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Add missing columns to clients table
ALTER TABLE IF EXISTS public.clients
  ADD COLUMN IF NOT EXISTS password TEXT,
  ADD COLUMN IF NOT EXISTS device_count INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS device_ids TEXT,
  ADD COLUMN IF NOT EXISTS client_code TEXT;

-- 3. Ensure profiles table has client authentication columns
ALTER TABLE IF EXISTS public.profiles
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS company_name TEXT,
  ADD COLUMN IF NOT EXISTS client_code TEXT,
  ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- 4. Update RLS policies to make sure update and insert are allowed
DROP POLICY IF EXISTS "clients_all" ON public.clients;
CREATE POLICY "clients_all" ON public.clients FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "profiles_all" ON public.profiles;
CREATE POLICY "profiles_all" ON public.profiles FOR ALL USING (true) WITH CHECK (true);

