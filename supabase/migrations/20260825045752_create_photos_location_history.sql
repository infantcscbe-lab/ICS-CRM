/*
# Create photos, location logs, and service history tables

1. New Tables
- service_job_photos: before/after/other photos per job (URLs stored, files in Supabase Storage)
- job_location_logs: periodic GPS pings recorded only while engineer is traveling
- service_history: completed job summary for per-client history
2. Indexes
- On job_id, engineer_id, recorded_at, client_id
3. Security
- photos: engineers SELECT/INSERT for own assigned jobs; admins full
- location_logs: engineers SELECT own + INSERT own; admins SELECT all
- service_history: engineers SELECT own; admins full
*/

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
