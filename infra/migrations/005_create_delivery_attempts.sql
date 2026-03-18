-- 005_create_delivery_attempts.sql
-- Every delivery attempt = one ML training example
-- tenant_id is denormalized for direct RLS without joins

CREATE TABLE IF NOT EXISTS delivery_attempts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    notification_id UUID NOT NULL REFERENCES notifications(id),
    channel_id      UUID NOT NULL REFERENCES channels(id),
    channel_type    VARCHAR(20) NOT NULL,
    attempt_number  INT NOT NULL DEFAULT 1,
    status          VARCHAR(20) NOT NULL
                    CHECK (status IN ('pending', 'success', 'failure', 'timeout')),
    status_code     INT,
    error_message   TEXT,
    response_body   TEXT,
    engaged         BOOLEAN,
    engaged_at      TIMESTAMPTZ,
    engagement_type VARCHAR(30),
    started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at    TIMESTAMPTZ,
    duration_ms     INT,
    feature_vector  JSONB
);

CREATE INDEX IF NOT EXISTS idx_delivery_attempts_notification
    ON delivery_attempts(notification_id);

CREATE INDEX IF NOT EXISTS idx_delivery_attempts_training
    ON delivery_attempts(channel_type, status, engaged, started_at)
    WHERE status = 'success';
