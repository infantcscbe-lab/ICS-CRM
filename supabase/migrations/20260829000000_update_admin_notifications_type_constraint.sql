-- Migration: Update admin_notifications table constraints
-- Make job_id nullable and remove restrictive type CHECK constraint to support 'call_request' and 'leave_request'

ALTER TABLE IF EXISTS public.admin_notifications ALTER COLUMN job_id DROP NOT NULL;
ALTER TABLE IF EXISTS public.admin_notifications DROP CONSTRAINT IF EXISTS admin_notifications_type_check;
