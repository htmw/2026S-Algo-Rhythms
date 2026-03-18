-- 002_create_api_keys.sql
-- SHA-256 hashed API keys with scopes, per tenant

CREATE TABLE IF NOT EXISTS api_keys (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    key_hash     VARCHAR(64) NOT NULL UNIQUE,
    key_prefix   VARCHAR(8) NOT NULL,
    label        VARCHAR(255),
    scopes       TEXT[] NOT NULL DEFAULT '{notifications:write}',
    last_used_at TIMESTAMPTZ,
    expires_at   TIMESTAMPTZ,
    revoked_at   TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_hash
    ON api_keys(key_hash) WHERE revoked_at IS NULL;
