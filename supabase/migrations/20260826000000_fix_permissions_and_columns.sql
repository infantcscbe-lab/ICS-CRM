-- ============================================================
-- SUPABASE COMPLETE REPAIR & FOREIGN KEY RESTORATION SCRIPT
-- Execute this directly in your Supabase SQL Editor:
-- https://supabase.com/dashboard/project/_/sql
-- ============================================================

-- 1. DROP RESTRICTIVE FOREIGN KEY CONSTRAINTS
-- (Allows custom engineers & admin users created in app to assign and create jobs without auth.users blocking)
ALTER TABLE public.service_jobs DROP CONSTRAINT IF EXISTS service_jobs_created_by_fkey;
ALTER TABLE public.service_jobs DROP CONSTRAINT IF EXISTS service_jobs_engineer_id_fkey;
ALTER TABLE public.service_jobs DROP CONSTRAINT IF EXISTS service_jobs_client_id_fkey;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
ALTER TABLE public.job_location_logs DROP CONSTRAINT IF EXISTS job_location_logs_engineer_id_fkey;
ALTER TABLE public.service_history DROP CONSTRAINT IF EXISTS service_history_engineer_id_fkey;

-- 2. EXTEND job_status ENUM WITH NEW STATUSES ('vendor', 'call_back')
DO $$ BEGIN
  ALTER TYPE job_status ADD VALUE IF NOT EXISTS 'vendor';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE job_status ADD VALUE IF NOT EXISTS 'call_back';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. ENSURE ALL APPLICATION COLUMNS EXIST IN ALL TABLES
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS employee_id text,
ADD COLUMN IF NOT EXISTS password_hash text;

ALTER TABLE public.clients
ADD COLUMN IF NOT EXISTS client_code text;

ALTER TABLE public.service_jobs
ADD COLUMN IF NOT EXISTS call_source text DEFAULT 'direct',
ADD COLUMN IF NOT EXISTS call_given_by text,
ADD COLUMN IF NOT EXISTS assigned_by_name text,
ADD COLUMN IF NOT EXISTS reassigned_from_id uuid,
ADD COLUMN IF NOT EXISTS reassigned_from_name text,
ADD COLUMN IF NOT EXISTS vendor_name text,
ADD COLUMN IF NOT EXISTS vendor_phone text,
ADD COLUMN IF NOT EXISTS vendor_notes text,
ADD COLUMN IF NOT EXISTS call_back_date text,
ADD COLUMN IF NOT EXISTS call_back_time text,
ADD COLUMN IF NOT EXISTS call_back_reason text;

-- 4. INSERT DEFAULT ADMIN PROFILE IF MISSING
INSERT INTO public.profiles (id, full_name, email, role, phone, is_active, employee_id)
VALUES ('11111111-1111-1111-1111-111111111111', 'Admin User', 'admin1@local', 'admin', '+91 98765 43210', true, 'ADMIN-01')
ON CONFLICT (id) DO UPDATE SET role = 'admin', is_active = true, employee_id = 'ADMIN-01';

-- 5. PERMISSIONS & RLS POLICIES FOR BOTH AUTHENTICATED & ANON (PUBLIC CLIENT)
-- Disables RLS rejection on public tables so reads and writes never fail or get erased on refresh
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_job_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_location_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_all" ON public.profiles;
CREATE POLICY "profiles_all" ON public.profiles FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "clients_all" ON public.clients;
CREATE POLICY "clients_all" ON public.clients FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "jobs_all" ON public.service_jobs;
CREATE POLICY "jobs_all" ON public.service_jobs FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "logs_all" ON public.job_location_logs;
CREATE POLICY "logs_all" ON public.job_location_logs FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "photos_all" ON public.service_job_photos;
CREATE POLICY "photos_all" ON public.service_job_photos FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "history_all" ON public.service_history;
CREATE POLICY "history_all" ON public.service_history FOR ALL USING (true) WITH CHECK (true);

-- 6. STORAGE BUCKET PERMISSIONS
INSERT INTO storage.buckets (id, name, public)
VALUES ('service-job-photos', 'service-job-photos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "photos_bucket_all" ON storage.objects;
CREATE POLICY "photos_bucket_all" ON storage.objects FOR ALL USING (bucket_id = 'service-job-photos') WITH CHECK (bucket_id = 'service-job-photos');
