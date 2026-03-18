-- 003_create_channels.sql
-- Per-tenant delivery channel configurations with circuit breaker state

CREATE TABLE IF NOT EXISTS channels (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    type              VARCHAR(20) NOT NULL
                      CHECK (type IN ('email', 'sms_webhook', 'websocket', 'webhook')),
    label             VARCHAR(255) NOT NULL,
    config            JSONB NOT NULL DEFAULT '{}',
    priority          INT NOT NULL DEFAULT 0,
    is_enabled        BOOLEAN NOT NULL DEFAULT true,
    circuit_state     VARCHAR(10) NOT NULL DEFAULT 'closed'
                      CHECK (circuit_state IN ('closed', 'open', 'half_open')),
    failure_count     INT NOT NULL DEFAULT 0,
    last_failure_at   TIMESTAMPTZ,
    circuit_opened_at TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
