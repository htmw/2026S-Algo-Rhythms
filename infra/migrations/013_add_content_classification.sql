-- 012_add_content_classification.sql
-- Add JSONB column for ML content classification results on each notification.

ALTER TABLE notifications
    ADD COLUMN IF NOT EXISTS content_classification JSONB DEFAULT NULL;
