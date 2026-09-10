-- ============================================================================
-- Migration: Add Outstanding tracking columns to clients table
-- Stores client pending balance, notes/remarks, and last update audit trail
-- ============================================================================

ALTER TABLE IF EXISTS public.clients
  ADD COLUMN IF NOT EXISTS outstanding_amount NUMERIC(12, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS outstanding_notes TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS outstanding_updated_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS outstanding_updated_by TEXT;

-- Create an index for quick querying of clients with pending balances
CREATE INDEX IF NOT EXISTS idx_clients_outstanding_amount 
  ON public.clients (outstanding_amount) 
  WHERE outstanding_amount > 0;

-- Enable Realtime publication for clients so balances update dynamically
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.clients;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
