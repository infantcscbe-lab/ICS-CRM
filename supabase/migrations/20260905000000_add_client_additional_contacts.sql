-- ============================================================================
-- Migration: Add secondary contact and additional contacts to clients table
-- Allows storing multiple contact persons, mobile numbers, and roles per client
-- ============================================================================

ALTER TABLE IF EXISTS public.clients
  ADD COLUMN IF NOT EXISTS secondary_contact_name TEXT,
  ADD COLUMN IF NOT EXISTS secondary_phone TEXT,
  ADD COLUMN IF NOT EXISTS additional_contacts JSONB DEFAULT '[]'::jsonb;
