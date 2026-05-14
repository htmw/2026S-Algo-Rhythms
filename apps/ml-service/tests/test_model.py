"""EngagementModel — train on synthetic data, assert it learned something."""
from __future__ import annotations

import sys
from pathlib import Path

# Make sibling modules importable when running pytest from the service root.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from features import FEATURE_COLUMNS  # noqa: E402
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


def test_feature_columns_has_19_entries() -> None:
    assert len(FEATURE_COLUMNS) == 19
    for name in ["urgency_score", "category_encoded", "time_sensitivity_score", "sentiment_score"]:
        assert name in FEATURE_COLUMNS, f"{name} missing from FEATURE_COLUMNS"


def test_training_succeeds_on_19_feature_data() -> None:
    df = generate_synthetic_dataframe(n_samples=2000, seed=99)
    model = EngagementModel()
    model.version = "test-19"
    metrics = model.train(df)

    assert metrics["auc_roc"] > 0.5, f"AUC too low: {metrics['auc_roc']}"
    assert "urgency_score" in model.feature_importance


def test_predict_engagement_returns_probability() -> None:
    df = generate_synthetic_dataframe(n_samples=1000, seed=11)
    model = EngagementModel()
    model.train(df)

    features_19 = {
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
        "urgency_score": 0.7,
        "category_encoded": 2,
        "time_sensitivity_score": 0.5,
        "sentiment_score": 0.6,
    }
    p = model.predict_engagement(features_19)
    assert 0.0 <= p <= 1.0


def test_predict_accepts_15_feature_input_backward_compat() -> None:
    """Old 15-feature requests should still work — missing features default to 0."""
    df = generate_synthetic_dataframe(n_samples=1000, seed=15)
    model = EngagementModel()
    model.train(df)

    features_15 = {
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
    p = model.predict_engagement(features_15)
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
