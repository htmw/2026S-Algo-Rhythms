"""Runtime configuration for the NotifyEngine ML service."""
from __future__ import annotations

import os
from pathlib import Path

BASE_DIR: Path = Path(__file__).resolve().parent
MODEL_DIR: Path = Path(os.environ.get("ML_MODEL_DIR", BASE_DIR / "models"))
ACTIVE_MODEL_DIR: Path = MODEL_DIR / "active"
ACTIVE_MODEL_PATH: Path = ACTIVE_MODEL_DIR / "latest.joblib"

# Training-phase thresholds (tech-spec 5.6)
COLD_START_MAX_SAMPLES: int = 500
INITIAL_MAX_SAMPLES: int = 2000

# Default exploration rate per phase
EXPLORATION_RATE_COLD_START: float = 0.50
EXPLORATION_RATE_INITIAL: float = 0.20
EXPLORATION_RATE_MATURE: float = 0.10

# Bootstrap synthetic dataset size when no model file is present
BOOTSTRAP_SAMPLES: int = 10_000


def phase_for_sample_count(n: int) -> str:
    if n < COLD_START_MAX_SAMPLES:
        return "cold_start"
    if n < INITIAL_MAX_SAMPLES:
        return "initial"
    return "mature"


def exploration_rate_for_phase(phase: str) -> float:
    return {
        "cold_start": EXPLORATION_RATE_COLD_START,
        "initial": EXPLORATION_RATE_INITIAL,
        "mature": EXPLORATION_RATE_MATURE,
    }.get(phase, EXPLORATION_RATE_MATURE)
