-- Relax duty_attendance status check constraint to support modern HR workflow statuses
ALTER TABLE public.duty_attendance DROP CONSTRAINT IF EXISTS duty_attendance_status_check;

ALTER TABLE public.duty_attendance ADD CONSTRAINT duty_attendance_status_check 
  CHECK (status IN ('on_duty', 'punched_out', 'present', 'late', 'half_day', 'on_leave', 'absent', 'weekly_off', 'holiday'));

