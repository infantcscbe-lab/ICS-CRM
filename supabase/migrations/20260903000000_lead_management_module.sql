-- ============================================================================
-- ICS SERVICE MANAGER: LEAD MANAGEMENT & SALES EXECUTIVE MODULE MIGRATION
-- ============================================================================

-- 1. EXTEND USER ROLE ENUM WITH SALES_EXECUTIVE
DO $$ BEGIN
  ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'sales_executive';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Add department and designation columns to profiles if missing
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS department TEXT DEFAULT 'Field Service',
ADD COLUMN IF NOT EXISTS designation TEXT;

-- 2. LEADS TABLE
CREATE TABLE IF NOT EXISTS public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_number TEXT UNIQUE NOT NULL,
  customer_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  company_name TEXT,
  contact_person TEXT,
  mobile_number TEXT NOT NULL,
  email TEXT,
  address TEXT,
  gps_latitude DOUBLE PRECISION,
  gps_longitude DOUBLE PRECISION,
  service_job_id UUID REFERENCES public.service_jobs(id) ON DELETE SET NULL,
  service_job_number TEXT,
  created_by UUID NOT NULL,
  created_by_name TEXT,
  created_by_role TEXT NOT NULL DEFAULT 'engineer',
  original_owner_id UUID NOT NULL,
  original_owner_name TEXT,
  current_owner_id UUID NOT NULL,
  current_owner_name TEXT,
  current_owner_role TEXT NOT NULL DEFAULT 'engineer',
  lead_source TEXT NOT NULL DEFAULT 'Service Visit',
  lead_category TEXT NOT NULL DEFAULT 'Other',
  requirement TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'Warm',
  estimated_value DOUBLE PRECISION DEFAULT 0,
  customer_remarks TEXT,
  status TEXT NOT NULL DEFAULT 'NEW',
  lost_reason TEXT,
  photo_url TEXT,
  next_followup_date DATE,
  next_followup_time TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_leads_number ON public.leads(lead_number);
CREATE INDEX IF NOT EXISTS idx_leads_original_owner ON public.leads(original_owner_id);
CREATE INDEX IF NOT EXISTS idx_leads_current_owner ON public.leads(current_owner_id);
CREATE INDEX IF NOT EXISTS idx_leads_service_job ON public.leads(service_job_id);
CREATE INDEX IF NOT EXISTS idx_leads_status ON public.leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON public.leads(created_at);

-- 3. LEAD ASSIGNMENT HISTORY (AUDIT TRAIL)
CREATE TABLE IF NOT EXISTS public.lead_assignment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  from_user_id UUID,
  from_user_name TEXT,
  to_user_id UUID NOT NULL,
  to_user_name TEXT NOT NULL,
  transferred_by_id UUID NOT NULL,
  transferred_by_name TEXT NOT NULL,
  reason TEXT,
  action TEXT NOT NULL DEFAULT 'transferred',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_assignment_lead ON public.lead_assignment_history(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_assignment_created ON public.lead_assignment_history(created_at);

-- 4. LEAD FOLLOW-UPS TABLE
CREATE TABLE IF NOT EXISTS public.lead_followups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  user_name TEXT NOT NULL,
  followup_date DATE NOT NULL,
  followup_time TEXT,
  followup_type TEXT NOT NULL DEFAULT 'Phone Call',
  notes TEXT NOT NULL,
  next_action TEXT,
  next_followup_date DATE,
  next_followup_time TEXT,
  status TEXT NOT NULL DEFAULT 'Completed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_followups_lead ON public.lead_followups(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_followups_date ON public.lead_followups(followup_date);

-- 5. QUOTATIONS TABLE
CREATE TABLE IF NOT EXISTS public.quotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_number TEXT UNIQUE NOT NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  company_name TEXT,
  contact_person TEXT,
  mobile_number TEXT,
  email TEXT,
  address TEXT,
  created_by UUID NOT NULL,
  created_by_name TEXT NOT NULL,
  subtotal DOUBLE PRECISION NOT NULL DEFAULT 0,
  tax_rate DOUBLE PRECISION NOT NULL DEFAULT 18,
  tax_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  discount_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  total_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Draft',
  valid_until DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.quotation_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id UUID NOT NULL REFERENCES public.quotations(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  description TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price DOUBLE PRECISION NOT NULL DEFAULT 0,
  total_price DOUBLE PRECISION NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_quotations_lead ON public.quotations(lead_id);
CREATE INDEX IF NOT EXISTS idx_quotations_customer ON public.quotations(customer_id);
CREATE INDEX IF NOT EXISTS idx_quotation_items_quotation ON public.quotation_items(quotation_id);

-- 6. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_assignment_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_followups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leads_all" ON public.leads;
CREATE POLICY "leads_all" ON public.leads FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "lead_history_all" ON public.lead_assignment_history;
CREATE POLICY "lead_history_all" ON public.lead_assignment_history FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "lead_followups_all" ON public.lead_followups;
CREATE POLICY "lead_followups_all" ON public.lead_followups FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "quotations_all" ON public.quotations;
CREATE POLICY "quotations_all" ON public.quotations FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "quotation_items_all" ON public.quotation_items;
CREATE POLICY "quotation_items_all" ON public.quotation_items FOR ALL USING (true) WITH CHECK (true);

-- 7. REALTIME PUBLICATION
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_followups;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 8. INITIAL SALES EXECUTIVE ACCOUNT (Optional Seed)
INSERT INTO public.profiles (
  id,
  employee_id,
  full_name,
  email,
  phone,
  role,
  department,
  designation,
  is_active,
  password_hash
) VALUES (
  '33333333-3333-3333-3333-333333333333',
  'SE001',
  'Kumar (Sales Executive)',
  'kumar.sales@ics-crm.com',
  '+91 98422 11223',
  'sales_executive',
  'Sales & Business Development',
  'Sales Executive',
  true,
  'admin123'
) ON CONFLICT (id) DO NOTHING;
