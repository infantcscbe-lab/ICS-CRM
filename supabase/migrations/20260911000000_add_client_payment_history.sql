-- ============================================================================
-- Migration: Add client_payment_history table for tracking outstanding payments
-- Captures previous balance, payment/charge amount, new balance, payment mode,
-- audit trail, and receipt numbers.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.client_payment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  job_id UUID REFERENCES public.service_jobs(id) ON DELETE SET NULL,
  type TEXT NOT NULL DEFAULT 'payment' CHECK (type IN ('payment', 'charge', 'settlement', 'adjustment')),
  previous_outstanding NUMERIC(12, 2) NOT NULL DEFAULT 0,
  amount_paid NUMERIC(12, 2) NOT NULL DEFAULT 0,
  current_outstanding NUMERIC(12, 2) NOT NULL DEFAULT 0,
  payment_mode TEXT NOT NULL DEFAULT 'Cash',
  receipt_no TEXT,
  notes TEXT DEFAULT '',
  recorded_by TEXT DEFAULT 'Admin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for lightning-fast lookups
CREATE INDEX IF NOT EXISTS idx_client_payment_history_client_id 
  ON public.client_payment_history (client_id);

CREATE INDEX IF NOT EXISTS idx_client_payment_history_created_at 
  ON public.client_payment_history (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_client_payment_history_job_id 
  ON public.client_payment_history (job_id) 
  WHERE job_id IS NOT NULL;

-- Enable RLS
ALTER TABLE public.client_payment_history ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to view payment history
DO $$ BEGIN
  CREATE POLICY "Allow authenticated read payment history"
    ON public.client_payment_history
    FOR SELECT
    TO authenticated
    USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Allow authenticated users to insert payment history
DO $$ BEGIN
  CREATE POLICY "Allow authenticated insert payment history"
    ON public.client_payment_history
    FOR INSERT
    TO authenticated
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Realtime Publication for instant UI sync across all panels
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.client_payment_history;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
