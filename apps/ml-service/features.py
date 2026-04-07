"""Python mirror of apps/worker/src/features.ts.

Both code paths must produce identical feature vectors so the model trains on
the same shape it sees at inference time.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional, TypedDict

PRIORITY_SCORE: dict[str, int] = {
    "critical": 4,
    "high": 3,
    "standard": 2,
    "bulk": 1,
}

DEFAULT_HOURS_SINCE: float = 720.0  # 30 days
DEFAULT_AVG_LATENCY_MS: float = 1000.0


class RecipientChannelStats(TypedDict, total=False):
    channel_type: str
    attempts_30d: int
    successes_30d: int
    engagements_30d: int
    avg_latency_ms: Optional[float]
    last_success_at: Optional[datetime]
    last_engaged_at: Optional[datetime]
    notifications_received_24h: int
    notifications_received_7d: int


class FeatureVector(TypedDict):
    channel_type: str
    hour_of_day: int
    day_of_week: int
    is_weekend: int
    historical_success_rate: float
    historical_engagement_rate: float
    hours_since_last_engagement: float
    hours_since_last_success: float
    avg_latency_ms: float
    attempts_30d: int
    notifications_sent_24h: int
    notifications_sent_7d: int
    notification_priority_score: int
    content_length: int
    channel_health: float


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


def _hours_since(dt: Optional[datetime], now: datetime) -> float:
    if dt is None:
        return DEFAULT_HOURS_SINCE
    return (now - dt).total_seconds() / 3600.0


def extract_features(
    *,
    channel_type: str,
    priority: str,
    body_length: int,
    circuit_state: str,
    stats: Optional[RecipientChannelStats] = None,
    now: Optional[datetime] = None,
) -> FeatureVector:
    """Build the canonical 15-feature vector for one (recipient, channel) pair."""
    now = now or datetime.utcnow()
    s: RecipientChannelStats = stats or {}

    attempts = int(s.get("attempts_30d") or 0)
    successes = int(s.get("successes_30d") or 0)
    engagements = int(s.get("engagements_30d") or 0)

    sunday_based = now.weekday()  # Python: Monday=0..Sunday=6 — already correct
    day_of_week = sunday_based

    return FeatureVector(
        channel_type=channel_type,
        hour_of_day=now.hour,
        day_of_week=day_of_week,
        is_weekend=1 if day_of_week >= 5 else 0,
        historical_success_rate=successes / max(attempts, 1),
        historical_engagement_rate=engagements / max(successes, 1),
        hours_since_last_engagement=_hours_since(s.get("last_engaged_at"), now),
        hours_since_last_success=_hours_since(s.get("last_success_at"), now),
        avg_latency_ms=float(s.get("avg_latency_ms") or DEFAULT_AVG_LATENCY_MS),
        attempts_30d=attempts,
        notifications_sent_24h=int(s.get("notifications_received_24h") or 0),
        notifications_sent_7d=int(s.get("notifications_received_7d") or 0),
        notification_priority_score=PRIORITY_SCORE.get(priority, 2),
        content_length=body_length,
        channel_health=1.0 if circuit_state == "closed" else 0.0,
    )
