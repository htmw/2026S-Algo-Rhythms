"""AdaptiveRouter — epsilon-greedy channel selection (spec 5.5)."""
from __future__ import annotations

import random
from typing import Any

from model import EngagementModel


class AdaptiveRouter:
    def __init__(self, model: EngagementModel, exploration_rate: float = 0.10) -> None:
        if not 0.0 <= exploration_rate <= 1.0:
            raise ValueError(f"exploration_rate must be in [0,1], got {exploration_rate}")
        self.model = model
        self.exploration_rate = exploration_rate

    def select_channel(
        self,
        recipient: str,
        available_channels: list[str],
        features_per_channel: dict[str, dict[str, Any]],
    ) -> dict[str, Any]:
        if not available_channels:
            raise ValueError("available_channels cannot be empty")

        # Score every available channel.
        predictions: dict[str, float] = {}
        for channel in available_channels:
            features = features_per_channel.get(channel, {})
            # Ensure channel_type is set so the encoder picks the right encoding.
            features = {**features, "channel_type": features.get("channel_type", channel)}
            predictions[channel] = round(self.model.predict_engagement(features), 4)

        is_exploring = random.random() < self.exploration_rate
        best_channel = max(predictions, key=predictions.get)

        if is_exploring:
            selected = random.choice(available_channels)
            reason = (
                f"Exploration mode ({self.exploration_rate * 100:.0f}% chance): "
                f"randomly selected {selected}. Model would have chosen {best_channel} "
                f"({predictions[best_channel]:.0%})"
            )
        else:
            selected = best_channel
            reason = (
                f"XGBoost predicted highest engagement for {selected} "
                f"({predictions[selected]:.0%})"
            )
            ranked = sorted(predictions, key=predictions.get, reverse=True)
            if len(ranked) > 1:
                runner_up = ranked[1]
                reason += f", runner-up: {runner_up} ({predictions[runner_up]:.0%})"

        return {
            "selected": selected,
            "predictions": predictions,
            "exploration": is_exploring,
            "reason": reason,
            "model_version": self.model.version or "unknown",
        }
