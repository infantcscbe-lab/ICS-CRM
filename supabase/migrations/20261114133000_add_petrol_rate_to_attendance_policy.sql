-- Add configurable petrol rate per KM to attendance_policy table
ALTER TABLE attendance_policy 
ADD COLUMN IF NOT EXISTS petrol_rate_per_km NUMERIC(5,2) DEFAULT 2.50;

UPDATE attendance_policy 
SET petrol_rate_per_km = 2.50 
WHERE petrol_rate_per_km IS NULL;

