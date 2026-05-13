"""ModelTrainer — bootstrap from synthetic, periodic retrain from DB.

Implements spec 5.6. Two entry points:

* `bootstrap_from_synthetic(n_samples, database_url)` — generates an in-memory
  training set with hidden user archetypes and trains a fresh model.
  Used on cold start when no model artifact exists yet. When database_url is
  provided, records the model in model_metadata.

* `retrain_from_db(database_url, tenant_id)` — pulls labeled delivery_attempts
  from Postgres and retrains. Returns the new model only if AUC improves over
  the current active model. Synchronous psycopg2 — called from a scheduled
  job, not the request path. Records the model in model_metadata on promotion.

The synthetic data generator here is intentionally separate from
`synthetic.py` (which seeds the production DB tables). Keeping them split
means trainer tests don't need a database.
"""
from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timedelta
from typing import Optional

import numpy as np
import pandas as pd

from config import CANONICAL_CHANNELS, Settings
from model import EngagementModel

logger = logging.getLogger(__name__)


# ───────────────────────── synthetic generator ─────────────────────────

# Hidden archetypes the model must discover. Engagement rates per channel
# differ enough that XGBoost should easily learn them.
_ARCHETYPES: dict[str, dict[str, float]] = {
    "email_loyalist": {"email": 0.85, "websocket": 0.15, "sms_webhook": 0.50},
    "push_native": {"email": 0.20, "websocket": 0.90, "sms_webhook": 0.70},
    "work_hours_emailer": {"email": 0.80, "websocket": 0.55, "sms_webhook": 0.40},
    "going_dark": {"email": 0.25, "websocket": 0.20, "sms_webhook": 0.15},
    "channel_switcher": {"email": 0.60, "websocket": 0.65, "sms_webhook": 0.55},
}
_ARCHETYPE_NAMES = list(_ARCHETYPES.keys())
_TRAIN_CHANNELS = ["email", "websocket", "sms_webhook"]


_CONTENT_CATEGORIES = {
    0: {"name": "marketing", "urgency": (0.1, 0.3), "time_sens": (0.2, 0.6), "sentiment": (0.6, 0.9)},
    1: {"name": "transactional", "urgency": (0.4, 0.7), "time_sens": (0.3, 0.6), "sentiment": (0.4, 0.6)},
    2: {"name": "security", "urgency": (0.8, 1.0), "time_sens": (0.7, 1.0), "sentiment": (0.2, 0.5)},
    3: {"name": "account", "urgency": (0.3, 0.6), "time_sens": (0.2, 0.5), "sentiment": (0.4, 0.6)},
    4: {"name": "social", "urgency": (0.1, 0.4), "time_sens": (0.1, 0.4), "sentiment": (0.5, 0.8)},
    5: {"name": "system", "urgency": (0.5, 0.8), "time_sens": (0.4, 0.7), "sentiment": (0.3, 0.5)},
}


def generate_synthetic_dataframe(n_samples: int = 10_000, seed: int = 42) -> pd.DataFrame:
    """In-process synthetic training data — no DB required."""
    rng = np.random.default_rng(seed)

    rows = []
    for _ in range(n_samples):
        archetype = _ARCHETYPE_NAMES[rng.integers(0, len(_ARCHETYPE_NAMES))]
        channel = _TRAIN_CHANNELS[rng.integers(0, len(_TRAIN_CHANNELS))]
        hour = int(rng.integers(0, 24))
        dow = int(rng.integers(0, 7))

        category = int(rng.integers(0, len(_CONTENT_CATEGORIES)))
        cat_info = _CONTENT_CATEGORIES[category]
        urgency = float(np.clip(rng.uniform(*cat_info["urgency"]), 0.0, 1.0))
        time_sensitivity = float(np.clip(rng.uniform(*cat_info["time_sens"]), 0.0, 1.0))
        sentiment = float(np.clip(rng.uniform(*cat_info["sentiment"]), 0.0, 1.0))

        engage_rate = _ARCHETYPES[archetype][channel]
        # Time-of-day modifier for the work_hours_emailer archetype
        if archetype == "work_hours_emailer" and channel == "email":
            if not (9 <= hour <= 17 and dow < 5):
                engage_rate *= 0.25
        # Higher urgency boosts engagement across all archetypes
        engage_rate = min(1.0, engage_rate + urgency * 0.15)

        engaged = int(rng.random() < engage_rate)

        rows.append(
            {
                "channel_type": channel,
                "hour_of_day": hour,
                "day_of_week": dow,
                "is_weekend": int(dow >= 5),
                "historical_success_rate": float(np.clip(rng.normal(0.75, 0.15), 0.0, 1.0)),
                "historical_engagement_rate": float(
                    np.clip(rng.normal(engage_rate, 0.1), 0.0, 1.0)
                ),
                "hours_since_last_engagement": float(max(1.0, rng.exponential(48))),
                "hours_since_last_success": float(max(1.0, rng.exponential(24))),
                "avg_latency_ms": float(max(5.0, rng.normal(300, 100))),
                "attempts_30d": int(rng.integers(5, 50)),
                "notifications_sent_24h": int(rng.integers(0, 10)),
                "notifications_sent_7d": int(rng.integers(0, 40)),
                "notification_priority_score": int(rng.integers(1, 5)),
                "content_length": int(rng.integers(20, 500)),
                "channel_health": float(rng.choice([0.0, 1.0], p=[0.05, 0.95])),
                "urgency_score": round(urgency, 3),
                "category_encoded": category,
                "time_sensitivity_score": round(time_sensitivity, 3),
                "sentiment_score": round(sentiment, 3),
                "engaged": engaged,
            }
        )

    return pd.DataFrame(rows)


# ───────────────────────── trainer ─────────────────────────


def _insert_model_metadata(
    conn,
    model: EngagementModel,
    model_path: str,
    is_active: bool,
    tenant_id: Optional[str] = None,
) -> str:
    """INSERT a row into model_metadata and return the generated UUID."""
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO model_metadata (
                tenant_id, version, model_path, training_samples,
                feature_columns, accuracy, auc_roc, precision_score,
                recall_score, f1_score, feature_importance,
                is_active, promoted_at
            ) VALUES (
                %s, %s, %s, %s,
                %s, %s, %s, %s,
                %s, %s, %s::jsonb,
                %s, CASE WHEN %s THEN NOW() ELSE NULL END
            )
            RETURNING id
            """,
            (
                tenant_id,
                model.version,
                model_path,
                model.metrics.get("training_samples", 0),
                model.FEATURE_COLUMNS,
                model.metrics.get("accuracy"),
                model.metrics.get("auc_roc"),
                model.metrics.get("precision"),
                model.metrics.get("recall"),
                model.metrics.get("f1"),
                json.dumps(model.feature_importance) if model.feature_importance else None,
                is_active,
                is_active,
            ),
        )
        row = cur.fetchone()
        conn.commit()
        return str(row[0])


class ModelTrainer:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def bootstrap_from_synthetic(
        self,
        n_samples: Optional[int] = None,
        database_url: Optional[str] = None,
    ) -> EngagementModel:
        """Train a fresh model from synthetic data and persist to settings.model_path."""
        n = n_samples or self.settings.bootstrap_samples
        logger.info("Bootstrapping model from %d synthetic samples", n)

        df = generate_synthetic_dataframe(n)
        model = EngagementModel()
        model.version = f"bootstrap-{datetime.utcnow().strftime('%Y%m%dT%H%M%SZ')}"
        metrics = model.train(df)
        logger.info("Bootstrap model trained: %s", metrics)

        model.save(self.settings.model_path)
        logger.info("Bootstrap model saved to %s", self.settings.model_path)

        db_url = database_url or os.environ.get("DATABASE_URL")
        if db_url:
            import psycopg2  # type: ignore

            conn = psycopg2.connect(db_url)
            try:
                with conn.cursor() as cur:
                    cur.execute(
                        "UPDATE model_metadata SET is_active = false WHERE is_active = true AND tenant_id IS NULL"
                    )
                    conn.commit()
                metadata_id = _insert_model_metadata(
                    conn, model, str(self.settings.model_path), is_active=True,
                )
                logger.info("Bootstrap model_metadata row: %s", metadata_id)
            finally:
                conn.close()
        else:
            logger.warning("No DATABASE_URL — skipping model_metadata insert")

        return model

    def retrain_from_db(
        self,
        database_url: str,
        tenant_id: Optional[str] = None,
        current_model: Optional[EngagementModel] = None,
    ) -> tuple[Optional[EngagementModel], Optional[str]]:
        """Pull last 30 days of labeled delivery_attempts and retrain.

        Returns (new_model, metadata_id) if AUC improves, else (None, None).
        """
        import psycopg2  # type: ignore

        from features import DEFAULTS as FEATURE_DEFAULTS

        cutoff = datetime.utcnow() - timedelta(days=30)

        conn = psycopg2.connect(database_url)
        try:
            with conn.cursor() as cur:
                if tenant_id:
                    cur.execute(
                        "SELECT set_config('app.current_tenant_id', %s, false)",
                        (tenant_id,),
                    )

                cur.execute(
                    """
                    SELECT da.channel_type, da.engaged, da.feature_vector, n.priority
                      FROM delivery_attempts da
                      JOIN notifications n ON da.notification_id = n.id
                     WHERE da.started_at >= %s
                       AND da.status = 'success'
                       AND da.engaged IS NOT NULL
                       AND da.feature_vector IS NOT NULL
                       AND (%s::uuid IS NULL OR n.tenant_id = %s::uuid)
                    """,
                    (cutoff, tenant_id, tenant_id),
                )
                rows = cur.fetchall()

            if len(rows) < self.settings.min_training_samples:
                logger.info(
                    "Only %d samples, need %d — staying in cold start",
                    len(rows),
                    self.settings.min_training_samples,
                )
                return None, None

            records = []
            for channel_type, engaged, feature_vector, _priority in rows:
                features = feature_vector if isinstance(feature_vector, dict) else json.loads(feature_vector or "{}")
                for key, default in FEATURE_DEFAULTS.items():
                    if features.get(key) is None:
                        features[key] = default
                features["channel_type"] = channel_type
                features["engaged"] = 1 if engaged else 0
                records.append(features)

            df = pd.DataFrame(records)
            new_model = EngagementModel()
            new_model.version = f"v{int(datetime.utcnow().timestamp())}"
            metrics = new_model.train(df)

            current_auc = (current_model.metrics.get("auc_roc", 0.0) if current_model else 0.0)
            if metrics["auc_roc"] <= current_auc:
                logger.info(
                    "New model AUC %.4f did not beat current %.4f — discarding",
                    metrics["auc_roc"],
                    current_auc,
                )
                return None, None

            new_model.save(self.settings.model_path)
            logger.info("Promoted new model %s (AUC %.4f)", new_model.version, metrics["auc_roc"])

            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE model_metadata SET is_active = false WHERE is_active = true AND (tenant_id = %s OR (%s IS NULL AND tenant_id IS NULL))",
                    (tenant_id, tenant_id),
                )
                conn.commit()
            metadata_id = _insert_model_metadata(
                conn, new_model, str(self.settings.model_path),
                is_active=True, tenant_id=tenant_id,
            )
            logger.info("Retrain model_metadata row: %s", metadata_id)
            return new_model, metadata_id
        finally:
            conn.close()

    def exploration_rate_for_volume(self, sample_count: int) -> float:
        """Map data volume to the spec 5.6 phase exploration rate."""
        if sample_count < self.settings.min_training_samples:
            return self.settings.cold_start_exploration
        if sample_count < self.settings.mature_threshold:
            return self.settings.initial_exploration
        return self.settings.mature_exploration
