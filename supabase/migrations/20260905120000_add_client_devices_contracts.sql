-- ============================================================================
-- Migration: Add devices JSONB column to clients table
-- Stores structured device hardware along with AMC, Warranty, and Expiry dates
-- ============================================================================

ALTER TABLE IF EXISTS public.clients
  ADD COLUMN IF NOT EXISTS devices JSONB DEFAULT '[]'::jsonb;
