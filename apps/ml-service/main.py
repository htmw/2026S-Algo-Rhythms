"""NotifyEngine ML Service — FastAPI prediction endpoint.

Implements spec section 5.8. Loads an XGBoost EngagementModel on startup
(or bootstraps from synthetic data if no artifact exists), exposes /predict
for the worker to call, plus /health and /model/info.
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from config import load_settings
from features import normalize_features
from model import EngagementModel
from router import AdaptiveRouter
from trainer import ModelTrainer

logger = logging.getLogger("ml-service")
logging.basicConfig(level=logging.INFO)

settings = load_settings()
trainer = ModelTrainer(settings)

# Module-level model handle, populated during lifespan startup.
model: EngagementModel | None = None


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    global model
    try:
        if settings.model_path.exists():
            logger.info("Loading model from %s", settings.model_path)
            try:
                model = EngagementModel.load(settings.model_path)
            except Exception as err:
                logger.warning(
                    "Failed to load model at %s (%s) — bootstrapping from synthetic data",
                    settings.model_path,
                    err,
                )
                model = trainer.bootstrap_from_synthetic()
        else:
            logger.info("No model file at %s — bootstrapping from synthetic data", settings.model_path)
            model = trainer.bootstrap_from_synthetic()

        logger.info(
            "Model ready: version=%s metrics=%s",
            model.version,
            model.metrics,
        )
    except Exception:
        logger.exception("Model startup failed — service will return model_loaded=false")
        model = None

    yield


app = FastAPI(title="NotifyEngine ML Service", lifespan=lifespan)


# ───────────────────────── schemas ─────────────────────────


class PredictionRequest(BaseModel):
    recipient: str
    available_channels: list[str] = Field(..., min_length=1)
    features_per_channel: dict[str, dict[str, Any]]
    exploration_rate: float = Field(default=0.10, ge=0.0, le=1.0)


class PredictionResponse(BaseModel):
    selected: str
    predictions: dict[str, float]
    exploration: bool
    reason: str
    model_version: str


class HealthResponse(BaseModel):
    status: str
    model_loaded: bool


class ModelInfoResponse(BaseModel):
    loaded: bool
    version: str | None = None
    metrics: dict[str, float] | None = None
    feature_importance: dict[str, float] | None = None


# ───────────────────────── routes ─────────────────────────


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(status="ok", model_loaded=model is not None)


@app.get("/model/info", response_model=ModelInfoResponse)
async def model_info() -> ModelInfoResponse:
    if model is None:
        return ModelInfoResponse(loaded=False)
    return ModelInfoResponse(
        loaded=True,
        version=model.version,
        metrics=model.metrics,
        feature_importance=model.feature_importance,
    )


@app.post("/predict", response_model=PredictionResponse)
async def predict(request: PredictionRequest) -> PredictionResponse:
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    # Normalize each channel's feature dict so missing fields fall back to defaults
    # rather than crashing inference.
    normalized: dict[str, dict[str, Any]] = {}
    for channel in request.available_channels:
        raw = request.features_per_channel.get(channel, {})
        normalized[channel] = normalize_features(raw, channel)

    router = AdaptiveRouter(model, exploration_rate=request.exploration_rate)
    decision = router.select_channel(
        recipient=request.recipient,
        available_channels=request.available_channels,
        features_per_channel=normalized,
    )
    return PredictionResponse(**decision)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
