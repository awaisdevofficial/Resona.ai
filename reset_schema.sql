-- Full reset schema for resona.ai (Supabase Postgres)
-- WARNING: This will DROP and RECREATE all application tables.
-- Run this only on a database where you are happy to lose existing data.

-- =========================================================
-- 0. DROP TABLES (in dependency-safe order)
-- =========================================================

DROP TABLE IF EXISTS call_statuses CASCADE;
DROP TABLE IF EXISTS directions CASCADE;
DROP TABLE IF EXISTS webhook_events CASCADE;
DROP TABLE IF EXISTS tts_voices CASCADE;
DROP TABLE IF EXISTS tts_providers CASCADE;
DROP TABLE IF EXISTS stt_models CASCADE;
DROP TABLE IF EXISTS stt_providers CASCADE;
DROP TABLE IF EXISTS llm_models CASCADE;
DROP TABLE IF EXISTS plan_limits CASCADE;

DROP TABLE IF EXISTS calls CASCADE;
DROP TABLE IF EXISTS phone_numbers CASCADE;
DROP TABLE IF EXISTS webhooks CASCADE;
DROP TABLE IF EXISTS api_keys CASCADE;
DROP TABLE IF EXISTS agents CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Optionally drop enum types so we can recreate them cleanly
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'call_status_enum') THEN
        DROP TYPE call_status_enum;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'direction_enum') THEN
        DROP TYPE direction_enum;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'plan_enum') THEN
        DROP TYPE plan_enum;
    END IF;
END$$;

-- =========================================================
-- 1. ENUM TYPES
-- =========================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'plan_enum') THEN
        CREATE TYPE plan_enum AS ENUM ('free', 'starter', 'pro', 'enterprise');
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'direction_enum') THEN
        CREATE TYPE direction_enum AS ENUM ('inbound', 'outbound');
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'call_status_enum') THEN
        CREATE TYPE call_status_enum AS ENUM (
            'queued',
            'ringing',
            'in_progress',
            'completed',
            'failed',
            'no_answer',
            'busy'
        );
    END IF;
END$$;

-- =========================================================
-- 2. CORE TABLES
-- =========================================================

-- Application users table (one row per Supabase auth user)
CREATE TABLE users (
    id                  UUID PRIMARY KEY,
    clerk_id            VARCHAR NOT NULL UNIQUE, -- stores Supabase auth.user.id
    email               VARCHAR NOT NULL UNIQUE,
    name                VARCHAR,
    plan                plan_enum DEFAULT 'free',
    minutes_used        INTEGER DEFAULT 0,
    minutes_limit       INTEGER DEFAULT 100,
    stripe_customer_id  VARCHAR UNIQUE,
    is_active           BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
    updated_at          TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
    twilio_account_sid  VARCHAR,
    twilio_auth_token   VARCHAR,
    twilio_from_number  VARCHAR
);

CREATE INDEX IF NOT EXISTS ix_users_clerk_id ON users (clerk_id);

-- Convenience view to match common Supabase "profiles" pattern
CREATE OR REPLACE VIEW profiles AS
SELECT
    id,
    clerk_id AS auth_user_id,
    email,
    name,
    plan,
    minutes_used,
    minutes_limit,
    stripe_customer_id,
    is_active,
    created_at,
    updated_at
FROM users;

-- Agents
CREATE TABLE agents (
    id               UUID PRIMARY KEY,
    user_id          UUID NOT NULL REFERENCES users(id),
    name             VARCHAR NOT NULL,
    description      TEXT,
    system_prompt    TEXT NOT NULL,
    first_message    VARCHAR,
    llm_model        VARCHAR DEFAULT 'gpt-4o-mini',
    llm_temperature  DOUBLE PRECISION DEFAULT 0.7,
    llm_max_tokens   INTEGER DEFAULT 500,
    stt_provider     VARCHAR DEFAULT 'deepgram',
    stt_model        VARCHAR DEFAULT 'nova-2-general',
    stt_language     VARCHAR DEFAULT 'en-US',
    tts_provider     VARCHAR DEFAULT 'elevenlabs',
    tts_voice_id     VARCHAR,
    tts_stability    DOUBLE PRECISION DEFAULT 0.5,
    silence_timeout  INTEGER DEFAULT 30,
    max_duration     INTEGER DEFAULT 3600,
    tools_config     JSONB DEFAULT '{}'::jsonb,
    is_active        BOOLEAN DEFAULT TRUE,
    created_at       TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
    updated_at       TIMESTAMP WITHOUT TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_agents_user_id ON agents (user_id);
CREATE INDEX IF NOT EXISTS ix_agents_is_active ON agents (is_active);
CREATE INDEX IF NOT EXISTS ix_agents_created_at ON agents (created_at);

-- Phone numbers
CREATE TABLE phone_numbers (
    id              UUID PRIMARY KEY,
    user_id         UUID NOT NULL REFERENCES users(id),
    agent_id        UUID REFERENCES agents(id),
    number          VARCHAR NOT NULL UNIQUE,
    twilio_sid      VARCHAR UNIQUE,
    termination_uri VARCHAR,
    friendly_name   VARCHAR,
    capabilities    JSONB DEFAULT '{}'::jsonb,
    is_active       BOOLEAN DEFAULT TRUE,
    monthly_cost    INTEGER,
    purchased_at    TIMESTAMP WITHOUT TIME ZONE,
    created_at      TIMESTAMP WITHOUT TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_phone_numbers_user_id ON phone_numbers (user_id);
CREATE INDEX IF NOT EXISTS ix_phone_numbers_agent_id ON phone_numbers (agent_id);
CREATE INDEX IF NOT EXISTS ix_phone_numbers_is_active ON phone_numbers (is_active);

-- Calls
CREATE TABLE calls (
    id               UUID PRIMARY KEY,
    agent_id         UUID REFERENCES agents(id),
    user_id          UUID NOT NULL REFERENCES users(id),
    phone_number_id  UUID REFERENCES phone_numbers(id),
    direction        direction_enum NOT NULL,
    status           call_status_enum DEFAULT 'queued',
    to_number        VARCHAR,
    from_number      VARCHAR,
    twilio_sid       VARCHAR UNIQUE,
    livekit_room     VARCHAR,
    started_at       TIMESTAMP WITHOUT TIME ZONE,
    ended_at         TIMESTAMP WITHOUT TIME ZONE,
    duration_seconds INTEGER,
    transcript       JSONB DEFAULT '[]'::jsonb,
    recording_url    VARCHAR,
    end_reason       VARCHAR,
    cost_cents       INTEGER DEFAULT 0,
    "metadata"       JSONB DEFAULT '{}'::jsonb,
    created_at       TIMESTAMP WITHOUT TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_calls_agent_id ON calls (agent_id);
CREATE INDEX IF NOT EXISTS ix_calls_user_id ON calls (user_id);
CREATE INDEX IF NOT EXISTS ix_calls_phone_number_id ON calls (phone_number_id);
CREATE INDEX IF NOT EXISTS ix_calls_status ON calls (status);
CREATE INDEX IF NOT EXISTS ix_calls_direction ON calls (direction);
CREATE INDEX IF NOT EXISTS ix_calls_created_at ON calls (created_at);

-- Webhooks
CREATE TABLE webhooks (
    id          UUID PRIMARY KEY,
    user_id     UUID NOT NULL REFERENCES users(id),
    url         VARCHAR NOT NULL,
    events      JSONB DEFAULT '[]'::jsonb,
    secret      VARCHAR,
    is_active   BOOLEAN DEFAULT TRUE,
    last_status INTEGER,
    created_at  TIMESTAMP WITHOUT TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_webhooks_user_id ON webhooks (user_id);

-- API keys
CREATE TABLE api_keys (
    id         UUID PRIMARY KEY,
    user_id    UUID NOT NULL REFERENCES users(id),
    name       VARCHAR,
    key_hash   VARCHAR NOT NULL UNIQUE,
    prefix     VARCHAR NOT NULL,
    last_used  TIMESTAMP WITHOUT TIME ZONE,
    expires_at TIMESTAMP WITHOUT TIME ZONE,
    is_active  BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_api_keys_user_id ON api_keys (user_id);

-- =========================================================
-- 3. REFERENCE TABLES (plans, models, TTS/STT, webhooks, statuses)
-- =========================================================

CREATE TABLE plan_limits (
    plan          plan_enum PRIMARY KEY,
    minutes_limit INTEGER NOT NULL,
    display_name  VARCHAR NOT NULL
);

INSERT INTO plan_limits (plan, minutes_limit, display_name) VALUES
    ('free',      100,  'Free'),
    ('starter',   500,  'Starter'),
    ('pro',       2000, 'Pro'),
    ('enterprise', -1,  'Enterprise')  -- -1 = unlimited
ON CONFLICT (plan) DO UPDATE
SET minutes_limit = EXCLUDED.minutes_limit,
    display_name  = EXCLUDED.display_name;

CREATE TABLE llm_models (
    id           VARCHAR PRIMARY KEY,
    display_name VARCHAR NOT NULL,
    provider     VARCHAR NOT NULL,
    is_default   BOOLEAN DEFAULT FALSE
);

INSERT INTO llm_models (id, display_name, provider, is_default) VALUES
    ('gpt-4o-mini',    'GPT-4o Mini',     'openai', TRUE),
    ('gpt-4o',         'GPT-4o',          'openai', FALSE),
    ('gpt-4-turbo',    'GPT-4 Turbo',     'openai', FALSE),
    ('gpt-3.5-turbo',  'GPT-3.5 Turbo',   'openai', FALSE)
ON CONFLICT (id) DO UPDATE
SET display_name = EXCLUDED.display_name,
    provider     = EXCLUDED.provider,
    is_default   = EXCLUDED.is_default;

CREATE TABLE stt_providers (
    id           VARCHAR PRIMARY KEY,
    display_name VARCHAR NOT NULL,
    is_default   BOOLEAN DEFAULT FALSE
);

INSERT INTO stt_providers (id, display_name, is_default) VALUES
    ('deepgram', 'Deepgram', TRUE),
    ('openai',   'OpenAI Whisper', FALSE),
    ('elevenlabs', 'ElevenLabs', FALSE)
ON CONFLICT (id) DO UPDATE
SET display_name = EXCLUDED.display_name,
    is_default   = EXCLUDED.is_default;

CREATE TABLE stt_models (
    id           VARCHAR PRIMARY KEY,
    provider_id  VARCHAR NOT NULL REFERENCES stt_providers(id),
    display_name VARCHAR NOT NULL,
    language     VARCHAR DEFAULT 'en-US',
    is_default   BOOLEAN DEFAULT FALSE
);

INSERT INTO stt_models (id, provider_id, display_name, language, is_default) VALUES
    ('nova-2-general',    'deepgram', 'Nova 2 General',     'en-US', TRUE),
    ('nova-2-phonecall',  'deepgram', 'Nova 2 Phone Call',  'en-US', FALSE),
    ('nova-2-meeting',    'deepgram', 'Nova 2 Meeting',     'en-US', FALSE),
    ('whisper-1',         'openai',   'Whisper 1',          'en-US', FALSE)
ON CONFLICT (id) DO UPDATE
SET display_name = EXCLUDED.display_name,
    provider_id  = EXCLUDED.provider_id,
    is_default   = EXCLUDED.is_default;

CREATE TABLE tts_providers (
    id           VARCHAR PRIMARY KEY,
    display_name VARCHAR NOT NULL,
    is_default   BOOLEAN DEFAULT FALSE
);

INSERT INTO tts_providers (id, display_name, is_default) VALUES
    ('elevenlabs', 'ElevenLabs', TRUE),
    ('deepgram',   'Deepgram',   FALSE),
    ('openai',     'OpenAI',     FALSE)
ON CONFLICT (id) DO UPDATE
SET display_name = EXCLUDED.display_name,
    is_default   = EXCLUDED.is_default;

CREATE TABLE tts_voices (
    id           VARCHAR PRIMARY KEY,
    provider_id  VARCHAR NOT NULL REFERENCES tts_providers(id),
    display_name VARCHAR NOT NULL,
    is_default   BOOLEAN DEFAULT FALSE
);

INSERT INTO tts_voices (id, provider_id, display_name, is_default) VALUES
    ('21m00Tcm4TlvDq8ikWAM', 'elevenlabs', 'Rachel',    TRUE),
    ('AZnzlk1XvdvUeBnXmlld', 'elevenlabs', 'Domi',     FALSE),
    ('EXAVITQu4vr4xnSDxMaL', 'elevenlabs', 'Bella',    FALSE),
    ('ErXwobaYiN019PkySvjV', 'elevenlabs', 'Antoni',   FALSE),
    ('MF3mGyEYCl7XYWbV9V6O', 'elevenlabs', 'Elli',     FALSE),
    ('TxGEqnHWrfWFTfGW9XjX', 'elevenlabs', 'Josh',     FALSE),
    ('VR6AewLTigWG4xSOukaG', 'elevenlabs', 'Arnold',   FALSE),
    ('pNInz6obpgDQGcFmaJgB', 'elevenlabs', 'Adam',     FALSE),
    ('yoZ06aMxZJJ28mfd3POQ', 'elevenlabs', 'Sam',      FALSE)
ON CONFLICT (id) DO UPDATE
SET display_name = EXCLUDED.display_name,
    provider_id  = EXCLUDED.provider_id,
    is_default   = EXCLUDED.is_default;

CREATE TABLE webhook_events (
    id           VARCHAR PRIMARY KEY,
    display_name VARCHAR NOT NULL,
    category     VARCHAR DEFAULT 'call'
);

INSERT INTO webhook_events (id, display_name, category) VALUES
    ('call.started',   'Call Started',   'call'),
    ('call.ended',     'Call Ended',     'call'),
    ('call.failed',    'Call Failed',    'call'),
    ('call.recording_ready', 'Recording Ready', 'call'),
    ('agent.created',  'Agent Created',  'agent'),
    ('agent.updated',  'Agent Updated',  'agent'),
    ('agent.deleted',  'Agent Deleted',  'agent'),
    ('phone_number.assigned', 'Phone Number Assigned', 'phone_number'),
    ('phone_number.released', 'Phone Number Released', 'phone_number')
ON CONFLICT (id) DO UPDATE
SET display_name = EXCLUDED.display_name,
    category     = EXCLUDED.category;

CREATE TABLE call_statuses (
    id           call_status_enum PRIMARY KEY,
    display_name VARCHAR NOT NULL,
    is_terminal  BOOLEAN DEFAULT FALSE
);

INSERT INTO call_statuses (id, display_name, is_terminal) VALUES
    ('queued',      'Queued',      FALSE),
    ('ringing',     'Ringing',     FALSE),
    ('in_progress', 'In Progress', FALSE),
    ('completed',   'Completed',   TRUE),
    ('failed',      'Failed',      TRUE),
    ('no_answer',   'No Answer',   TRUE),
    ('busy',        'Busy',        TRUE)
ON CONFLICT (id) DO UPDATE
SET display_name = EXCLUDED.display_name,
    is_terminal  = EXCLUDED.is_terminal;

CREATE TABLE directions (
    id           direction_enum PRIMARY KEY,
    display_name VARCHAR NOT NULL
);

INSERT INTO directions (id, display_name) VALUES
    ('inbound',  'Inbound'),
    ('outbound', 'Outbound')
ON CONFLICT (id) DO UPDATE
SET display_name = EXCLUDED.display_name;

-- =========================================================
-- 4. NOTES
-- =========================================================
-- - Supabase Auth users live in auth.users; this app keeps its own
--   per-project user data in the public.users table. The "clerk_id"
--   column now stores the Supabase auth user ID (UUID as text).
-- - The "profiles" view exposes a simplified profile representation
--   that matches common Supabase examples.

