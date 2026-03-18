-- 009_enable_rls.sql
-- Row-level security policies for tenant isolation
-- All policies use: current_setting('app.current_tenant_id')::uuid = tenant_id
-- tenants and api_keys are excluded (accessed by auth middleware before tenant context is set)

-- channels
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE channels FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_channels ON channels
    FOR ALL
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
    WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- notifications
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_notifications ON notifications
    FOR ALL
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
    WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- delivery_attempts (denormalized tenant_id — direct check, no joins)
ALTER TABLE delivery_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_attempts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_delivery_attempts ON delivery_attempts
    FOR ALL
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
    WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- recipient_channel_stats
ALTER TABLE recipient_channel_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipient_channel_stats FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_rcs ON recipient_channel_stats
    FOR ALL
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
    WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- model_metadata (allow global models where tenant_id IS NULL)
ALTER TABLE model_metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_metadata FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_model_metadata ON model_metadata
    FOR ALL
    USING (
        tenant_id IS NULL
        OR tenant_id = current_setting('app.current_tenant_id')::uuid
    )
    WITH CHECK (
        tenant_id IS NULL
        OR tenant_id = current_setting('app.current_tenant_id')::uuid
    );

-- usage_records
ALTER TABLE usage_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_records FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_usage_records ON usage_records
    FOR ALL
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
    WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
