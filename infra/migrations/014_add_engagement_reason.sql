ALTER TABLE delivery_attempts
    ADD COLUMN IF NOT EXISTS engagement_reason TEXT;
