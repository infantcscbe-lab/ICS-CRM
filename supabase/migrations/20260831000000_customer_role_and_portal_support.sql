-- ============================================================================
-- Migration: Customer Portal Role & Client Authentication Support
-- Adds 'customer' to user_role enum, adds client fields to profiles, 
-- and configures sample customer demo credentials in Supabase.
-- ============================================================================

-- 1. Add 'customer' value to user_role ENUM if not already present
DO $$ 
BEGIN
  ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'customer';
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN
    CREATE TYPE user_role AS ENUM ('admin', 'engineer', 'coordinator', 'customer');
END $$;

-- 2. Add client linking columns to public.profiles table
ALTER TABLE IF EXISTS public.profiles 
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS company_name TEXT,
  ADD COLUMN IF NOT EXISTS client_code TEXT;

-- 3. Ensure public.clients table has client_code column
ALTER TABLE IF EXISTS public.clients 
  ADD COLUMN IF NOT EXISTS client_code TEXT;

-- Populate default client codes if empty
UPDATE public.clients
SET client_code = 'CL-' || UPPER(SUBSTRING(id::TEXT FROM 1 FOR 5))
WHERE client_code IS NULL OR client_code = '';

-- 4. Create index on client_code for quick customer lookup
CREATE INDEX IF NOT EXISTS idx_clients_client_code ON public.clients(client_code);
CREATE INDEX IF NOT EXISTS idx_profiles_client_id ON public.profiles(client_id);

-- 5. Insert or update default Demo Customer in profiles
DO $$
DECLARE
  v_client_id UUID;
  v_customer_id UUID := '22222222-2222-2222-2222-222222222222';
BEGIN
  -- Get first existing client or create one
  SELECT id INTO v_client_id FROM public.clients ORDER BY created_at LIMIT 1;
  
  IF v_client_id IS NULL THEN
    INSERT INTO public.clients (client_name, company_name, phone, email, address, city, client_code)
    VALUES ('Mr. Rajesh Kumar', 'Tech Solutions Pvt Ltd', '+91 98765 00001', 'contact@techsolutions.com', '12 MG Road, Indiranagar', 'Bengaluru', 'CL-101')
    RETURNING id INTO v_client_id;
  END IF;

  -- Insert/Update Demo Customer profile
  INSERT INTO public.profiles (
    id, 
    full_name, 
    company_name, 
    client_id, 
    client_code, 
    email, 
    phone, 
    role, 
    is_active
  )
  VALUES (
    v_customer_id,
    'Mr. Rajesh Kumar',
    'Tech Solutions Pvt Ltd',
    v_client_id,
    'CL-101',
    'customer1@ics.com',
    '+91 98765 00001',
    'customer',
    true
  )
  ON CONFLICT (id) DO UPDATE SET
    role = 'customer',
    client_id = EXCLUDED.client_id,
    company_name = EXCLUDED.company_name,
    is_active = true;

END $$;
