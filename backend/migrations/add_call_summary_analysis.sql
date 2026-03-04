-- Add summary and analysis columns to calls table (for post-call analysis).
-- Run this once against your database if you get "column calls.summary does not exist".

ALTER TABLE calls ADD COLUMN IF NOT EXISTS summary TEXT;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS analysis JSONB;
