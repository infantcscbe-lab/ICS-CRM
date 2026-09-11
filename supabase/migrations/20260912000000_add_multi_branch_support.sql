-- ============================================================================
-- ICS-CRM Multi-Branch Partitioning & Role Setup Migration
-- Execute this entire script directly in your Supabase SQL Editor:
-- https://supabase.com/dashboard/project/_/sql
-- ============================================================================

-- 1. Ensure user_role ENUM supports coordinators & sales executives
DO $$ 
BEGIN 
  ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'coordinator'; 
EXCEPTION 
  WHEN duplicate_object THEN NULL; 
  WHEN undefined_object THEN NULL; 
END $$;

DO $$ 
BEGIN 
  ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'service_coordinator'; 
EXCEPTION 
  WHEN duplicate_object THEN NULL; 
  WHEN undefined_object THEN NULL; 
END $$;

DO $$ 
BEGIN 
  ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'sales_executive'; 
EXCEPTION 
  WHEN duplicate_object THEN NULL; 
  WHEN undefined_object THEN NULL; 
END $$;

-- 2. Add branch column to profiles
ALTER TABLE IF EXISTS public.profiles
ADD COLUMN IF NOT EXISTS branch TEXT DEFAULT 'cbe';

UPDATE public.profiles
SET branch = 'cbe'
WHERE branch IS NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_branch ON public.profiles(branch);

-- 3. Add branch column to service_jobs
ALTER TABLE IF EXISTS public.service_jobs
ADD COLUMN IF NOT EXISTS branch TEXT DEFAULT 'cbe';

UPDATE public.service_jobs
SET branch = 'cbe'
WHERE branch IS NULL;

CREATE INDEX IF NOT EXISTS idx_service_jobs_branch ON public.service_jobs(branch);

-- 4. Add branch column to clients
ALTER TABLE IF EXISTS public.clients
ADD COLUMN IF NOT EXISTS branch TEXT DEFAULT 'cbe';

UPDATE public.clients
SET branch = 'cbe'
WHERE branch IS NULL;

CREATE INDEX IF NOT EXISTS idx_clients_branch ON public.clients(branch);

-- 5. Add branch column to leads
ALTER TABLE IF EXISTS public.leads
ADD COLUMN IF NOT EXISTS branch TEXT DEFAULT 'cbe';

UPDATE public.leads
SET branch = 'cbe'
WHERE branch IS NULL;

CREATE INDEX IF NOT EXISTS idx_leads_branch ON public.leads(branch);

-- 6. Add branch column to duty_attendance
ALTER TABLE IF EXISTS public.duty_attendance
ADD COLUMN IF NOT EXISTS branch TEXT DEFAULT 'cbe';

UPDATE public.duty_attendance
SET branch = 'cbe'
WHERE branch IS NULL;

CREATE INDEX IF NOT EXISTS idx_duty_attendance_branch ON public.duty_attendance(branch);

-- 7. Create branches table for shared branch office management
CREATE TABLE IF NOT EXISTS public.branches (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  label TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'Tamil Nadu',
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Seed initial branch offices
INSERT INTO public.branches (id, name, code, label, state, is_default)
VALUES 
  ('cbe', 'Coimbatore', 'CBE', 'Coimbatore', 'Tamil Nadu', true),
  ('chennai', 'Chennai', 'CHN', 'Chennai', 'Tamil Nadu', false),
  ('tirupur', 'Tirupur', 'TPR', 'Tirupur', 'Tamil Nadu', false),
  ('salem', 'Salem', 'SLM', 'Salem', 'Tamil Nadu', false),
  ('bengaluru', 'Bengaluru', 'BLR', 'Bengaluru', 'Karnataka', false),
  ('madurai', 'Madurai', 'MDU', 'Madurai', 'Tamil Nadu', false),
  ('trichy', 'Trichy', 'TRY', 'Trichy', 'Tamil Nadu', false),
  ('pollachi', 'Pollachi', 'POL', 'Pollachi', 'Tamil Nadu', false),
  ('erode', 'Erode', 'ERD', 'Erode', 'Tamil Nadu', false)
ON CONFLICT (id) DO NOTHING;

-- RLS Policies for branches table
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read branches to all" ON public.branches;
CREATE POLICY "Allow read branches to all" ON public.branches FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow insert branches to authenticated" ON public.branches;
CREATE POLICY "Allow insert branches to authenticated" ON public.branches FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update branches to authenticated" ON public.branches;
CREATE POLICY "Allow update branches to authenticated" ON public.branches FOR UPDATE TO authenticated USING (true);
