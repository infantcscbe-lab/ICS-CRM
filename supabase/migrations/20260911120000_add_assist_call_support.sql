-- Add assist call support columns to service_jobs
ALTER TABLE service_jobs
ADD COLUMN IF NOT EXISTS is_assist_call BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS assist_engineer_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS assist_status TEXT DEFAULT 'assigned',
ADD COLUMN IF NOT EXISTS assist_started_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS assist_reached_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS assist_notes TEXT;

-- Create index for assist engineer querying
CREATE INDEX IF NOT EXISTS idx_service_jobs_assist_engineer_id ON service_jobs(assist_engineer_id);
CREATE INDEX IF NOT EXISTS idx_service_jobs_is_assist_call ON service_jobs(is_assist_call);
