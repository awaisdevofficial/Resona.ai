-- PostgreSQL schema for resona.ai
-- Generated from SQLAlchemy models in backend/app/models

-- =========================================================
-- ENUM TYPES
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
-- TABLE: users
-- =========================================================

CREATE TABLE IF NOT EXISTS users (
    id                  UUID PRIMARY KEY,
    clerk_id            VARCHAR NOT NULL UNIQUE,
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

-- clerk_id has UNIQUE which creates an index; explicit index optional
-- CREATE INDEX IF NOT EXISTS ix_users_clerk_id ON users (clerk_id);

-- =========================================================
-- TABLE: agents
-- =========================================================

CREATE TABLE IF NOT EXISTS agents (
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

-- =========================================================
-- TABLE: phone_numbers
-- =========================================================

CREATE TABLE IF NOT EXISTS phone_numbers (
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

-- =========================================================
-- TABLE: calls
-- =========================================================

CREATE TABLE IF NOT EXISTS calls (
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
-- twilio_sid is UNIQUE and therefore indexed

-- =========================================================
-- TABLE: webhooks
-- =========================================================

CREATE TABLE IF NOT EXISTS webhooks (
    id          UUID PRIMARY KEY,
    user_id     UUID NOT NULL REFERENCES users(id),
    url         VARCHAR NOT NULL,
    events      JSONB DEFAULT '[]'::jsonb,
    secret      VARCHAR,
    is_active   BOOLEAN DEFAULT TRUE,
    last_status INTEGER,
    created_at  TIMESTAMP WITHOUT TIME ZONE DEFAULT now()
);

-- =========================================================
-- TABLE: api_keys
-- =========================================================

CREATE TABLE IF NOT EXISTS api_keys (
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

-- key_hash is UNIQUE and therefore indexed

