-- Migration: Add direct_call_type to service_jobs
-- Supports Inboard (in-house / lab / walk-in) and Outboard (onsite / field visit) options for Direct Calls

ALTER TABLE IF EXISTS public.service_jobs
  ADD COLUMN IF NOT EXISTS direct_call_type TEXT CHECK (direct_call_type IN ('inboard', 'outboard') OR direct_call_type IS NULL);
