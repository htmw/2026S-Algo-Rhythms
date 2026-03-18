-- 008_create_usage_records.sql
-- Per-tenant usage metering per billing period

CREATE TABLE IF NOT EXISTS usage_records (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                 UUID NOT NULL REFERENCES tenants(id),
    period_start              DATE NOT NULL,
    period_end                DATE NOT NULL,
    notifications_sent        INT NOT NULL DEFAULT 0,
    notifications_failed      INT NOT NULL DEFAULT 0,
    channel_breakdown         JSONB DEFAULT '{}',
    adaptive_routing_overrides INT NOT NULL DEFAULT 0,
    exploration_count         INT NOT NULL DEFAULT 0,
    created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, period_start)
);
