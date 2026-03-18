-- 007_create_model_metadata.sql
-- Trained model versions with evaluation metrics and feature importance
-- tenant_id NULL = global model, UUID = tenant-specific model

CREATE TABLE IF NOT EXISTS model_metadata (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id          UUID REFERENCES tenants(id),
    version            VARCHAR(20) NOT NULL,
    model_path         VARCHAR(500) NOT NULL,
    training_samples   INT NOT NULL,
    training_date      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    feature_columns    TEXT[] NOT NULL,
    accuracy           FLOAT,
    auc_roc            FLOAT,
    precision_score    FLOAT,
    recall_score       FLOAT,
    f1_score           FLOAT,
    feature_importance JSONB,
    is_active          BOOLEAN NOT NULL DEFAULT false,
    promoted_at        TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
