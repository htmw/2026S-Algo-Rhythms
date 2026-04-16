-- 011_engagement_tenant_lookup.sql
-- SECURITY DEFINER helper for the public (unauthenticated) engagement tracking pixel.
--
-- The /v1/engagement/track endpoint receives a notification_id from an email open
-- and must discover the owning tenant_id BEFORE it can set app.current_tenant_id
-- for RLS. Calling the RLS-protected notifications table without tenant context
-- would either error (on non-superuser roles when current_setting is empty) or
-- silently return no rows.
--
-- This function runs with the owner's privileges (SECURITY DEFINER), bypassing
-- the RLS policy on notifications just long enough to resolve a notification_id
-- to its tenant_id. The caller then sets the RLS context and runs all
-- subsequent queries under normal tenant-scoped policy enforcement.

CREATE OR REPLACE FUNCTION get_tenant_for_notification(p_notification_id UUID)
RETURNS UUID AS $$
    SELECT tenant_id FROM notifications WHERE id = p_notification_id;
$$ LANGUAGE sql SECURITY DEFINER STABLE;
