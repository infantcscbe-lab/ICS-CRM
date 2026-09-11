-- ==========================================================
-- Multi-Branch Partitioning & Access Control Migration
-- Supports branch-wise filtering for Admin, Coordinators, and Engineers
-- Primary/Default Branch: 'cbe' (Coimbatore)
-- ==========================================================

-- 1. Add branch column to service_jobs
ALTER TABLE service_jobs
ADD COLUMN IF NOT EXISTS branch TEXT DEFAULT 'cbe';

UPDATE service_jobs
SET branch = 'cbe'
WHERE branch IS NULL;

CREATE INDEX IF NOT EXISTS idx_service_jobs_branch ON service_jobs(branch);

-- 2. Add branch column to profiles
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS branch TEXT DEFAULT 'cbe';

UPDATE profiles
SET branch = 'cbe'
WHERE branch IS NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_branch ON profiles(branch);

-- 3. Add branch column to leads
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS branch TEXT DEFAULT 'cbe';

UPDATE leads
SET branch = 'cbe'
WHERE branch IS NULL;

CREATE INDEX IF NOT EXISTS idx_leads_branch ON leads(branch);

-- 4. Add branch column to clients
ALTER TABLE clients
ADD COLUMN IF NOT EXISTS branch TEXT DEFAULT 'cbe';

UPDATE clients
SET branch = 'cbe'
WHERE branch IS NULL;

CREATE INDEX IF NOT EXISTS idx_clients_branch ON clients(branch);

-- 5. Add branch column to duty_attendance
ALTER TABLE duty_attendance
ADD COLUMN IF NOT EXISTS branch TEXT DEFAULT 'cbe';

UPDATE duty_attendance
SET branch = 'cbe'
WHERE branch IS NULL;

CREATE INDEX IF NOT EXISTS idx_duty_attendance_branch ON duty_attendance(branch);
