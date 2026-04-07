"""EngagementModel — XGBoost binary classifier for adaptive routing.

Implements spec section 5.4. Predicts P(engaged | features) for one
(recipient, channel) pair. Persisted as a joblib dict so version + metrics
travel with the artifact.
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import (
    accuracy_score,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
from xgboost import XGBClassifier

from config import CANONICAL_CHANNELS
from features import FEATURE_COLUMNS


class EngagementModel:
    """XGBoost binary classifier wrapping spec 5.4."""

    FEATURE_COLUMNS: list[str] = FEATURE_COLUMNS

    def __init__(self) -> None:
        self.model = XGBClassifier(
            n_estimators=100,
            max_depth=6,
            learning_rate=0.1,
            objective="binary:logistic",
            eval_metric="auc",
            n_jobs=2,
            random_state=42,
        )
        # Pre-fit on canonical set so unknown channels at predict time still encode.
        self.channel_encoder = LabelEncoder()
        self.channel_encoder.fit(CANONICAL_CHANNELS)

        self.version: str | None = None
        self.metrics: dict[str, float] = {}
        self.feature_importance: dict[str, float] = {}

    # ───────────────────────── training ─────────────────────────

    def train(self, df: pd.DataFrame) -> dict[str, float]:
        """Train on a DataFrame of historical delivery attempts.

        Required columns: the 14 feature columns (without channel_type_encoded),
        a `channel_type` string column, and an `engaged` 0/1 label.
        """
        work = df.copy()
        # Re-fit the encoder on observed channels (union with canonical to keep predict stable).
        observed = sorted(set(work["channel_type"].unique()).union(CANONICAL_CHANNELS))
        self.channel_encoder = LabelEncoder()
        self.channel_encoder.fit(observed)
        work["channel_type_encoded"] = self.channel_encoder.transform(work["channel_type"])

        X = work[self.FEATURE_COLUMNS]
        y = work["engaged"].astype(int)

        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, random_state=42, stratify=y
        )

        self.model.fit(X_train, y_train, eval_set=[(X_test, y_test)], verbose=False)

        y_pred = self.model.predict(X_test)
        y_proba = self.model.predict_proba(X_test)[:, 1]

        self.metrics = {
            "accuracy": round(float(accuracy_score(y_test, y_pred)), 4),
            "auc_roc": round(float(roc_auc_score(y_test, y_proba)), 4),
            "precision": round(float(precision_score(y_test, y_pred, zero_division=0)), 4),
            "recall": round(float(recall_score(y_test, y_pred, zero_division=0)), 4),
            "f1": round(float(f1_score(y_test, y_pred, zero_division=0)), 4),
            "training_samples": int(len(X_train)),
            "test_samples": int(len(X_test)),
        }

        importances = self.model.feature_importances_
        self.feature_importance = {
            col: round(float(imp), 4)
            for col, imp in sorted(
                zip(self.FEATURE_COLUMNS, importances),
                key=lambda x: x[1],
                reverse=True,
            )
        }

        return self.metrics

    # ───────────────────────── inference ─────────────────────────

    def predict_engagement(self, features: dict[str, Any]) -> float:
        """Predict P(engaged) for a single feature dict.

        `features` MUST include `channel_type` (string). Unknown channel types
        fall back to the most common known encoding (0) rather than raising,
        so a typo in the worker doesn't crash routing.
        """
        channel = features.get("channel_type", "email")
        try:
            encoded = int(self.channel_encoder.transform([channel])[0])
        except ValueError:
            encoded = 0

        row = {col: features.get(col, 0) for col in self.FEATURE_COLUMNS}
        row["channel_type_encoded"] = encoded
        X = pd.DataFrame([row])[self.FEATURE_COLUMNS]
        proba = self.model.predict_proba(X)[0]
        return float(proba[1]) if len(proba) > 1 else float(proba[0])

    # ───────────────────────── persistence ─────────────────────────

    def save(self, path: str | os.PathLike[str]) -> None:
        target = Path(path)
        target.parent.mkdir(parents=True, exist_ok=True)
        joblib.dump(
            {
                "model": self.model,
                "encoder": self.channel_encoder,
                "version": self.version,
                "metrics": self.metrics,
                "feature_importance": self.feature_importance,
                "feature_columns": self.FEATURE_COLUMNS,
            },
            target,
        )

    @classmethod
    def load(cls, path: str | os.PathLike[str]) -> "EngagementModel":
        payload: Any = joblib.load(path)
        instance = cls()

        if isinstance(payload, dict) and "model" in payload:
            instance.model = payload["model"]
            instance.channel_encoder = payload.get("encoder", instance.channel_encoder)
            instance.version = payload.get("version")
            instance.metrics = payload.get("metrics", {})
            instance.feature_importance = payload.get("feature_importance", {})
            return instance

        if isinstance(payload, XGBClassifier):
            instance.model = payload
            instance.version = "legacy"
            return instance

        raise ValueError(f"Unrecognized model artifact at {path}")
