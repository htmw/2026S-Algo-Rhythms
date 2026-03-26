-- 004_create_notifications.sql
-- Every notification request, with routing decision audit trail

CREATE TABLE IF NOT EXISTS notifications (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id          UUID NOT NULL REFERENCES tenants(id),
    idempotency_key    VARCHAR(255),
    recipient          VARCHAR(255) NOT NULL,
    channel_preference TEXT[],
    force_channel      VARCHAR(20),
    routing_mode       VARCHAR(10) NOT NULL DEFAULT 'adaptive'
                       CHECK (routing_mode IN ('adaptive', 'static', 'forced')),
    subject            VARCHAR(500),
    body               TEXT NOT NULL,
    body_html          TEXT,
    metadata           JSONB DEFAULT '{}',
    priority           VARCHAR(10) NOT NULL DEFAULT 'standard'
                       CHECK (priority IN ('critical', 'high', 'standard', 'bulk')),
    status             VARCHAR(20) NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'queued', 'processing', 'delivered', 'failed', 'dlq')),
    delivered_via      VARCHAR(20),
    delivered_at       TIMESTAMPTZ,
    failed_at          TIMESTAMPTZ,
    routing_decision   JSONB,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_idempotency
    ON notifications(tenant_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_tenant_status
    ON notifications(tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_notifications_tenant_created
    ON notifications(tenant_id, created_at DESC);
