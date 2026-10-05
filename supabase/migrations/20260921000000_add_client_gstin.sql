-- ============================================================================
-- Migration: Add GSTIN (GST Number) column to public.clients
-- ============================================================================

ALTER TABLE IF EXISTS public.clients
ADD COLUMN IF NOT EXISTS gstin TEXT;

CREATE INDEX IF NOT EXISTS idx_clients_gstin ON public.clients(gstin);
