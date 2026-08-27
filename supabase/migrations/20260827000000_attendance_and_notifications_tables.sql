-- ═══════════════════════════════════════════════════════════════════
-- Migration: Create duty_attendance and admin_notifications tables
-- Required for cloud-sync of attendance and notifications
-- (previously stored in localStorage which doesn't sync across devices)
-- ═══════════════════════════════════════════════════════════════════

-- ─── Duty Attendance Table ───
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
  total_km DOUBLE PRECISION,
  allowance_claimed DOUBLE PRECISION,
  status TEXT NOT NULL DEFAULT 'on_duty' CHECK (status IN ('on_duty', 'punched_out')),
  UNIQUE(engineer_id, date)
);

-- RLS: Allow full access (same pattern as other tables)
ALTER TABLE public.duty_attendance ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow full access to duty_attendance" ON public.duty_attendance;
CREATE POLICY "Allow full access to duty_attendance"
  ON public.duty_attendance FOR ALL
  USING (true) WITH CHECK (true);

-- ─── Admin Notifications Table ───
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

-- RLS: Allow full access
ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow full access to admin_notifications" ON public.admin_notifications;
CREATE POLICY "Allow full access to admin_notifications"
  ON public.admin_notifications FOR ALL
  USING (true) WITH CHECK (true);

-- Grant access to anon and authenticated roles
GRANT ALL ON public.duty_attendance TO anon, authenticated;
GRANT ALL ON public.admin_notifications TO anon, authenticated;
