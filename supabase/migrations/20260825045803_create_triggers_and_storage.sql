/*
# Create triggers and storage bucket

1. Triggers
- set_updated_at: auto-maintain updated_at on profiles, clients, service_jobs
- on_auth_user_created: auto-create profile row on auth.users insert
- generate_job_number: auto-generate sequential JOB-XXXX on service_jobs insert
- create_service_history_on_complete: auto-populate service_history when job marked completed
2. Storage
- Bucket service-job-photos (public) with policies for authenticated users
*/

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

CREATE OR REPLACE FUNCTION generate_job_number() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  next_num int;
BEGIN
  IF NEW.job_number IS NULL OR NEW.job_number = '' THEN
    SELECT COALESCE(MAX(CAST(REPLACE(job_number, 'JOB-', '') AS int)), 1000) + 1
      INTO next_num FROM service_jobs;
    NEW.job_number := 'JOB-' || next_num;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_service_jobs_job_number ON service_jobs;
CREATE TRIGGER trg_service_jobs_job_number
BEFORE INSERT ON service_jobs
FOR EACH ROW EXECUTE FUNCTION generate_job_number();

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
