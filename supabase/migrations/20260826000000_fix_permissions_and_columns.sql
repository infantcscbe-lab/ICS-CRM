-- ============================================================
-- SUPABASE COMPLETE COMPATIBILITY & RLS PERMISSIONS FIX
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard)
-- ============================================================

-- 1. EXTEND job_status ENUM WITH NEW STATUSES (vendor, call_back)
DO $$ BEGIN
  ALTER TYPE job_status ADD VALUE IF NOT EXISTS 'vendor';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE job_status ADD VALUE IF NOT EXISTS 'call_back';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. ADD NEW FIELDS TO service_jobs TABLE
ALTER TABLE public.service_jobs
ADD COLUMN IF NOT EXISTS call_source text DEFAULT 'direct',
ADD COLUMN IF NOT EXISTS call_given_by text,
ADD COLUMN IF NOT EXISTS assigned_by_name text,
ADD COLUMN IF NOT EXISTS reassigned_from_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS reassigned_from_name text,
ADD COLUMN IF NOT EXISTS vendor_name text,
ADD COLUMN IF NOT EXISTS vendor_phone text,
ADD COLUMN IF NOT EXISTS vendor_notes text,
ADD COLUMN IF NOT EXISTS call_back_date text,
ADD COLUMN IF NOT EXISTS call_back_time text,
ADD COLUMN IF NOT EXISTS call_back_reason text;

-- 3. PROFILES: ALLOW DIRECT INSERT/UPDATE (Fix engineer creation via admin panel)
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;

-- 4. PERMISSIONS & RLS POLICIES FOR BOTH AUTHENTICATED & ANON CLIENTS
-- (Ensures both web app clients and engineers can read & write smoothly)

DROP POLICY IF EXISTS "profiles_select_all" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_all" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_all" ON public.profiles;
DROP POLICY IF EXISTS "profiles_delete_all" ON public.profiles;
CREATE POLICY "profiles_select_all" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "profiles_insert_all" ON public.profiles FOR INSERT WITH CHECK (true);
CREATE POLICY "profiles_update_all" ON public.profiles FOR UPDATE USING (true);
CREATE POLICY "profiles_delete_all" ON public.profiles FOR DELETE USING (true);

DROP POLICY IF EXISTS "clients_select_all" ON public.clients;
DROP POLICY IF EXISTS "clients_insert_all" ON public.clients;
DROP POLICY IF EXISTS "clients_update_all" ON public.clients;
DROP POLICY IF EXISTS "clients_delete_all" ON public.clients;
CREATE POLICY "clients_select_all" ON public.clients FOR SELECT USING (true);
CREATE POLICY "clients_insert_all" ON public.clients FOR INSERT WITH CHECK (true);
CREATE POLICY "clients_update_all" ON public.clients FOR UPDATE USING (true);
CREATE POLICY "clients_delete_all" ON public.clients FOR DELETE USING (true);

DROP POLICY IF EXISTS "jobs_select_all" ON public.service_jobs;
DROP POLICY IF EXISTS "jobs_insert_all" ON public.service_jobs;
DROP POLICY IF EXISTS "jobs_update_all" ON public.service_jobs;
DROP POLICY IF EXISTS "jobs_delete_all" ON public.service_jobs;
CREATE POLICY "jobs_select_all" ON public.service_jobs FOR SELECT USING (true);
CREATE POLICY "jobs_insert_all" ON public.service_jobs FOR INSERT WITH CHECK (true);
CREATE POLICY "jobs_update_all" ON public.service_jobs FOR UPDATE USING (true);
CREATE POLICY "jobs_delete_all" ON public.service_jobs FOR DELETE USING (true);

DROP POLICY IF EXISTS "logs_select_all" ON public.job_location_logs;
DROP POLICY IF EXISTS "logs_insert_all" ON public.job_location_logs;
CREATE POLICY "logs_select_all" ON public.job_location_logs FOR SELECT USING (true);
CREATE POLICY "logs_insert_all" ON public.job_location_logs FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "photos_select_all" ON public.service_job_photos;
DROP POLICY IF EXISTS "photos_insert_all" ON public.service_job_photos;
CREATE POLICY "photos_select_all" ON public.service_job_photos FOR SELECT USING (true);
CREATE POLICY "photos_insert_all" ON public.service_job_photos FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "history_select_all" ON public.service_history;
DROP POLICY IF EXISTS "history_insert_all" ON public.service_history;
CREATE POLICY "history_select_all" ON public.service_history FOR SELECT USING (true);
CREATE POLICY "history_insert_all" ON public.service_history FOR INSERT WITH CHECK (true);

-- 5. STORAGE BUCKET PERMISSIONS
INSERT INTO storage.buckets (id, name, public)
VALUES ('service-job-photos', 'service-job-photos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "photos_bucket_select_all" ON storage.objects;
CREATE POLICY "photos_bucket_select_all" ON storage.objects FOR SELECT USING (bucket_id = 'service-job-photos');

DROP POLICY IF EXISTS "photos_bucket_insert_all" ON storage.objects;
CREATE POLICY "photos_bucket_insert_all" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'service-job-photos');
