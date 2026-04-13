# apps/ml-service

A FastAPI service that provides ML-powered adaptive channel routing for notification delivery. It wraps an XGBoost binary classifier that predicts per-channel engagement probability, selects channels via epsilon-greedy exploration/exploitation, and supports retraining from production delivery data. On cold start (no saved model), it bootstraps from synthetic data so predictions are available immediately.

## Run locally

The ml-service runs inside Docker (not on host):

```bash
docker compose up -d ml-service
```

It starts on `http://localhost:8000` and auto-reloads on file changes (volume-mounted).

To run tests:

```bash
cd apps/ml-service && pytest
```

## Environment variables

| Variable | Default | Used in |
|---|---|---|
| `MODEL_PATH` | `/app/models/active/latest.joblib` | `config.py` — path to save/load model artifact |
| `ML_BOOTSTRAP_SAMPLES` | `10000` | `config.py` — synthetic samples for cold-start bootstrap |
| `ML_DEFAULT_EXPLORATION_RATE` | `0.10` | `config.py` — fallback epsilon-greedy rate |
| `DATABASE_URL` | (none) | `main.py`, `trainer.py` — PostgreSQL for retraining data; set by docker-compose to `postgresql://notify:notify@postgres:5432/notifyengine` |

Hard-coded training thresholds in `config.py`:

| Parameter | Value | Purpose |
|---|---|---|
| `min_training_samples` | 500 | Minimum rows needed to attempt retraining |
| `mature_threshold` | 2000 | Volume threshold for mature exploration rate |
| `cold_start_exploration` | 0.50 | Exploration rate when < 500 samples |
| `initial_exploration` | 0.20 | Exploration rate when 500-2000 samples |
| `mature_exploration` | 0.10 | Exploration rate when >= 2000 samples |

## Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Returns `{ status: "ok", model_loaded: bool }` |
| GET | `/model/info` | Returns model version, training metrics (accuracy, auc_roc, precision, recall, f1), and feature importance scores |
| POST | `/predict` | Scores all available channels via XGBoost, selects one via epsilon-greedy. Request: `{ recipient, available_channels, features_per_channel, exploration_rate }`. Response: `{ selected, predictions, exploration, reason, model_version }` |
| POST | `/train` | Triggers retraining from recent delivery_attempts in PostgreSQL. Request: `{ tenant_id: string | null }`. Response: `{ promoted, version, metrics, message }` |

## Training pipeline

### Cold-start bootstrap (no saved model)

On startup, if no model artifact exists at `MODEL_PATH`:

1. `trainer.bootstrap_from_synthetic()` generates 10 000 in-memory samples using hidden archetypes (email_loyalist, push_native, work_hours_emailer, going_dark, channel_switcher) with realistic feature distributions.
2. Trains a fresh `EngagementModel` (XGBoost, 80/20 stratified split).
3. Saves artifact to `MODEL_PATH`.
4. Model is ready for `/predict` immediately — no database dependency needed.

### Production retraining (via `/train` or scheduled job)

Triggered by the worker's `ml-retrain` repeatable job every 6 hours, or manually via `POST /train`:

1. Queries `delivery_attempts` from the last 30 days where `status = 'success'` and `engaged IS NOT NULL` and `feature_vector IS NOT NULL`.
2. If fewer than 500 rows, skips retraining (returns `promoted: false`).
3. Parses each row's `feature_vector` JSONB, backfills missing features with defaults from `features.py`.
4. Trains a new `EngagementModel` (80/20 stratified split).
5. Compares new model's AUC-ROC against current model's AUC-ROC.
6. **Promotes only if new AUC > current AUC** — saves to `MODEL_PATH` and updates the in-memory global model reference. Otherwise rejects the new model.

## Model artifact

- **Format**: joblib dict containing `model` (XGBClassifier), `encoder` (LabelEncoder for channel_type), `version`, `metrics`, `feature_importance`, `feature_columns`.
- **Location**: `MODEL_PATH` env var, default `/app/models/active/latest.joblib`. In docker-compose this is a named volume (`mlmodels`).
- **Version scheme**: bootstrap models get `bootstrap-{ISO8601}`, retrained models get `v{unix_timestamp}`.
- **Promotion**: overwrites the single active model file only when AUC improves.

## Feature vector (15 features)

Defined in `features.py`:

| Feature | Description |
|---|---|
| `channel_type_encoded` | LabelEncoder of channel_type (email, websocket, sms_webhook, webhook) |
| `hour_of_day` | 0-23 |
| `day_of_week` | 0-6 (Monday = 0) |
| `is_weekend` | 0 or 1 |
| `historical_success_rate` | successes / attempts over 30d |
| `historical_engagement_rate` | engagements / successes over 30d |
| `hours_since_last_engagement` | recency signal (default 720 = 30 days) |
| `hours_since_last_success` | recency signal (default 720) |
| `avg_latency_ms` | delivery speed (default 1000) |
| `attempts_30d` | volume signal |
| `notifications_sent_24h` | fatigue signal |
| `notifications_sent_7d` | fatigue signal |
| `notification_priority_score` | 1 (bulk) to 4 (critical) |
| `content_length` | body character count |
| `channel_health` | 1.0 if circuit closed, 0.0 if open |

## Dependencies on other services

- **PostgreSQL** — read-only for retraining data (`delivery_attempts` table); connection provided via `DATABASE_URL`
- No direct dependency on Redis or the API server
