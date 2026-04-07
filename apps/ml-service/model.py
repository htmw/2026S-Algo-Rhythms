"""XGBoost engagement classifier wrapper.

Predicts P(engagement | features) for one (recipient, channel) pair. The
training data label `engaged` is 0/1; predictions are probabilities in [0, 1].

Per tech-spec 5.4.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.metrics import (
    accuracy_score,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder

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


@dataclass
class TrainingMetrics:
    accuracy: float
    auc_roc: float
    precision: float
    recall: float
    f1: float
    training_samples: int
    test_samples: int

    def to_dict(self) -> dict[str, float | int]:
        return {
            "accuracy": self.accuracy,
            "auc_roc": self.auc_roc,
            "precision": self.precision,
            "recall": self.recall,
            "f1": self.f1,
            "training_samples": self.training_samples,
            "test_samples": self.test_samples,
        }


@dataclass
class EngagementModel:
    """XGBoost binary classifier wrapped with channel-type encoding."""

    version: str = "v0"
    metrics: dict[str, float | int] = field(default_factory=dict)
    feature_importance: dict[str, float] = field(default_factory=dict)
    channel_encoder: LabelEncoder = field(default_factory=LabelEncoder)
    booster: xgb.XGBClassifier | None = None

    # ──────────────────────────────────────────────────────────
    def _make_classifier(self) -> xgb.XGBClassifier:
        return xgb.XGBClassifier(
            n_estimators=100,
            max_depth=6,
            learning_rate=0.1,
            objective="binary:logistic",
            eval_metric="auc",
            random_state=42,
        )

    def _to_feature_frame(self, df: pd.DataFrame) -> pd.DataFrame:
        encoded = self.channel_encoder.transform(df["channel_type"].astype(str))
        out = df.copy()
        out["channel_type_encoded"] = encoded
        return out[FEATURE_COLUMNS]

    # ──────────────────────────────────────────────────────────
    def train(self, df: pd.DataFrame) -> TrainingMetrics:
        if "engaged" not in df.columns:
            raise ValueError("Training DataFrame must contain an 'engaged' column")
        if len(df) < 50:
            raise ValueError("Need at least 50 samples to train")

        self.channel_encoder = LabelEncoder()
        self.channel_encoder.fit(df["channel_type"].astype(str))

        X = self._to_feature_frame(df)
        y = df["engaged"].astype(int).to_numpy()

        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, stratify=y, random_state=42
        )

        self.booster = self._make_classifier()
        self.booster.fit(X_train, y_train)

        y_pred = self.booster.predict(X_test)
        y_proba = self.booster.predict_proba(X_test)[:, 1]

        metrics = TrainingMetrics(
            accuracy=float(accuracy_score(y_test, y_pred)),
            auc_roc=float(roc_auc_score(y_test, y_proba)),
            precision=float(precision_score(y_test, y_pred, zero_division=0)),
            recall=float(recall_score(y_test, y_pred, zero_division=0)),
            f1=float(f1_score(y_test, y_pred, zero_division=0)),
            training_samples=int(len(X_train)),
            test_samples=int(len(X_test)),
        )
        self.metrics = metrics.to_dict()
        self.feature_importance = {
            col: float(score)
            for col, score in zip(FEATURE_COLUMNS, self.booster.feature_importances_)
        }
        return metrics

    # ──────────────────────────────────────────────────────────
    def predict_engagement(self, features: dict[str, Any]) -> float:
        if self.booster is None:
            raise RuntimeError("Model has not been trained or loaded")

        channel = str(features.get("channel_type", "email"))
        try:
            encoded = int(self.channel_encoder.transform([channel])[0])
        except ValueError:
            encoded = 0

        row: dict[str, float] = {
            "channel_type_encoded": float(encoded),
            "hour_of_day": float(features.get("hour_of_day", 12)),
            "day_of_week": float(features.get("day_of_week", 0)),
            "is_weekend": float(features.get("is_weekend", 0)),
            "historical_success_rate": float(features.get("historical_success_rate", 0.0)),
            "historical_engagement_rate": float(features.get("historical_engagement_rate", 0.0)),
            "hours_since_last_engagement": float(features.get("hours_since_last_engagement", 720.0)),
            "hours_since_last_success": float(features.get("hours_since_last_success", 720.0)),
            "avg_latency_ms": float(features.get("avg_latency_ms", 1000.0)),
            "attempts_30d": float(features.get("attempts_30d", 0)),
            "notifications_sent_24h": float(features.get("notifications_sent_24h", 0)),
            "notifications_sent_7d": float(features.get("notifications_sent_7d", 0)),
            "notification_priority_score": float(features.get("notification_priority_score", 2)),
            "content_length": float(features.get("content_length", 0)),
            "channel_health": float(features.get("channel_health", 1.0)),
        }
        frame = pd.DataFrame([row], columns=FEATURE_COLUMNS)
        proba = self.booster.predict_proba(frame)[0, 1]
        return float(np.clip(proba, 0.0, 1.0))

    # ──────────────────────────────────────────────────────────
    def save(self, path: Path | str) -> None:
        if self.booster is None:
            raise RuntimeError("Cannot save an untrained model")
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        joblib.dump(
            {
                "version": self.version,
                "metrics": self.metrics,
                "feature_importance": self.feature_importance,
                "channel_encoder": self.channel_encoder,
                "booster": self.booster,
            },
            path,
        )

    @classmethod
    def load(cls, path: Path | str) -> "EngagementModel":
        data = joblib.load(Path(path))
        instance = cls(
            version=data["version"],
            metrics=data["metrics"],
            feature_importance=data["feature_importance"],
        )
        instance.channel_encoder = data["channel_encoder"]
        instance.booster = data["booster"]
        return instance
