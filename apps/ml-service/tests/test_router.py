import random

import pytest

from model import EngagementModel
from router import AdaptiveRouter
from synthetic import SyntheticDataGenerator


@pytest.fixture(scope="module")
def trained_model() -> EngagementModel:
    df = SyntheticDataGenerator(seed=11).generate(n_samples=2000)
    model = EngagementModel(version="router-test-v1")
    model.train(df)
    return model


def _features(channel: str, success_rate: float = 0.5) -> dict:
    return {
        "channel_type": channel,
        "hour_of_day": 14,
        "day_of_week": 2,
        "is_weekend": 0,
        "historical_success_rate": success_rate,
        "historical_engagement_rate": success_rate,
        "hours_since_last_engagement": 10.0,
        "hours_since_last_success": 10.0,
        "avg_latency_ms": 300,
        "attempts_30d": 20,
        "notifications_sent_24h": 2,
        "notifications_sent_7d": 10,
        "notification_priority_score": 2,
        "content_length": 150,
        "channel_health": 1.0,
    }


def test_response_shape(trained_model: EngagementModel) -> None:
    router = AdaptiveRouter(model=trained_model, exploration_rate=0.0, rng=random.Random(0))
    decision = router.select_channel(
        recipient="user@example.com",
        available_channels=["email", "websocket", "sms_webhook"],
        features_per_channel={
            "email": _features("email", 0.9),
            "websocket": _features("websocket", 0.4),
            "sms_webhook": _features("sms_webhook", 0.2),
        },
    )
    assert set(decision.keys()) == {
        "mode",
        "selected",
        "predictions",
        "exploration",
        "reason",
        "model_version",
        "static_would_have_chosen",
    }
    assert decision["mode"] == "adaptive"
    assert decision["selected"] in {"email", "websocket", "sms_webhook"}
    assert set(decision["predictions"].keys()) == {"email", "websocket", "sms_webhook"}


def test_exploit_picks_highest_prediction(trained_model: EngagementModel) -> None:
    router = AdaptiveRouter(model=trained_model, exploration_rate=0.0, rng=random.Random(0))
    for _ in range(20):
        decision = router.select_channel(
            recipient="user@example.com",
            available_channels=["email", "websocket"],
            features_per_channel={
                "email": _features("email", 0.95),
                "websocket": _features("websocket", 0.1),
            },
        )
        best = max(decision["predictions"], key=decision["predictions"].get)
        assert decision["selected"] == best
        assert decision["exploration"] is False


def test_exploration_rate_is_close_to_target(trained_model: EngagementModel) -> None:
    router = AdaptiveRouter(model=trained_model, exploration_rate=0.1, rng=random.Random(123))
    explorations = 0
    iterations = 1000
    for _ in range(iterations):
        decision = router.select_channel(
            recipient="user@example.com",
            available_channels=["email", "websocket", "sms_webhook"],
            features_per_channel={
                "email": _features("email", 0.8),
                "websocket": _features("websocket", 0.5),
                "sms_webhook": _features("sms_webhook", 0.3),
            },
        )
        if decision["exploration"]:
            explorations += 1
    rate = explorations / iterations
    assert 0.07 <= rate <= 0.13, f"exploration rate {rate} outside tolerance"


def test_cold_start_returns_random_with_exploration_true() -> None:
    router = AdaptiveRouter(model=None, exploration_rate=0.1, rng=random.Random(0))
    decision = router.select_channel(
        recipient="user@example.com",
        available_channels=["email", "websocket"],
        features_per_channel={
            "email": _features("email"),
            "websocket": _features("websocket"),
        },
    )
    assert decision["exploration"] is True
    assert decision["model_version"] is None
    assert decision["selected"] in {"email", "websocket"}
    assert "cold start" in decision["reason"].lower()
