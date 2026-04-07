"""ModelTrainer — bootstrap from synthetic, periodic retrain from DB.

Implements spec 5.6. Two entry points:

* `bootstrap_from_synthetic(n_samples)` — generates an in-memory training set
  with hidden user archetypes (no DB dependency) and trains a fresh model.
  Used on cold start when no model artifact exists yet.

* `retrain_from_db(database_url, tenant_id)` — pulls labeled delivery_attempts
  from Postgres and retrains. Returns the new model only if AUC improves over
  the current active model. Synchronous psycopg2 — called from a scheduled
  job, not the request path.

The synthetic data generator here is intentionally separate from
`synthetic.py` (which seeds the production DB tables). Keeping them split
means trainer tests don't need a database.
"""
from __future__ import annotations

import logging
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


def generate_synthetic_dataframe(n_samples: int = 10_000, seed: int = 42) -> pd.DataFrame:
    """In-process synthetic training data — no DB required."""
    rng = np.random.default_rng(seed)

    rows = []
    for _ in range(n_samples):
        archetype = _ARCHETYPE_NAMES[rng.integers(0, len(_ARCHETYPE_NAMES))]
        channel = _TRAIN_CHANNELS[rng.integers(0, len(_TRAIN_CHANNELS))]
        hour = int(rng.integers(0, 24))
        dow = int(rng.integers(0, 7))

        engage_rate = _ARCHETYPES[archetype][channel]
        # Time-of-day modifier for the work_hours_emailer archetype
        if archetype == "work_hours_emailer" and channel == "email":
            if not (9 <= hour <= 17 and dow < 5):
                engage_rate *= 0.25

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
                "engaged": engaged,
            }
        )

    return pd.DataFrame(rows)


# ───────────────────────── trainer ─────────────────────────


class ModelTrainer:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def bootstrap_from_synthetic(self, n_samples: Optional[int] = None) -> EngagementModel:
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
        return model

    def retrain_from_db(
        self,
        database_url: str,
        tenant_id: Optional[str] = None,
        current_model: Optional[EngagementModel] = None,
    ) -> Optional[EngagementModel]:
        """Pull last 30 days of labeled delivery_attempts and retrain.

        Returns the new model ONLY if AUC improves on the current model
        (or no current model exists). Returns None if there's not enough
        data or the new model didn't beat the incumbent.
        """
        # Local import so the prediction service doesn't need psycopg2 at import time.
        import json

        import psycopg2  # type: ignore

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
                       AND (%s::uuid IS NULL OR n.tenant_id = %s::uuid)
                    """,
                    (cutoff, tenant_id, tenant_id),
                )
                rows = cur.fetchall()
        finally:
            conn.close()

        if len(rows) < self.settings.min_training_samples:
            logger.info(
                "Only %d samples, need %d — staying in cold start",
                len(rows),
                self.settings.min_training_samples,
            )
            return None

        records = []
        for channel_type, engaged, feature_vector, _priority in rows:
            features = feature_vector if isinstance(feature_vector, dict) else json.loads(feature_vector or "{}")
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
            return None

        new_model.save(self.settings.model_path)
        logger.info("Promoted new model %s (AUC %.4f)", new_model.version, metrics["auc_roc"])
        return new_model

    def exploration_rate_for_volume(self, sample_count: int) -> float:
        """Map data volume to the spec 5.6 phase exploration rate."""
        if sample_count < self.settings.min_training_samples:
            return self.settings.cold_start_exploration
        if sample_count < self.settings.mature_threshold:
            return self.settings.initial_exploration
        return self.settings.mature_exploration
