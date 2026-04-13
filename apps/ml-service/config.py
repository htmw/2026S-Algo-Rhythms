"""ML service configuration — env-driven, no secrets in code."""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    model_path: Path
    bootstrap_samples: int
    default_exploration_rate: float

    # Training phase thresholds (spec 5.6)
    min_training_samples: int = 500
    mature_threshold: int = 2000
    cold_start_exploration: float = 0.50
    initial_exploration: float = 0.20
    mature_exploration: float = 0.10


def load_settings() -> Settings:
    return Settings(
        model_path=Path(os.environ.get("MODEL_PATH", "/app/models/active/latest.joblib")),
        bootstrap_samples=int(os.environ.get("ML_BOOTSTRAP_SAMPLES", "10000")),
        default_exploration_rate=float(os.environ.get("ML_DEFAULT_EXPLORATION_RATE", "0.10")),
    )


# Canonical channel set the encoder is pre-fit on so unknown channels never crash predict.
CANONICAL_CHANNELS: list[str] = ["email", "websocket", "sms_webhook", "webhook"]
