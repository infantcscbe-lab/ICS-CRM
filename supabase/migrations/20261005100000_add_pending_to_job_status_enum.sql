-- Migration: Add 'pending' to job_status enum in PostgreSQL
-- Supports Taken to Office for repair / pending call status
DO $$ 
BEGIN 
  ALTER TYPE job_status ADD VALUE IF NOT EXISTS 'pending';
EXCEPTION 
  WHEN duplicate_object THEN NULL;
END $$;
