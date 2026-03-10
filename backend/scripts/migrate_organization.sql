-- Migration: replace organization_id with origination_uri (Twilio origination URI).
-- Run this if you already have phone_numbers with organization_id.
-- New installs: tables are created by app (Base.metadata.create_all).

-- Add origination_uri for Twilio (SIP URI used for outbound/origination)
ALTER TABLE phone_numbers
  ADD COLUMN IF NOT EXISTS origination_uri VARCHAR NULL;

-- Remove organization link (optional: only if you previously ran the org migration)
ALTER TABLE phone_numbers
  DROP COLUMN IF EXISTS organization_id;

-- Drop organizations table if it exists (no longer used)
DROP TABLE IF EXISTS organizations;
