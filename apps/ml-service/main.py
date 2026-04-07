"""FastAPI entry point for the NotifyEngine ML service."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import Any, Optional

from fastapi import FastAPI
from pydantic import BaseModel, Field

import config
from model import EngagementModel
from router import AdaptiveRouter
from synthetic import SyntheticDataGenerator
from trainer import ModelTrainer

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ml-service")


class PredictionRequest(BaseModel):
    recipient: str
    available_channels: list[str]
    features_per_channel: dict[str, dict[str, Any]]
    exploration_rate: float = 0.1


class PredictionResponse(BaseModel):
    selected: str
    predictions: dict[str, float]
    exploration: bool
    reason: str
    model_version: Optional[str] = None


class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    model_version: Optional[str] = None


class ModelInfoResponse(BaseModel):
    version: Optional[str]
    metrics: dict[str, float | int] = Field(default_factory=dict)
    feature_importance: dict[str, float] = Field(default_factory=dict)
    loaded: bool


_state: dict[str, Any] = {"model": None}


def _bootstrap_if_needed() -> None:
    """Train an initial model on synthetic data when no artifact exists."""
    if config.ACTIVE_MODEL_PATH.exists():
        return
    logger.warning(
        "No model at %s — bootstrapping from synthetic data (%d samples)",
        config.ACTIVE_MODEL_PATH,
        config.BOOTSTRAP_SAMPLES,
    )
    df = SyntheticDataGenerator(seed=42).generate(n_samples=config.BOOTSTRAP_SAMPLES)
    trainer = ModelTrainer(active_model_path=config.ACTIVE_MODEL_PATH)
    result = trainer.train(df, promote=True)
    logger.info(
        "Bootstrap complete: phase=%s, auc=%.3f, accuracy=%.3f",
        result.phase,
        result.metrics.auc_roc,
        result.metrics.accuracy,
    )


def _load_model() -> Optional[EngagementModel]:
    if not config.ACTIVE_MODEL_PATH.exists():
        return None
    try:
        return EngagementModel.load(config.ACTIVE_MODEL_PATH)
    except Exception as err:
        logger.exception("Failed to load model: %s", err)
        return None


@asynccontextmanager
async def lifespan(app: FastAPI):
    config.ACTIVE_MODEL_DIR.mkdir(parents=True, exist_ok=True)
    try:
        _bootstrap_if_needed()
    except Exception as err:
        logger.exception("Bootstrap training failed: %s — continuing in cold-start mode", err)
    _state["model"] = _load_model()
    if _state["model"] is None:
        logger.warning("Starting in cold-start mode — /predict will return random fallbacks")
    else:
        logger.info(
            "Model loaded: version=%s metrics=%s",
            _state["model"].version,
            _state["model"].metrics,
        )
    yield
    _state["model"] = None


app = FastAPI(title="NotifyEngine ML Service", lifespan=lifespan)


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    model: Optional[EngagementModel] = _state.get("model")
    return HealthResponse(
        status="ok",
        model_loaded=model is not None,
        model_version=model.version if model else None,
    )


@app.get("/model/info", response_model=ModelInfoResponse)
async def model_info() -> ModelInfoResponse:
    model: Optional[EngagementModel] = _state.get("model")
    if model is None:
        return ModelInfoResponse(version=None, metrics={}, feature_importance={}, loaded=False)
    return ModelInfoResponse(
        version=model.version,
        metrics=model.metrics,
        feature_importance=model.feature_importance,
        loaded=True,
    )


@app.post("/predict", response_model=PredictionResponse)
async def predict(request: PredictionRequest) -> PredictionResponse:
    model: Optional[EngagementModel] = _state.get("model")
    router = AdaptiveRouter(model=model, exploration_rate=request.exploration_rate)
    decision = router.select_channel(
        recipient=request.recipient,
        available_channels=request.available_channels,
        features_per_channel=request.features_per_channel,
    )
    return PredictionResponse(
        selected=decision["selected"],
        predictions=decision["predictions"],
        exploration=decision["exploration"],
        reason=decision["reason"],
        model_version=decision.get("model_version"),
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
