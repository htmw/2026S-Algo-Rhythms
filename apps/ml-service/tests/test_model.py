"""EngagementModel — train on synthetic data, assert it learned something."""
from __future__ import annotations

import sys
from pathlib import Path

# Make sibling modules importable when running pytest from the service root.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from model import EngagementModel  # noqa: E402
from trainer import generate_synthetic_dataframe  # noqa: E402


def test_model_trains_and_beats_random() -> None:
    df = generate_synthetic_dataframe(n_samples=2000, seed=7)
    model = EngagementModel()
    model.version = "test"
    metrics = model.train(df)

    # Hidden archetypes are easy to learn — AUC should be well above random.
    assert metrics["auc_roc"] > 0.7, f"AUC too low: {metrics['auc_roc']}"
    assert metrics["accuracy"] > 0.6
    assert metrics["training_samples"] == int(0.8 * 2000)
    assert model.feature_importance, "feature importance should not be empty"


def test_predict_engagement_returns_probability() -> None:
    df = generate_synthetic_dataframe(n_samples=1000, seed=11)
    model = EngagementModel()
    model.train(df)

    features = {
        "channel_type": "email",
        "hour_of_day": 14,
        "day_of_week": 2,
        "is_weekend": 0,
        "historical_success_rate": 0.9,
        "historical_engagement_rate": 0.8,
        "hours_since_last_engagement": 12,
        "hours_since_last_success": 6,
        "avg_latency_ms": 200,
        "attempts_30d": 30,
        "notifications_sent_24h": 2,
        "notifications_sent_7d": 10,
        "notification_priority_score": 3,
        "content_length": 200,
        "channel_health": 1.0,
    }
    p = model.predict_engagement(features)
    assert 0.0 <= p <= 1.0


def test_predict_handles_unknown_channel() -> None:
    df = generate_synthetic_dataframe(n_samples=500, seed=3)
    model = EngagementModel()
    model.train(df)

    features = {"channel_type": "carrier_pigeon"}
    # Should not raise — unknown channels fall back to encoding 0.
    p = model.predict_engagement(features)
    assert 0.0 <= p <= 1.0


def test_save_and_load_round_trip(tmp_path) -> None:
    df = generate_synthetic_dataframe(n_samples=500, seed=5)
    model = EngagementModel()
    model.version = "round-trip"
    model.train(df)

    target = tmp_path / "active" / "latest.joblib"
    model.save(target)
    assert target.exists()

    loaded = EngagementModel.load(target)
    assert loaded.version == "round-trip"
    assert loaded.metrics["auc_roc"] == model.metrics["auc_roc"]
    assert loaded.feature_importance == model.feature_importance
