-- 001_create_tenants.sql
-- Root table for multi-tenant isolation

CREATE TABLE IF NOT EXISTS tenants (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                     VARCHAR(255) NOT NULL,
    slug                     VARCHAR(100) UNIQUE NOT NULL,
    plan                     VARCHAR(50) NOT NULL DEFAULT 'free'
                             CHECK (plan IN ('free', 'starter', 'business', 'enterprise')),
    rate_limit_per_sec       INT NOT NULL DEFAULT 10,
    monthly_quota            INT NOT NULL DEFAULT 10000,
    max_channels             INT NOT NULL DEFAULT 3,
    adaptive_routing_enabled BOOLEAN NOT NULL DEFAULT true,
    exploration_rate         FLOAT NOT NULL DEFAULT 0.1,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    suspended_at             TIMESTAMPTZ
);

CREATE INDEX idx_tenants_plan ON tenants(plan);
