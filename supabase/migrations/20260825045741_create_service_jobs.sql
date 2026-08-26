/*
# Create service_jobs table

1. New Tables
- service_jobs: core job record with full lifecycle timestamps, GPS coords, odometer readings,
  diagnosis/work fields, and notes. Links to clients and profiles (engineer).
2. Indexes
- On engineer_id, client_id, status, scheduled_date, job_number
3. Security
- RLS: engineers SELECT/UPDATE own assigned jobs; admins full CRUD
*/

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

DROP POLICY IF EXISTS "jobs_select_own_or_admin" ON service_jobs;
CREATE POLICY "jobs_select_own_or_admin"
ON service_jobs FOR SELECT TO authenticated
USING (engineer_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS "jobs_insert_admin" ON service_jobs;
CREATE POLICY "jobs_insert_admin"
ON service_jobs FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS "jobs_update_own_or_admin" ON service_jobs;
CREATE POLICY "jobs_update_own_or_admin"
ON service_jobs FOR UPDATE TO authenticated
USING (engineer_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
WITH CHECK (engineer_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS "jobs_delete_admin" ON service_jobs;
CREATE POLICY "jobs_delete_admin"
ON service_jobs FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
