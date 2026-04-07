from pathlib import Path

import pytest

from model import EngagementModel
from synthetic import SyntheticDataGenerator


@pytest.fixture(scope="module")
def trained_model() -> EngagementModel:
    df = SyntheticDataGenerator(seed=7).generate(n_samples=3000)
    model = EngagementModel(version="test-v1")
    model.train(df)
    return model


def test_train_returns_reasonable_metrics(trained_model: EngagementModel) -> None:
    metrics = trained_model.metrics
    assert metrics["accuracy"] > 0.6
    assert metrics["auc_roc"] > 0.6
    assert metrics["training_samples"] == 2400
    assert metrics["test_samples"] == 600
    assert 0.0 <= metrics["precision"] <= 1.0
    assert 0.0 <= metrics["recall"] <= 1.0


def test_predict_engagement_returns_valid_probability(trained_model: EngagementModel) -> None:
    p = trained_model.predict_engagement(
        {
            "channel_type": "email",
            "hour_of_day": 14,
            "day_of_week": 2,
            "is_weekend": 0,
            "historical_success_rate": 0.8,
            "historical_engagement_rate": 0.7,
            "hours_since_last_engagement": 5.0,
            "hours_since_last_success": 5.0,
            "avg_latency_ms": 320,
            "attempts_30d": 30,
            "notifications_sent_24h": 2,
            "notifications_sent_7d": 9,
            "notification_priority_score": 3,
            "content_length": 200,
            "channel_health": 1.0,
        }
    )
    assert isinstance(p, float)
    assert 0.0 <= p <= 1.0


def test_save_load_roundtrip(tmp_path: Path, trained_model: EngagementModel) -> None:
    path = tmp_path / "model.joblib"
    trained_model.save(path)
    assert path.exists()

    loaded = EngagementModel.load(path)
    assert loaded.version == trained_model.version
    assert loaded.metrics == trained_model.metrics

    features = {
        "channel_type": "websocket",
        "hour_of_day": 10,
        "day_of_week": 1,
        "is_weekend": 0,
        "historical_success_rate": 0.5,
        "historical_engagement_rate": 0.6,
        "hours_since_last_engagement": 12.0,
        "hours_since_last_success": 12.0,
        "avg_latency_ms": 200,
        "attempts_30d": 15,
        "notifications_sent_24h": 1,
        "notifications_sent_7d": 4,
        "notification_priority_score": 2,
        "content_length": 100,
        "channel_health": 1.0,
    }
    assert abs(loaded.predict_engagement(features) - trained_model.predict_engagement(features)) < 1e-9


def test_train_rejects_tiny_dataset() -> None:
    df = SyntheticDataGenerator(seed=1).generate(n_samples=10)
    model = EngagementModel()
    with pytest.raises(ValueError):
        model.train(df)
