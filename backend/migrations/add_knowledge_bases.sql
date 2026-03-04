-- Create knowledge_bases table for agent knowledge base feature.
-- Run once if the table does not exist (e.g. when not using create_all).

CREATE TABLE IF NOT EXISTS knowledge_bases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    agent_id UUID REFERENCES agents(id),
    name VARCHAR NOT NULL,
    content TEXT NOT NULL,
    source_type VARCHAR DEFAULT 'text',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
