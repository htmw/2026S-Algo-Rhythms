"""AdaptiveRouter — verify epsilon-greedy ratio and exploit-mode picks the best."""
from __future__ import annotations

import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from model import EngagementModel  # noqa: E402
from router import AdaptiveRouter  # noqa: E402
from trainer import generate_synthetic_dataframe  # noqa: E402


def _trained_model() -> EngagementModel:
    df = generate_synthetic_dataframe(n_samples=1000, seed=13)
    model = EngagementModel()
    model.version = "router-test"
    model.train(df)
    return model


def test_exploration_rate_is_approximately_observed() -> None:
    """Over 2000 trials with exploration_rate=0.10, observed rate should be ~10%."""
    random.seed(0)
    model = _trained_model()
    router = AdaptiveRouter(model, exploration_rate=0.10)

    features = {
        "channel_type": "email",
        "hour_of_day": 12,
        "day_of_week": 2,
        "is_weekend": 0,
        "historical_success_rate": 0.8,
        "historical_engagement_rate": 0.7,
        "hours_since_last_engagement": 24,
        "hours_since_last_success": 12,
        "avg_latency_ms": 250,
        "attempts_30d": 20,
        "notifications_sent_24h": 1,
        "notifications_sent_7d": 5,
        "notification_priority_score": 2,
        "content_length": 100,
        "channel_health": 1.0,
    }

    explored = 0
    trials = 2000
    for _ in range(trials):
        decision = router.select_channel(
            recipient="user@test.com",
            available_channels=["email", "websocket", "sms_webhook"],
            features_per_channel={
                "email": features,
                "websocket": {**features, "channel_type": "websocket"},
                "sms_webhook": {**features, "channel_type": "sms_webhook"},
            },
        )
        if decision["exploration"]:
            explored += 1

    observed = explored / trials
    # Allow generous slack for randomness — 10% ± 3%.
    assert 0.07 <= observed <= 0.13, f"observed exploration rate {observed:.3f}"


def test_exploit_picks_highest_predicted() -> None:
    random.seed(1)
    model = _trained_model()
    router = AdaptiveRouter(model, exploration_rate=0.0)  # never explore

    features_per_channel = {
        "email": {"channel_type": "email"},
        "websocket": {"channel_type": "websocket"},
        "sms_webhook": {"channel_type": "sms_webhook"},
    }
    decision = router.select_channel(
        recipient="user@test.com",
        available_channels=list(features_per_channel.keys()),
        features_per_channel=features_per_channel,
    )

    assert decision["exploration"] is False
    best = max(decision["predictions"], key=decision["predictions"].get)
    assert decision["selected"] == best
    assert decision["model_version"] == "router-test"


def test_router_rejects_empty_channels() -> None:
    model = _trained_model()
    router = AdaptiveRouter(model, exploration_rate=0.10)
    try:
        router.select_channel("u@x.com", [], {})
    except ValueError:
        return
    raise AssertionError("expected ValueError on empty channel list")
