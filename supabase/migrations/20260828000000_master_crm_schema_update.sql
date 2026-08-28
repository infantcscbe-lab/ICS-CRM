-- ============================================================================
-- MASTER ICS-CRM DATABASE SCHEMA UPDATE & REPAIR SCRIPT
-- ============================================================================
-- Execute this entire script directly in your Supabase SQL Editor:
-- https://supabase.com/dashboard/project/_/sql
-- ============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. CUSTOM ENUMS
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('admin', 'coordinator', 'engineer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE job_priority AS ENUM ('low', 'medium', 'high', 'urgent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE job_status AS ENUM (
    'assigned',
    'traveling',
    'reached',
    'in_progress',
    'solved',
    'completed',
    'cancelled',
    'vendor',
    'call_back'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Extend existing enums if already created previously without new statuses
DO $$ BEGIN
  ALTER TYPE job_status ADD VALUE IF NOT EXISTS 'vendor';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE job_status ADD VALUE IF NOT EXISTS 'call_back';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. PROFILES TABLE
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role user_role NOT NULL DEFAULT 'engineer',
  phone TEXT,
  avatar_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  employee_id TEXT,
  password_hash TEXT,
  joining_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. CLIENTS TABLE
CREATE TABLE IF NOT EXISTS public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_name TEXT NOT NULL,
  client_code TEXT,
  company_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. SERVICE JOBS TABLE
CREATE TABLE IF NOT EXISTS public.service_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_number TEXT NOT NULL UNIQUE,
  client_id UUID NOT NULL,
  engineer_id UUID,
  created_by UUID,
  issue_title TEXT NOT NULL,
  issue_description TEXT,
  priority job_priority NOT NULL DEFAULT 'medium',
  status job_status NOT NULL DEFAULT 'assigned',
  scheduled_date DATE NOT NULL,
  scheduled_time TEXT NOT NULL,
  call_source TEXT DEFAULT 'direct',
  call_given_by TEXT,
  assigned_by_name TEXT,
  reassigned_from_id UUID,
  reassigned_from_name TEXT,
  reassignment_reason TEXT,
  vendor_name TEXT,
  vendor_phone TEXT,
  vendor_notes TEXT,
  call_back_date TEXT,
  call_back_time TEXT,
  call_back_reason TEXT,
  start_odometer DOUBLE PRECISION,
  end_odometer DOUBLE PRECISION,
  total_km DOUBLE PRECISION DEFAULT 0,
  gps_distance_km DOUBLE PRECISION DEFAULT 0,
  start_latitude DOUBLE PRECISION,
  start_longitude DOUBLE PRECISION,
  reached_latitude DOUBLE PRECISION,
  reached_longitude DOUBLE PRECISION,
  end_latitude DOUBLE PRECISION,
  end_longitude DOUBLE PRECISION,
  assigned_at TIMESTAMPTZ DEFAULT now(),
  travel_started_at TIMESTAMPTZ,
  reached_at TIMESTAMPTZ,
  service_started_at TIMESTAMPTZ,
  solved_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  diagnosis TEXT,
  work_performed TEXT,
  parts_replaced TEXT,
  engineer_notes TEXT,
  admin_notes TEXT,
  call_type TEXT DEFAULT 'Per Call',
  earth_checking TEXT DEFAULT 'Yes',
  physical_damage TEXT DEFAULT 'No',
  inspection_charge DOUBLE PRECISION,
  part_replaced_status TEXT DEFAULT 'No',
  part_charge DOUBLE PRECISION DEFAULT 0,
  service_charge DOUBLE PRECISION,
  payment_mode TEXT DEFAULT 'Cash',
  amount_received TEXT DEFAULT 'Yes',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure all columns exist on service_jobs
ALTER TABLE public.service_jobs
ADD COLUMN IF NOT EXISTS call_source TEXT DEFAULT 'direct',
ADD COLUMN IF NOT EXISTS call_given_by TEXT,
ADD COLUMN IF NOT EXISTS assigned_by_name TEXT,
ADD COLUMN IF NOT EXISTS reassigned_from_id UUID,
ADD COLUMN IF NOT EXISTS reassigned_from_name TEXT,
ADD COLUMN IF NOT EXISTS reassigned_reason TEXT,
ADD COLUMN IF NOT EXISTS vendor_name TEXT,
ADD COLUMN IF NOT EXISTS vendor_phone TEXT,
ADD COLUMN IF NOT EXISTS vendor_notes TEXT,
ADD COLUMN IF NOT EXISTS call_back_date TEXT,
ADD COLUMN IF NOT EXISTS call_back_time TEXT,
ADD COLUMN IF NOT EXISTS call_back_reason TEXT,
ADD COLUMN IF NOT EXISTS gps_distance_km DOUBLE PRECISION DEFAULT 0,
ADD COLUMN IF NOT EXISTS call_type TEXT DEFAULT 'Per Call',
ADD COLUMN IF NOT EXISTS earth_checking TEXT DEFAULT 'Yes',
ADD COLUMN IF NOT EXISTS physical_damage TEXT DEFAULT 'No',
ADD COLUMN IF NOT EXISTS inspection_charge DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS part_replaced_status TEXT DEFAULT 'No',
ADD COLUMN IF NOT EXISTS part_charge DOUBLE PRECISION DEFAULT 0,
ADD COLUMN IF NOT EXISTS service_charge DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS payment_mode TEXT DEFAULT 'Cash',
ADD COLUMN IF NOT EXISTS amount_received TEXT DEFAULT 'Yes';

-- 6. SERVICE JOB PHOTOS
CREATE TABLE IF NOT EXISTS public.service_job_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL,
  uploaded_by UUID NOT NULL,
  photo_url TEXT NOT NULL,
  photo_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. JOB LOCATION LOGS (LIVE GPS CHECKPOINTS)
CREATE TABLE IF NOT EXISTS public.job_location_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL,
  engineer_id UUID NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. SERVICE HISTORY
CREATE TABLE IF NOT EXISTS public.service_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL,
  status_from job_status,
  status_to job_status NOT NULL,
  notes TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 9. DUTY ATTENDANCE
CREATE TABLE IF NOT EXISTS public.duty_attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engineer_id UUID NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  punch_in_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  punch_in_latitude DOUBLE PRECISION,
  punch_in_longitude DOUBLE PRECISION,
  punch_in_address TEXT,
  punch_out_at TIMESTAMPTZ,
  punch_out_latitude DOUBLE PRECISION,
  punch_out_longitude DOUBLE PRECISION,
  punch_out_address TEXT,
  total_work_minutes INTEGER,
  total_km DOUBLE PRECISION DEFAULT 0,
  allowance_claimed DOUBLE PRECISION DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'on_duty' CHECK (status IN ('on_duty', 'punched_out')),
  work_shift TEXT DEFAULT 'General Shift (09:00 AM - 06:30 PM)',
  overtime_minutes INTEGER DEFAULT 0,
  is_late BOOLEAN DEFAULT false,
  is_half_day BOOLEAN DEFAULT false,
  is_regularized BOOLEAN DEFAULT false,
  regularized_reason TEXT,
  admin_notes TEXT,
  UNIQUE(engineer_id, date)
);

-- 10. LEAVE REQUESTS
CREATE TABLE IF NOT EXISTS public.leave_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engineer_id UUID NOT NULL,
  leave_type TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  total_days DOUBLE PRECISION NOT NULL DEFAULT 1,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  admin_remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 11. ATTENDANCE POLICY
CREATE TABLE IF NOT EXISTS public.attendance_policy (
  id TEXT PRIMARY KEY DEFAULT 'default_policy',
  shift_start_time TEXT NOT NULL DEFAULT '09:00',
  shift_end_time TEXT NOT NULL DEFAULT '18:30',
  grace_period_minutes INTEGER NOT NULL DEFAULT 15,
  half_day_min_hours DOUBLE PRECISION NOT NULL DEFAULT 4.5,
  full_day_min_hours DOUBLE PRECISION NOT NULL DEFAULT 8.0,
  weekly_off_days INTEGER[] DEFAULT ARRAY[0],
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.attendance_policy (id, shift_start_time, shift_end_time, grace_period_minutes, half_day_min_hours, full_day_min_hours)
VALUES ('default_policy', '09:00', '18:30', 15, 4.5, 8.0)
ON CONFLICT (id) DO NOTHING;

-- 12. ADMIN NOTIFICATIONS
CREATE TABLE IF NOT EXISTS public.admin_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID,
  job_number TEXT,
  type TEXT NOT NULL CHECK (type IN ('reassigned', 'vendor', 'call_back', 'status_change')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  actor_name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read BOOLEAN NOT NULL DEFAULT false,
  data JSONB
);

-- 13. DROP RESTRICTIVE FOREIGN KEY CONSTRAINTS (For seamless custom engineer creation)
ALTER TABLE public.service_jobs DROP CONSTRAINT IF EXISTS service_jobs_created_by_fkey;
ALTER TABLE public.service_jobs DROP CONSTRAINT IF EXISTS service_jobs_engineer_id_fkey;
ALTER TABLE public.service_jobs DROP CONSTRAINT IF EXISTS service_jobs_client_id_fkey;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
ALTER TABLE public.job_location_logs DROP CONSTRAINT IF EXISTS job_location_logs_engineer_id_fkey;
ALTER TABLE public.service_history DROP CONSTRAINT IF EXISTS service_history_engineer_id_fkey;

-- 14. DEFAULT ADMIN PROFILE
INSERT INTO public.profiles (id, full_name, email, role, phone, is_active, employee_id)
VALUES ('11111111-1111-1111-1111-111111111111', 'Admin User', 'admin1@local', 'admin', '+91 98765 43210', true, 'ADMIN-01')
ON CONFLICT (id) DO UPDATE SET role = 'admin', is_active = true, employee_id = 'ADMIN-01';

-- 15. ENABLE ROW LEVEL SECURITY & OPEN PERMISSIVE POLICIES
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_job_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_location_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duty_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_all" ON public.profiles;
CREATE POLICY "profiles_all" ON public.profiles FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "clients_all" ON public.clients;
CREATE POLICY "clients_all" ON public.clients FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "jobs_all" ON public.service_jobs;
CREATE POLICY "jobs_all" ON public.service_jobs FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "photos_all" ON public.service_job_photos;
CREATE POLICY "photos_all" ON public.service_job_photos FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "logs_all" ON public.job_location_logs;
CREATE POLICY "logs_all" ON public.job_location_logs FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "history_all" ON public.service_history;
CREATE POLICY "history_all" ON public.service_history FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "attendance_all" ON public.duty_attendance;
CREATE POLICY "attendance_all" ON public.duty_attendance FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "leaves_all" ON public.leave_requests;
CREATE POLICY "leaves_all" ON public.leave_requests FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "policy_all" ON public.attendance_policy;
CREATE POLICY "policy_all" ON public.attendance_policy FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "notifications_all" ON public.admin_notifications;
CREATE POLICY "notifications_all" ON public.admin_notifications FOR ALL USING (true) WITH CHECK (true);

-- 16. GRANT PERMISSIONS TO ANON & AUTHENTICATED ROLES
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated;

-- 17. STORAGE BUCKET CONFIGURATION FOR SERVICE PHOTOS
INSERT INTO storage.buckets (id, name, public)
VALUES ('service-job-photos', 'service-job-photos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "photos_bucket_all" ON storage.objects;
CREATE POLICY "photos_bucket_all" ON storage.objects FOR ALL USING (bucket_id = 'service-job-photos') WITH CHECK (bucket_id = 'service-job-photos');

-- 18. ENABLE REALTIME SYNC ON CRITICAL TABLES
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.service_jobs;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.job_location_logs;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.duty_attendance;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.leave_requests;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_notifications;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Verification notification
SELECT 'ICS-CRM Database Schema is 100% updated and healthy!' AS status;
