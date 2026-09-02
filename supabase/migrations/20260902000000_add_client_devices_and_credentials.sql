-- ============================================================================
-- Migration: Add missing client columns (password, device_ids, device_count, client_code)
-- Fixes HTTP 400 Bad Request when updating or creating clients in Admin Portal
-- ============================================================================

ALTER TABLE IF EXISTS public.clients
  ADD COLUMN IF NOT EXISTS password TEXT,
  ADD COLUMN IF NOT EXISTS device_count INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS device_ids TEXT,
  ADD COLUMN IF NOT EXISTS client_code TEXT;

-- Ensure profiles has client authentication columns
ALTER TABLE IF EXISTS public.profiles
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS company_name TEXT,
  ADD COLUMN IF NOT EXISTS client_code TEXT,
  ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- Update RLS policies to make sure update and insert are allowed
DROP POLICY IF EXISTS "clients_all" ON public.clients;
CREATE POLICY "clients_all" ON public.clients FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "profiles_all" ON public.profiles;
CREATE POLICY "profiles_all" ON public.profiles FOR ALL USING (true) WITH CHECK (true);
