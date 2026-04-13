"""Feature schema mirror of apps/worker/src/features.ts.

The worker extracts features and sends them to /predict. This module defines
the canonical feature column ordering the model expects, plus a normalizer
that fills missing fields with safe defaults so a malformed request from a
buggy client doesn't crash inference.
"""
from __future__ import annotations

from typing import Any

# Order MUST match EngagementModel.FEATURE_COLUMNS in model.py.
FEATURE_COLUMNS: list[str] = [
    "channel_type_encoded",
    "hour_of_day",
    "day_of_week",
    "is_weekend",
    "historical_success_rate",
    "historical_engagement_rate",
    "hours_since_last_engagement",
    "hours_since_last_success",
    "avg_latency_ms",
    "attempts_30d",
    "notifications_sent_24h",
    "notifications_sent_7d",
    "notification_priority_score",
    "content_length",
    "channel_health",
]

# Defaults match the worker's behavior for missing recipient history (spec 5.3).
DEFAULTS: dict[str, float] = {
    "hour_of_day": 12,
    "day_of_week": 0,
    "is_weekend": 0,
    "historical_success_rate": 0.0,
    "historical_engagement_rate": 0.0,
    "hours_since_last_engagement": 720.0,
    "hours_since_last_success": 720.0,
    "avg_latency_ms": 1000.0,
    "attempts_30d": 0,
    "notifications_sent_24h": 0,
    "notifications_sent_7d": 0,
    "notification_priority_score": 2,
    "content_length": 0,
    "channel_health": 1.0,
}


def normalize_features(raw: dict[str, Any], channel_type: str) -> dict[str, Any]:
    """Return a feature dict with all expected keys present.

    `channel_type` is required and is added/overwritten on the result so the
    model encoder always sees a value. Missing numeric fields fall back to
    DEFAULTS so malformed payloads degrade gracefully instead of raising.
    """
    out: dict[str, Any] = {"channel_type": channel_type}
    for key, default in DEFAULTS.items():
        value = raw.get(key, default)
        out[key] = default if value is None else value
    return out
