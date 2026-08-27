-- ═══════════════════════════════════════════════════════════════════
-- Migration: Professional Attendance Suite & Leave Management
-- ═══════════════════════════════════════════════════════════════════

-- Extend duty_attendance table with professional HR fields if not present
ALTER TABLE public.duty_attendance 
  ADD COLUMN IF NOT EXISTS work_shift TEXT DEFAULT 'General Shift (09:00 AM - 06:30 PM)',
  ADD COLUMN IF NOT EXISTS overtime_minutes INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS travel_allowance DOUBLE PRECISION DEFAULT 0,
  ADD COLUMN IF NOT EXISTS food_allowance DOUBLE PRECISION DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_late BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_half_day BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_regularized BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS regularized_reason TEXT,
  ADD COLUMN IF NOT EXISTS admin_notes TEXT;

-- Leave Requests Table
CREATE TABLE IF NOT EXISTS public.leave_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engineer_id UUID NOT NULL,
  leave_type TEXT NOT NULL CHECK (leave_type IN ('casual', 'sick', 'earned', 'half_day', 'emergency', 'regularization')),
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

-- Attendance Policy Configuration Table
CREATE TABLE IF NOT EXISTS public.attendance_policy (
  id TEXT PRIMARY KEY DEFAULT 'default_policy',
  shift_start_time TEXT NOT NULL DEFAULT '09:00',
  shift_end_time TEXT NOT NULL DEFAULT '18:30',
  grace_period_minutes INTEGER NOT NULL DEFAULT 15,
  half_day_min_hours DOUBLE PRECISION NOT NULL DEFAULT 4.5,
  full_day_min_hours DOUBLE PRECISION NOT NULL DEFAULT 8.0,
  rate_per_km DOUBLE PRECISION NOT NULL DEFAULT 6.0,
  daily_food_allowance DOUBLE PRECISION NOT NULL DEFAULT 100.0,
  weekly_off_days INTEGER[] DEFAULT ARRAY[0], -- 0 = Sunday
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Insert default policy if not exists
INSERT INTO public.attendance_policy (id, shift_start_time, shift_end_time, grace_period_minutes, half_day_min_hours, full_day_min_hours, rate_per_km, daily_food_allowance)
VALUES ('default_policy', '09:00', '18:30', 15, 4.5, 8.0, 6.0, 100.0)
ON CONFLICT (id) DO NOTHING;

-- Enable RLS and create full access policies
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow full access to leave_requests" ON public.leave_requests;
CREATE POLICY "Allow full access to leave_requests" ON public.leave_requests FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.attendance_policy ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow full access to attendance_policy" ON public.attendance_policy;
CREATE POLICY "Allow full access to attendance_policy" ON public.attendance_policy FOR ALL USING (true) WITH CHECK (true);

-- Grant permissions
GRANT ALL ON public.leave_requests TO anon, authenticated;
GRANT ALL ON public.attendance_policy TO anon, authenticated;
