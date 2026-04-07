"""Adaptive epsilon-greedy router (tech-spec 5.5)."""
from __future__ import annotations

import random
from typing import Any

from model import EngagementModel


class AdaptiveRouter:
    def __init__(
        self,
        model: EngagementModel | None,
        exploration_rate: float = 0.1,
        rng: random.Random | None = None,
    ) -> None:
        self.model = model
        self.exploration_rate = exploration_rate
        self.rng = rng or random.Random()

    def _predict_all(
        self, available_channels: list[str], features_per_channel: dict[str, dict[str, Any]]
    ) -> dict[str, float]:
        predictions: dict[str, float] = {}
        for channel in available_channels:
            features = features_per_channel.get(channel, {})
            if self.model is None:
                predictions[channel] = 0.5
            else:
                predictions[channel] = self.model.predict_engagement(features)
        return predictions

    def select_channel(
        self,
        recipient: str,
        available_channels: list[str],
        features_per_channel: dict[str, dict[str, Any]],
    ) -> dict[str, Any]:
        if not available_channels:
            raise ValueError("available_channels must not be empty")

        predictions = self._predict_all(available_channels, features_per_channel)
        is_exploring = self.rng.random() < self.exploration_rate
        model_version = self.model.version if self.model is not None else None

        if self.model is None:
            selected = self.rng.choice(available_channels)
            return {
                "mode": "adaptive",
                "selected": selected,
                "predictions": {ch: round(p, 4) for ch, p in predictions.items()},
                "exploration": True,
                "reason": (
                    "No trained model loaded — cold start. Returning a random "
                    f"channel ({selected}) so the system can collect labeled data."
                ),
                "model_version": model_version,
                "static_would_have_chosen": available_channels[0],
            }

        best = max(predictions, key=lambda c: predictions[c])

        if is_exploring:
            selected = self.rng.choice(available_channels)
            reason = (
                f"Exploration mode ({self.exploration_rate * 100:.0f}% chance): "
                f"randomly selected {selected} to gather new data. "
                f"Model would have chosen {best} ({predictions[best]:.0%})."
            )
        else:
            selected = best
            ranked = sorted(predictions.items(), key=lambda kv: kv[1], reverse=True)
            reason = (
                f"XGBoost predicted highest engagement for {selected} "
                f"({predictions[selected]:.0%})"
            )
            if len(ranked) > 1:
                runner_up, runner_p = ranked[1]
                reason += f", runner-up: {runner_up} ({runner_p:.0%})"

        # Static fallback comparison: use historical_success_rate as the proxy
        # for what a static priority order would have picked.
        static_would_have_chosen = max(
            available_channels,
            key=lambda c: features_per_channel.get(c, {}).get("historical_success_rate", 0.0),
        )

        return {
            "mode": "adaptive",
            "selected": selected,
            "predictions": {ch: round(p, 4) for ch, p in predictions.items()},
            "exploration": is_exploring,
            "reason": reason,
            "model_version": model_version,
            "static_would_have_chosen": static_would_have_chosen,
        }
