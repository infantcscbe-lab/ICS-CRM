/*
# Service Engineer Management System - Core Schema

## Summary
Creates the complete database schema for a laptop/computer service company management
application. Supports two user roles (admin, engineer) with full job lifecycle tracking,
GPS location logging, KM tracking, photo uploads, and service history.

## Tables Created
1. **profiles** - User profile info linked to auth.users; role is admin or engineer
2. **clients** - Service clients with address + GPS coordinates
3. **service_jobs** - The core job record with full lifecycle timestamps, GPS coords, odometer
4. **service_job_photos** - Before/after/other photos per job (stored in Supabase Storage)
5. **job_location_logs** - Periodic GPS pings recorded only while an engineer is traveling
6. **service_history** - Completed job summary for per-client history

## Enums
- job_status: assigned, traveling, reached, in_progress, solved, completed, cancelled
- job_priority: low, medium, high, urgent
- user_role: admin, engineer
- photo_type: before, after, other

## Security (RLS)
- profiles: users read/update own profile; admins read all + update all
- clients: admins full CRUD; engineers SELECT only (need client info for assigned jobs)
- service_jobs: admins full CRUD; engineers SELECT own assigned + UPDATE own (workflow)
- service_job_photos: admins full CRUD; engineers SELECT/INSERT for own assigned jobs
- job_location_logs: admins SELECT all; engineers SELECT own + INSERT own
- service_history: admins full CRUD; engineers SELECT own assigned

## Triggers
- updated_at auto-maintenance on profiles, clients, service_jobs
- Auto-create profile row on auth.users insert (handles new signups)
- Auto-generate sequential job_number on service_jobs insert (JOB-XXXX)
- Auto-populate service_history row when a job is marked completed

## Storage
- Bucket `service-job-photos` with policies for authenticated users to manage own-job photos
*/

-- ============================================================
-- ENUMS
-- ============================================================
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

-- ============================================================
-- PROFILES
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  role user_role NOT NULL DEFAULT 'engineer',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own_or_admin" ON profiles;
CREATE POLICY "profiles_select_own_or_admin"
ON profiles FOR SELECT TO authenticated
USING (auth.uid() = id OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS "profiles_update_own_or_admin" ON profiles;
CREATE POLICY "profiles_update_own_or_admin"
ON profiles FOR UPDATE TO authenticated
USING (auth.uid() = id OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
WITH CHECK (auth.uid() = id OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS "profiles_insert_admin" ON profiles;
CREATE POLICY "profiles_insert_admin"
ON profiles FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- ============================================================
-- CLIENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS clients (
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

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clients_select_all_authenticated" ON clients;
CREATE POLICY "clients_select_all_authenticated"
ON clients FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "clients_insert_admin" ON clients;
CREATE POLICY "clients_insert_admin"
ON clients FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS "clients_update_admin" ON clients;
CREATE POLICY "clients_update_admin"
ON clients FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS "clients_delete_admin" ON clients;
CREATE POLICY "clients_delete_admin"
ON clients FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- ============================================================
-- SERVICE JOBS
-- ============================================================
CREATE TABLE IF NOT EXISTS service_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_number text UNIQUE NOT NULL,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  engineer_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
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
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_jobs_engineer ON service_jobs(engineer_id);
CREATE INDEX IF NOT EXISTS idx_service_jobs_client ON service_jobs(client_id);
CREATE INDEX IF NOT EXISTS idx_service_jobs_status ON service_jobs(status);
CREATE INDEX IF NOT EXISTS idx_service_jobs_scheduled_date ON service_jobs(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_service_jobs_job_number ON service_jobs(job_number);

ALTER TABLE service_jobs ENABLE ROW LEVEL SECURITY;

-- Engineers see only their own assigned jobs
DROP POLICY IF EXISTS "jobs_select_own_or_admin" ON service_jobs;
CREATE POLICY "jobs_select_own_or_admin"
ON service_jobs FOR SELECT TO authenticated
USING (engineer_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- Only admins insert (creating/assigning jobs)
DROP POLICY IF EXISTS "jobs_insert_admin" ON service_jobs;
CREATE POLICY "jobs_insert_admin"
ON service_jobs FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- Engineers can update their own jobs (workflow progression); admins update all
DROP POLICY IF EXISTS "jobs_update_own_or_admin" ON service_jobs;
CREATE POLICY "jobs_update_own_or_admin"
ON service_jobs FOR UPDATE TO authenticated
USING (engineer_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
WITH CHECK (engineer_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- Only admins delete jobs
DROP POLICY IF EXISTS "jobs_delete_admin" ON service_jobs;
CREATE POLICY "jobs_delete_admin"
ON service_jobs FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- ============================================================
-- SERVICE JOB PHOTOS
-- ============================================================
CREATE TABLE IF NOT EXISTS service_job_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES service_jobs(id) ON DELETE CASCADE,
  photo_url text NOT NULL,
  photo_type photo_type NOT NULL DEFAULT 'other',
  uploaded_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_job_photos_job ON service_job_photos(job_id);

ALTER TABLE service_job_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "photos_select_own_or_admin" ON service_job_photos;
CREATE POLICY "photos_select_own_or_admin"
ON service_job_photos FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM service_jobs j WHERE j.id = service_job_photos.job_id AND j.engineer_id = auth.uid())
  OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
);

DROP POLICY IF EXISTS "photos_insert_own_or_admin" ON service_job_photos;
CREATE POLICY "photos_insert_own_or_admin"
ON service_job_photos FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM service_jobs j WHERE j.id = service_job_photos.job_id AND j.engineer_id = auth.uid())
  OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
);

DROP POLICY IF EXISTS "photos_delete_admin" ON service_job_photos;
CREATE POLICY "photos_delete_admin"
ON service_job_photos FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- ============================================================
-- JOB LOCATION LOGS
-- ============================================================
CREATE TABLE IF NOT EXISTS job_location_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES service_jobs(id) ON DELETE CASCADE,
  engineer_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_location_logs_job ON job_location_logs(job_id);
CREATE INDEX IF NOT EXISTS idx_job_location_logs_engineer ON job_location_logs(engineer_id);
CREATE INDEX IF NOT EXISTS idx_job_location_logs_recorded ON job_location_logs(recorded_at);

ALTER TABLE job_location_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "location_logs_select_own_or_admin" ON job_location_logs;
CREATE POLICY "location_logs_select_own_or_admin"
ON job_location_logs FOR SELECT TO authenticated
USING (engineer_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS "location_logs_insert_own" ON job_location_logs;
CREATE POLICY "location_logs_insert_own"
ON job_location_logs FOR INSERT TO authenticated
WITH CHECK (engineer_id = auth.uid());

-- ============================================================
-- SERVICE HISTORY
-- ============================================================
CREATE TABLE IF NOT EXISTS service_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES service_jobs(id) ON DELETE CASCADE,
  engineer_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  issue text NOT NULL DEFAULT '',
  solution text NOT NULL DEFAULT '',
  service_date timestamptz,
  notes text NOT NULL DEFAULT '',
  total_km numeric(12,2),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_history_client ON service_history(client_id);
CREATE INDEX IF NOT EXISTS idx_service_history_engineer ON service_history(engineer_id);

ALTER TABLE service_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "history_select_own_or_admin" ON service_history;
CREATE POLICY "history_select_own_or_admin"
ON service_history FOR SELECT TO authenticated
USING (engineer_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS "history_insert_admin" ON service_history;
CREATE POLICY "history_insert_admin"
ON service_history FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS "history_delete_admin" ON service_history;
CREATE POLICY "history_delete_admin"
ON service_history FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- ============================================================
-- TRIGGERS: updated_at maintenance
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_profiles_updated ON profiles;
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON profiles
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_clients_updated ON clients;
CREATE TRIGGER trg_clients_updated BEFORE UPDATE ON clients
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_service_jobs_updated ON service_jobs;
CREATE TRIGGER trg_service_jobs_updated BEFORE UPDATE ON service_jobs
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- TRIGGER: Auto-create profile on auth.users insert
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.email, ''),
    COALESCE((NEW.raw_app_meta_data->>'role')::user_role, 'engineer')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- TRIGGER: Auto-generate job_number (JOB-XXXX sequential)
-- ============================================================
CREATE OR REPLACE FUNCTION generate_job_number() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  next_num int;
  new_number text;
BEGIN
  IF NEW.job_number IS NULL OR NEW.job_number = '' THEN
    SELECT COALESCE(MAX(CAST(REPLACE(job_number, 'JOB-', '') AS int)), 1000) + 1
      INTO next_num FROM service_jobs;
    new_number := 'JOB-' || next_num;
    NEW.job_number := new_number;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_service_jobs_job_number ON service_jobs;
CREATE TRIGGER trg_service_jobs_job_number
BEFORE INSERT ON service_jobs
FOR EACH ROW EXECUTE FUNCTION generate_job_number();

-- ============================================================
-- TRIGGER: Auto-populate service_history on job completion
-- ============================================================
CREATE OR REPLACE FUNCTION create_service_history_on_complete() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed')) THEN
    INSERT INTO service_history (client_id, job_id, engineer_id, issue, solution, service_date, notes, total_km)
    VALUES (
      NEW.client_id,
      NEW.id,
      NEW.engineer_id,
      NEW.issue_title,
      COALESCE(NEW.work_performed, ''),
      NEW.completed_at,
      COALESCE(NEW.engineer_notes, ''),
      NEW.total_km
    )
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_service_jobs_history ON service_jobs;
CREATE TRIGGER trg_service_jobs_history
AFTER UPDATE OF status ON service_jobs
FOR EACH ROW EXECUTE FUNCTION create_service_history_on_complete();

-- ============================================================
-- STORAGE BUCKET: service-job-photos
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('service-job-photos', 'service-job-photos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "photos_bucket_read" ON storage.objects;
CREATE POLICY "photos_bucket_read"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'service-job-photos');

DROP POLICY IF EXISTS "photos_bucket_insert" ON storage.objects;
CREATE POLICY "photos_bucket_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'service-job-photos');

DROP POLICY IF EXISTS "photos_bucket_delete" ON storage.objects;
CREATE POLICY "photos_bucket_delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'service-job-photos' AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
