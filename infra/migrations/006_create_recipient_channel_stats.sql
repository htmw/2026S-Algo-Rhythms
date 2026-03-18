-- 006_create_recipient_channel_stats.sql
-- Aggregated per-recipient per-channel stats used as ML feature input

CREATE TABLE IF NOT EXISTS recipient_channel_stats (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                 UUID NOT NULL REFERENCES tenants(id),
    recipient                 VARCHAR(255) NOT NULL,
    channel_type              VARCHAR(20) NOT NULL,
    attempts_30d              INT NOT NULL DEFAULT 0,
    successes_30d             INT NOT NULL DEFAULT 0,
    engagements_30d           INT NOT NULL DEFAULT 0,
    avg_latency_ms            FLOAT,
    last_success_at           TIMESTAMPTZ,
    last_engaged_at           TIMESTAMPTZ,
    last_failure_at           TIMESTAMPTZ,
    notifications_received_24h INT NOT NULL DEFAULT 0,
    notifications_received_7d  INT NOT NULL DEFAULT 0,
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, recipient, channel_type)
);

CREATE INDEX IF NOT EXISTS idx_rcs_lookup
    ON recipient_channel_stats(tenant_id, recipient);
