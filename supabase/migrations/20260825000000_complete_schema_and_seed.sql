-- ============================================================
-- 100% SUPABASE COMPLIANT RESTORATION & SEED SCRIPT
-- Service Engineer Management System
-- ============================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. DROP EXISTING OBJECTS (SAFE CLEAN SLATE)
DO $$ BEGIN
  DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DROP TABLE IF EXISTS public.service_history CASCADE;
DROP TABLE IF EXISTS public.job_location_logs CASCADE;
DROP TABLE IF EXISTS public.service_job_photos CASCADE;
DROP TABLE IF EXISTS public.service_jobs CASCADE;
DROP TABLE IF EXISTS public.clients CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

DROP FUNCTION IF EXISTS public.create_service_history_on_complete() CASCADE;
DROP FUNCTION IF EXISTS public.generate_job_number() CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.set_updated_at() CASCADE;

-- 3. CUSTOM ENUMS
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('admin', 'engineer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE job_status AS ENUM ('assigned', 'traveling', 'reached', 'in_progress', 'solved', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE job_priority AS ENUM ('low', 'medium', 'high', 'urgent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE photo_type AS ENUM ('before', 'after', 'other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 4. PROFILES TABLE
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  role user_role NOT NULL DEFAULT 'engineer',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 5. CLIENTS TABLE
CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_name text NOT NULL,
  company_name text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  latitude double precision,
  longitude double precision,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 6. SERVICE JOBS TABLE
CREATE TABLE public.service_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_number text UNIQUE NOT NULL,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  engineer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  issue_title text NOT NULL,
  issue_description text NOT NULL DEFAULT '',
  priority job_priority NOT NULL DEFAULT 'medium',
  status job_status NOT NULL DEFAULT 'assigned',
  scheduled_date date NOT NULL DEFAULT CURRENT_DATE,
  scheduled_time text NOT NULL DEFAULT '',
  assigned_at timestamptz,
  travel_started_at timestamptz,
  reached_at timestamptz,
  service_started_at timestamptz,
  solved_at timestamptz,
  completed_at timestamptz,
  start_latitude double precision,
  start_longitude double precision,
  reached_latitude double precision,
  reached_longitude double precision,
  end_latitude double precision,
  end_longitude double precision,
  start_odometer numeric(12,2),
  end_odometer numeric(12,2),
  total_km numeric(12,2),
  gps_distance_km numeric(12,2),
  diagnosis text NOT NULL DEFAULT '',
  work_performed text NOT NULL DEFAULT '',
  parts_replaced text NOT NULL DEFAULT '',
  engineer_notes text NOT NULL DEFAULT '',
  admin_notes text NOT NULL DEFAULT '',
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 7. SERVICE JOB PHOTOS TABLE
CREATE TABLE public.service_job_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.service_jobs(id) ON DELETE CASCADE,
  photo_url text NOT NULL,
  photo_type photo_type NOT NULL DEFAULT 'other',
  uploaded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 8. JOB LOCATION LOGS TABLE
CREATE TABLE public.job_location_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.service_jobs(id) ON DELETE CASCADE,
  engineer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

-- 9. SERVICE HISTORY TABLE
CREATE TABLE public.service_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.service_jobs(id) ON DELETE CASCADE,
  engineer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  issue text NOT NULL DEFAULT '',
  solution text NOT NULL DEFAULT '',
  service_date timestamptz,
  notes text NOT NULL DEFAULT '',
  total_km numeric(12,2),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 10. INDEXES
CREATE INDEX idx_service_jobs_engineer ON public.service_jobs(engineer_id);
CREATE INDEX idx_service_jobs_client ON public.service_jobs(client_id);
CREATE INDEX idx_service_jobs_status ON public.service_jobs(status);
CREATE INDEX idx_service_jobs_scheduled_date ON public.service_jobs(scheduled_date);
CREATE INDEX idx_service_jobs_job_number ON public.service_jobs(job_number);

CREATE INDEX idx_service_job_photos_job ON public.service_job_photos(job_id);
CREATE INDEX idx_job_location_logs_job ON public.job_location_logs(job_id);
CREATE INDEX idx_job_location_logs_engineer ON public.job_location_logs(engineer_id);
CREATE INDEX idx_job_location_logs_recorded ON public.job_location_logs(recorded_at);
CREATE INDEX idx_service_history_client ON public.service_history(client_id);
CREATE INDEX idx_service_history_engineer ON public.service_history(engineer_id);

-- 11. FUNCTIONS & TRIGGERS
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_clients_updated BEFORE UPDATE ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_service_jobs_updated BEFORE UPDATE ON public.service_jobs
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-create profile upon auth.users signup
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.email, ''),
    COALESCE((NEW.raw_app_meta_data->>'role')::user_role, 'engineer')
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = CASE WHEN public.profiles.full_name = '' THEN EXCLUDED.full_name ELSE public.profiles.full_name END;
  RETURN NEW;
END $$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Auto-generate sequential job numbers (JOB-1001, JOB-1002...)
CREATE OR REPLACE FUNCTION public.generate_job_number() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  next_num int;
BEGIN
  IF NEW.job_number IS NULL OR NEW.job_number = '' THEN
    SELECT COALESCE(MAX(CAST(NULLIF(regexp_replace(job_number, '\D', '', 'g'), '') AS int)), 1000) + 1
      INTO next_num FROM public.service_jobs;
    NEW.job_number := 'JOB-' || next_num;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_service_jobs_job_number
BEFORE INSERT ON public.service_jobs
FOR EACH ROW EXECUTE FUNCTION public.generate_job_number();

-- Auto-insert into service_history on completion
CREATE OR REPLACE FUNCTION public.create_service_history_on_complete() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed')) THEN
    INSERT INTO public.service_history (client_id, job_id, engineer_id, issue, solution, service_date, notes, total_km)
    VALUES (
      NEW.client_id,
      NEW.id,
      NEW.engineer_id,
      NEW.issue_title,
      COALESCE(NEW.work_performed, ''),
      COALESCE(NEW.completed_at, now()),
      COALESCE(NEW.engineer_notes, ''),
      NEW.total_km
    )
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_service_jobs_history
AFTER UPDATE OF status ON public.service_jobs
FOR EACH ROW EXECUTE FUNCTION public.create_service_history_on_complete();

-- 12. ENABLE ROW LEVEL SECURITY (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_job_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_location_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_history ENABLE ROW LEVEL SECURITY;

-- 13. RLS POLICIES (Simple, performant, non-recursive)
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE TO authenticated USING (true);
CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "clients_select" ON public.clients FOR SELECT TO authenticated USING (true);
CREATE POLICY "clients_all" ON public.clients FOR ALL TO authenticated USING (true);

CREATE POLICY "jobs_select" ON public.service_jobs FOR SELECT TO authenticated USING (true);
CREATE POLICY "jobs_all" ON public.service_jobs FOR ALL TO authenticated USING (true);

CREATE POLICY "photos_select" ON public.service_job_photos FOR SELECT TO authenticated USING (true);
CREATE POLICY "photos_all" ON public.service_job_photos FOR ALL TO authenticated USING (true);

CREATE POLICY "logs_select" ON public.job_location_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "logs_insert" ON public.job_location_logs FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "history_select" ON public.service_history FOR SELECT TO authenticated USING (true);
CREATE POLICY "history_all" ON public.service_history FOR ALL TO authenticated USING (true);

-- 14. STORAGE SETUP
INSERT INTO storage.buckets (id, name, public)
VALUES ('service-job-photos', 'service-job-photos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "photos_bucket_select" ON storage.objects;
CREATE POLICY "photos_bucket_select" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'service-job-photos');

DROP POLICY IF EXISTS "photos_bucket_insert" ON storage.objects;
CREATE POLICY "photos_bucket_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'service-job-photos');

-- 15. SEED DEMO USERS VIA SUPABASE GOLANG ENCRYPTION COMPLIANT AUTH
DELETE FROM auth.users WHERE email IN ('admin@example.com', 'ravi@example.com');

DO $$
DECLARE
  v_admin_id uuid := gen_random_uuid();
  v_eng_id uuid := gen_random_uuid();
  v_client1_id uuid;
  v_client2_id uuid;
  v_client3_id uuid;
BEGIN
  -- 15.1 Admin User
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    is_super_admin, is_sso_user, deleted_at,
    created_at, updated_at
  ) VALUES (
    v_admin_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'admin@example.com',
    crypt('admin123', gen_salt('bf')),
    now(),
    '{"provider": "email", "providers": ["email"], "role": "admin"}'::jsonb,
    '{"full_name": "System Admin"}'::jsonb,
    false, false, NULL,
    now(),
    now()
  );

  -- Admin Identity
  INSERT INTO auth.identities (
    id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
  ) VALUES (
    v_admin_id,
    v_admin_id,
    jsonb_build_object('sub', v_admin_id::text, 'email', 'admin@example.com'),
    'email',
    'admin@example.com',
    now(), now(), now()
  ) ON CONFLICT (provider, provider_id) DO NOTHING;

  -- Admin Profile
  INSERT INTO public.profiles (id, full_name, email, role, phone, is_active)
  VALUES (v_admin_id, 'System Admin', 'admin@example.com', 'admin', '+91 98765 43210', true)
  ON CONFLICT (id) DO UPDATE SET role = 'admin', is_active = true;

  -- 15.2 Engineer User (Ravi Kumar)
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    is_super_admin, is_sso_user, deleted_at,
    created_at, updated_at
  ) VALUES (
    v_eng_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'ravi@example.com',
    crypt('engineer123', gen_salt('bf')),
    now(),
    '{"provider": "email", "providers": ["email"], "role": "engineer"}'::jsonb,
    '{"full_name": "Ravi Kumar"}'::jsonb,
    false, false, NULL,
    now(),
    now()
  );

  -- Engineer Identity
  INSERT INTO auth.identities (
    id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
  ) VALUES (
    v_eng_id,
    v_eng_id,
    jsonb_build_object('sub', v_eng_id::text, 'email', 'ravi@example.com'),
    'email',
    'ravi@example.com',
    now(), now(), now()
  ) ON CONFLICT (provider, provider_id) DO NOTHING;

  -- Engineer Profile
  INSERT INTO public.profiles (id, full_name, email, role, phone, is_active)
  VALUES (v_eng_id, 'Ravi Kumar', 'ravi@example.com', 'engineer', '+91 91234 56789', true)
  ON CONFLICT (id) DO UPDATE SET role = 'engineer', is_active = true;

  -- 15.3 Sample Clients
  INSERT INTO public.clients (client_name, company_name, phone, email, address, city, latitude, longitude)
  VALUES 
    ('Tech Solutions Pvt Ltd', 'Tech Solutions', '+91 98765 00001', 'contact@techsolutions.com', '12 MG Road, Indiranagar', 'Bengaluru', 12.9716, 77.5946)
    RETURNING id INTO v_client1_id;

  INSERT INTO public.clients (client_name, company_name, phone, email, address, city, latitude, longitude)
  VALUES 
    ('Apex Logistics', 'Apex Corp', '+91 98765 00002', 'support@apexcorp.com', '45 Whitefield Main Rd', 'Bengaluru', 12.9698, 77.7500)
    RETURNING id INTO v_client2_id;

  INSERT INTO public.clients (client_name, company_name, phone, email, address, city, latitude, longitude)
  VALUES 
    ('Dr. Priya Sharma', 'Sharma Clinics', '+91 98765 00003', 'drpriya@gmail.com', '78 Koramangala 4th Block', 'Bengaluru', 12.9352, 77.6245)
    RETURNING id INTO v_client3_id;

  -- 15.4 Sample Service Jobs
  INSERT INTO public.service_jobs (
    client_id, engineer_id, issue_title, issue_description,
    priority, status, scheduled_date, scheduled_time, created_by
  ) VALUES
    (v_client1_id, v_eng_id, 'Dell PowerEdge Server HDD Failure', 'RAID array reporting degraded drive 2. Needs hot swap and rebuild check.', 'urgent', 'in_progress', CURRENT_DATE, '10:30 AM', v_admin_id),
    (v_client2_id, v_eng_id, 'ThinkPad Screen Flickering & Battery Replacement', 'Display flickers on movement; battery health below 40%.', 'high', 'assigned', CURRENT_DATE, '02:00 PM', v_admin_id),
    (v_client3_id, NULL, 'Clinic Reception Desktop OS Boot Loop', 'Windows blue screens after recent update. Critical patient billing unit.', 'urgent', 'assigned', CURRENT_DATE + 1, '11:00 AM', v_admin_id);

END $$;
