/*
# Create clients table

1. New Tables
- clients: service client records with address and GPS coordinates
2. Security
- RLS: all authenticated users can SELECT (engineers need client info for assigned jobs)
- Only admins can INSERT/UPDATE/DELETE
*/

CREATE TABLE IF NOT EXISTS clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_name text NOT NULL,
  company_name text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  latitude double precision,
  longitude double precision,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clients_select_all_authenticated" ON clients;
CREATE POLICY "clients_select_all_authenticated"
ON clients FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "clients_insert_admin" ON clients;
CREATE POLICY "clients_insert_admin"
ON clients FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS "clients_update_admin" ON clients;
CREATE POLICY "clients_update_admin"
ON clients FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS "clients_delete_admin" ON clients;
CREATE POLICY "clients_delete_admin"
ON clients FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
