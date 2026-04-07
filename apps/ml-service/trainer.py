"""Training pipeline for the engagement model.

Per tech-spec 5.6:
  cold_start  (<500 samples)         -> exploration_rate = 0.50
  initial     (500-2000 samples)     -> 0.20
  mature      (>=2000 samples)       -> 0.10

Promotes a new model only if its AUC strictly beats the current model.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Optional

import pandas as pd

import config
from model import EngagementModel, TrainingMetrics

logger = logging.getLogger(__name__)


@dataclass
class TrainingResult:
    model: EngagementModel
    metrics: TrainingMetrics
    phase: str
    promoted: bool
    previous_auc: Optional[float]


class ModelTrainer:
    def __init__(
        self,
        active_model_path: Path | str = config.ACTIVE_MODEL_PATH,
    ) -> None:
        self.active_model_path = Path(active_model_path)

    def _load_current(self) -> Optional[EngagementModel]:
        if not self.active_model_path.exists():
            return None
        try:
            return EngagementModel.load(self.active_model_path)
        except Exception as err:  # pragma: no cover - defensive
            logger.warning("Failed to load existing model: %s", err)
            return None

    @staticmethod
    def phase_for(n_samples: int) -> str:
        return config.phase_for_sample_count(n_samples)

    def train(
        self,
        df: pd.DataFrame,
        promote: bool = True,
    ) -> TrainingResult:
        n = len(df)
        phase = self.phase_for(n)
        logger.info("Training model with %d samples (phase=%s)", n, phase)

        candidate = EngagementModel(version=self._next_version())
        metrics = candidate.train(df)
        logger.info("Candidate metrics: %s", candidate.metrics)

        current = self._load_current()
        previous_auc: Optional[float] = None
        if current is not None:
            previous_auc = float(current.metrics.get("auc_roc", 0.0) or 0.0)

        promoted = False
        if promote:
            if previous_auc is None or metrics.auc_roc > previous_auc:
                candidate.save(self.active_model_path)
                promoted = True
                logger.info(
                    "Promoted new model %s (auc=%.3f, previous=%s)",
                    candidate.version,
                    metrics.auc_roc,
                    f"{previous_auc:.3f}" if previous_auc is not None else "none",
                )
            else:
                logger.info(
                    "Did not promote: candidate auc=%.3f, current auc=%.3f",
                    metrics.auc_roc,
                    previous_auc,
                )

        return TrainingResult(
            model=candidate,
            metrics=metrics,
            phase=phase,
            promoted=promoted,
            previous_auc=previous_auc,
        )

    def _next_version(self) -> str:
        return f"v{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"
