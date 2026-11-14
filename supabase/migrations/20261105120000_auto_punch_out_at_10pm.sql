-- Migration: Auto Punch-Out at 10:00 PM for Missed Punch Outs
-- Closes any shifts where engineer forgot to punch out by setting punch_out_at to 10:00 PM IST (22:00)

-- 1. Add auto_punch_out_time column to attendance_policy
ALTER TABLE IF EXISTS public.attendance_policy
ADD COLUMN IF NOT EXISTS auto_punch_out_time TEXT NOT NULL DEFAULT '22:00';

-- 2. Create function to automatically close missed punch outs
CREATE OR REPLACE FUNCTION public.auto_close_missed_punchouts()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  updated_count INTEGER := 0;
BEGIN
  WITH updated_rows AS (
    UPDATE public.duty_attendance
    SET
      punch_out_at = ((date + TIME '22:00:00') AT TIME ZONE 'Asia/Kolkata'),
      punch_out_address = COALESCE(punch_out_address, 'Auto Punch-out (10:00 PM)'),
      total_work_minutes = GREATEST(1, ROUND(EXTRACT(EPOCH FROM (((date + TIME '22:00:00') AT TIME ZONE 'Asia/Kolkata') - punch_in_at)) / 60))::INT,
      status = CASE WHEN is_late THEN 'late' ELSE 'punched_out' END,
      admin_notes = CASE 
        WHEN admin_notes IS NULL OR admin_notes = '' THEN 'Auto punch-out at 10:00 PM'
        WHEN admin_notes NOT LIKE '%Auto punch-out at 10:00 PM%' THEN admin_notes || ' | Auto punch-out at 10:00 PM'
        ELSE admin_notes
      END
    WHERE punch_in_at IS NOT NULL
      AND (punch_out_at IS NULL OR status = 'on_duty')
      AND (
        date < (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::DATE
        OR (
          date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::DATE
          AND (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::TIME >= TIME '22:00:00'
        )
      )
    RETURNING id
  )
  SELECT COUNT(*) INTO updated_count FROM updated_rows;

  RETURN updated_count;
END;
$$;

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION public.auto_close_missed_punchouts() TO anon, authenticated, service_role;

-- 3. Run immediately to fix any past open records
SELECT public.auto_close_missed_punchouts();

-- 4. Enable pg_cron job if cron extension is enabled (10:00 PM IST is 16:30 UTC)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('auto_punch_out_10pm_ist')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto_punch_out_10pm_ist');

    PERFORM cron.schedule(
      'auto_punch_out_10pm_ist',
      '30 16 * * *',
      'SELECT public.auto_close_missed_punchouts();'
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

