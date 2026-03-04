-- Migration: Add missing indexes, seed data, and schema sync
-- Run this after schema.sql on existing databases
-- PostgreSQL

-- =========================================================
-- 1. MISSING INDEXES (performance)
-- =========================================================

CREATE INDEX IF NOT EXISTS ix_users_clerk_id ON users (clerk_id);
CREATE INDEX IF NOT EXISTS ix_phone_numbers_user_id ON phone_numbers (user_id);
CREATE INDEX IF NOT EXISTS ix_phone_numbers_agent_id ON phone_numbers (agent_id);
CREATE INDEX IF NOT EXISTS ix_calls_phone_number_id ON calls (phone_number_id);
CREATE INDEX IF NOT EXISTS ix_webhooks_user_id ON webhooks (user_id);
CREATE INDEX IF NOT EXISTS ix_api_keys_user_id ON api_keys (user_id);
CREATE INDEX IF NOT EXISTS ix_agents_is_active ON agents (is_active);
CREATE INDEX IF NOT EXISTS ix_agents_created_at ON agents (created_at);
CREATE INDEX IF NOT EXISTS ix_calls_status ON calls (status);
CREATE INDEX IF NOT EXISTS ix_calls_direction ON calls (direction);
CREATE INDEX IF NOT EXISTS ix_calls_created_at ON calls (created_at);
CREATE INDEX IF NOT EXISTS ix_phone_numbers_is_active ON phone_numbers (is_active);

-- =========================================================
-- 2. PLAN LIMITS REFERENCE TABLE (optional - for plan-based limits)
-- =========================================================
-- Use this if your app looks up minutes_limit by plan
-- Drops cleanly if you prefer plan limits only on users

CREATE TABLE IF NOT EXISTS plan_limits (
    plan          plan_enum PRIMARY KEY,
    minutes_limit INTEGER NOT NULL,
    display_name  VARCHAR NOT NULL
);

-- Seed plan limits (idempotent)
INSERT INTO plan_limits (plan, minutes_limit, display_name)
VALUES
    ('free',      100,  'Free'),
    ('starter',   500,  'Starter'),
    ('pro',       2000, 'Pro'),
    ('enterprise', -1,  'Enterprise')  -- -1 = unlimited
ON CONFLICT (plan) DO UPDATE SET
    minutes_limit = EXCLUDED.minutes_limit,
    display_name  = EXCLUDED.display_name;

-- =========================================================
-- 3. AGENT REFERENCE TABLES (LLM, STT, TTS options)
-- =========================================================

CREATE TABLE IF NOT EXISTS llm_models (
    id           VARCHAR PRIMARY KEY,
    display_name VARCHAR NOT NULL,
    provider     VARCHAR NOT NULL,
    is_default   BOOLEAN DEFAULT FALSE
);

INSERT INTO llm_models (id, display_name, provider, is_default)
VALUES
    ('gpt-4o-mini',    'GPT-4o Mini',     'openai', TRUE),
    ('gpt-4o',         'GPT-4o',          'openai', FALSE),
    ('gpt-4-turbo',    'GPT-4 Turbo',     'openai', FALSE),
    ('gpt-3.5-turbo',  'GPT-3.5 Turbo',   'openai', FALSE)
ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, provider = EXCLUDED.provider, is_default = EXCLUDED.is_default;

CREATE TABLE IF NOT EXISTS stt_providers (
    id           VARCHAR PRIMARY KEY,
    display_name VARCHAR NOT NULL,
    is_default   BOOLEAN DEFAULT FALSE
);

INSERT INTO stt_providers (id, display_name, is_default)
VALUES
    ('deepgram', 'Deepgram', TRUE),
    ('openai',   'OpenAI Whisper', FALSE),
    ('elevenlabs', 'ElevenLabs', FALSE)
ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, is_default = EXCLUDED.is_default;

CREATE TABLE IF NOT EXISTS stt_models (
    id           VARCHAR PRIMARY KEY,
    provider_id  VARCHAR NOT NULL REFERENCES stt_providers(id),
    display_name VARCHAR NOT NULL,
    language     VARCHAR DEFAULT 'en-US',
    is_default   BOOLEAN DEFAULT FALSE
);

INSERT INTO stt_models (id, provider_id, display_name, language, is_default)
VALUES
    ('nova-2-general',    'deepgram', 'Nova 2 General',     'en-US', TRUE),
    ('nova-2-phonecall',  'deepgram', 'Nova 2 Phone Call',  'en-US', FALSE),
    ('nova-2-meeting',    'deepgram', 'Nova 2 Meeting',     'en-US', FALSE),
    ('whisper-1',         'openai',   'Whisper 1',          'en-US', FALSE)
ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, provider_id = EXCLUDED.provider_id, is_default = EXCLUDED.is_default;

CREATE TABLE IF NOT EXISTS tts_providers (
    id           VARCHAR PRIMARY KEY,
    display_name VARCHAR NOT NULL,
    is_default   BOOLEAN DEFAULT FALSE
);

INSERT INTO tts_providers (id, display_name, is_default)
VALUES
    ('elevenlabs', 'ElevenLabs', TRUE),
    ('deepgram',   'Deepgram',   FALSE),
    ('openai',     'OpenAI',     FALSE)
ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, is_default = EXCLUDED.is_default;

CREATE TABLE IF NOT EXISTS tts_voices (
    id           VARCHAR PRIMARY KEY,
    provider_id  VARCHAR NOT NULL REFERENCES tts_providers(id),
    display_name VARCHAR NOT NULL,
    is_default   BOOLEAN DEFAULT FALSE
);

INSERT INTO tts_voices (id, provider_id, display_name, is_default)
VALUES
    ('21m00Tcm4TlvDq8ikWAM', 'elevenlabs', 'Rachel',    TRUE),
    ('AZnzlk1XvdvUeBnXmlld', 'elevenlabs', 'Domi',     FALSE),
    ('EXAVITQu4vr4xnSDxMaL', 'elevenlabs', 'Bella',    FALSE),
    ('ErXwobaYiN019PkySvjV', 'elevenlabs', 'Antoni',   FALSE),
    ('MF3mGyEYCl7XYWbV9V6O', 'elevenlabs', 'Elli',     FALSE),
    ('TxGEqnHWrfWFTfGW9XjX', 'elevenlabs', 'Josh',     FALSE),
    ('VR6AewLTigWG4xSOukaG', 'elevenlabs', 'Arnold',   FALSE),
    ('pNInz6obpgDQGcFmaJgB', 'elevenlabs', 'Adam',     FALSE),
    ('yoZ06aMxZJJ28mfd3POQ', 'elevenlabs', 'Sam',      FALSE)
ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, provider_id = EXCLUDED.provider_id, is_default = EXCLUDED.is_default;

-- =========================================================
-- 4. WEBHOOK EVENTS REFERENCE
-- =========================================================

CREATE TABLE IF NOT EXISTS webhook_events (
    id           VARCHAR PRIMARY KEY,
    display_name VARCHAR NOT NULL,
    category     VARCHAR DEFAULT 'call'
);

INSERT INTO webhook_events (id, display_name, category)
VALUES
    ('call.started',   'Call Started',   'call'),
    ('call.ended',     'Call Ended',     'call'),
    ('call.failed',    'Call Failed',    'call'),
    ('call.recording_ready', 'Recording Ready', 'call'),
    ('agent.created',  'Agent Created',  'agent'),
    ('agent.updated',  'Agent Updated',  'agent'),
    ('agent.deleted',  'Agent Deleted',  'agent'),
    ('phone_number.assigned', 'Phone Number Assigned', 'phone_number'),
    ('phone_number.released', 'Phone Number Released', 'phone_number')
ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, category = EXCLUDED.category;

-- =========================================================
-- 5. CALL STATUS REFERENCE (mirrors call_status_enum)
-- =========================================================

CREATE TABLE IF NOT EXISTS call_statuses (
    id           call_status_enum PRIMARY KEY,
    display_name VARCHAR NOT NULL,
    is_terminal  BOOLEAN DEFAULT FALSE
);

INSERT INTO call_statuses (id, display_name, is_terminal)
VALUES
    ('queued',      'Queued',      FALSE),
    ('ringing',     'Ringing',     FALSE),
    ('in_progress', 'In Progress', FALSE),
    ('completed',   'Completed',   TRUE),
    ('failed',      'Failed',      TRUE),
    ('no_answer',   'No Answer',   TRUE),
    ('busy',        'Busy',        TRUE)
ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, is_terminal = EXCLUDED.is_terminal;

-- =========================================================
-- 6. DIRECTION REFERENCE (mirrors direction_enum)
-- =========================================================

CREATE TABLE IF NOT EXISTS directions (
    id           direction_enum PRIMARY KEY,
    display_name VARCHAR NOT NULL
);

INSERT INTO directions (id, display_name)
VALUES
    ('inbound',  'Inbound'),
    ('outbound', 'Outbound')
ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name;

-- =========================================================
-- 7. ROW LEVEL POLICIES (optional - if using RLS later)
-- =========================================================
-- Uncomment when enabling RLS
-- ALTER TABLE users ENABLE ROW LEVEL SECURITY;
-- etc.
