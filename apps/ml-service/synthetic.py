"""Synthetic delivery-attempt generator for bootstrap training and tests.

Generates labeled examples with hidden user archetypes — the model learns to
discover the per-user channel preferences from feature signals alone.

Per tech-spec 5.9. Returns a pandas DataFrame matching the columns the trainer
expects (one row per delivery attempt with `engaged` as the binary label).
"""
from __future__ import annotations

import random
from dataclasses import dataclass
from typing import Sequence

import numpy as np
import pandas as pd

CHANNELS: list[str] = ["email", "websocket", "sms_webhook"]
PRIORITIES: list[str] = ["critical", "high", "standard", "bulk"]
PRIORITY_SCORE: dict[str, int] = {"critical": 4, "high": 3, "standard": 2, "bulk": 1}

ARCHETYPES: list[str] = [
    "email_lover",
    "push_responsive",
    "sms_only",
    "time_sensitive",
    "disengaged",
]


@dataclass
class ArchetypeProfile:
    """Per-channel base engagement rate for one archetype."""
    base_rates: dict[str, float]
    time_sensitive: bool = False


ARCHETYPE_PROFILES: dict[str, ArchetypeProfile] = {
    "email_lover": ArchetypeProfile(
        base_rates={"email": 0.85, "websocket": 0.20, "sms_webhook": 0.15}
    ),
    "push_responsive": ArchetypeProfile(
        base_rates={"email": 0.20, "websocket": 0.85, "sms_webhook": 0.40}
    ),
    "sms_only": ArchetypeProfile(
        base_rates={"email": 0.05, "websocket": 0.10, "sms_webhook": 0.80}
    ),
    "time_sensitive": ArchetypeProfile(
        base_rates={"email": 0.40, "websocket": 0.70, "sms_webhook": 0.60},
        time_sensitive=True,
    ),
    "disengaged": ArchetypeProfile(
        base_rates={"email": 0.05, "websocket": 0.05, "sms_webhook": 0.05}
    ),
}


class SyntheticDataGenerator:
    """Builds a labeled DataFrame for model training."""

    FEATURE_COLUMNS: list[str] = [
        "channel_type",
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

    def __init__(self, seed: int = 42) -> None:
        self.rng = random.Random(seed)
        self.np_rng = np.random.default_rng(seed)

    def _engagement_probability(
        self,
        archetype: str,
        channel: str,
        hour_of_day: int,
        notifications_sent_24h: int,
    ) -> float:
        profile = ARCHETYPE_PROFILES[archetype]
        base = profile.base_rates[channel]
        if profile.time_sensitive:
            if 9 <= hour_of_day <= 18:
                base = min(1.0, base * 1.25)
            elif hour_of_day < 6 or hour_of_day > 22:
                base *= 0.4
        fatigue_penalty = max(0.0, 1.0 - (notifications_sent_24h * 0.07))
        return float(np.clip(base * fatigue_penalty, 0.0, 1.0))

    def _make_row(self, archetype: str) -> dict[str, object]:
        channel = self.rng.choice(CHANNELS)
        hour_of_day = self.rng.randint(0, 23)
        day_of_week = self.rng.randint(0, 6)
        notifications_sent_24h = self.rng.randint(0, 8)
        priority = self.rng.choice(PRIORITIES)

        engagement_p = self._engagement_probability(
            archetype, channel, hour_of_day, notifications_sent_24h
        )
        engaged = int(self.rng.random() < engagement_p)

        affinity = ARCHETYPE_PROFILES[archetype].base_rates[channel]
        historical_success_rate = float(
            np.clip(self.np_rng.normal(0.5 + affinity * 0.3, 0.1), 0.0, 1.0)
        )
        historical_engagement_rate = float(
            np.clip(self.np_rng.normal(affinity, 0.1), 0.0, 1.0)
        )

        return {
            "archetype": archetype,
            "channel_type": channel,
            "hour_of_day": hour_of_day,
            "day_of_week": day_of_week,
            "is_weekend": 1 if day_of_week >= 5 else 0,
            "historical_success_rate": historical_success_rate,
            "historical_engagement_rate": historical_engagement_rate,
            "hours_since_last_engagement": float(self.np_rng.exponential(48.0)),
            "hours_since_last_success": float(self.np_rng.exponential(24.0)),
            "avg_latency_ms": float(self.np_rng.uniform(50, 2500)),
            "attempts_30d": int(self.np_rng.integers(0, 60)),
            "notifications_sent_24h": notifications_sent_24h,
            "notifications_sent_7d": int(self.np_rng.integers(0, 40)),
            "notification_priority_score": PRIORITY_SCORE[priority],
            "content_length": int(self.np_rng.integers(20, 500)),
            "channel_health": float(self.rng.choices([1.0, 0.0], weights=[0.95, 0.05])[0]),
            "engaged": engaged,
        }

    def generate(
        self,
        n_samples: int = 10_000,
        archetypes: Sequence[str] | None = None,
    ) -> pd.DataFrame:
        archetypes = list(archetypes) if archetypes else ARCHETYPES
        rows: list[dict[str, object]] = []
        for _ in range(n_samples):
            archetype = self.rng.choice(archetypes)
            rows.append(self._make_row(archetype))
        return pd.DataFrame(rows)
