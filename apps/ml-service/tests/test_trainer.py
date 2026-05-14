"""Trainer — model_metadata INSERT tests."""
from __future__ import annotations

import json
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config import Settings  # noqa: E402
from model import EngagementModel  # noqa: E402
from trainer import ModelTrainer, generate_synthetic_dataframe  # noqa: E402


def _make_settings(tmp_path: Path) -> Settings:
    return Settings(
        model_path=tmp_path / "active" / "latest.joblib",
        bootstrap_samples=500,
        default_exploration_rate=0.10,
        min_training_samples=100,
    )


def _mock_conn():
    conn = MagicMock()
    cur = MagicMock()
    cur.fetchone.return_value = ("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",)
    conn.cursor.return_value.__enter__ = MagicMock(return_value=cur)
    conn.cursor.return_value.__exit__ = MagicMock(return_value=False)
    return conn, cur


def _synthetic_records(n: int = 600, seed: int = 42):
    df = generate_synthetic_dataframe(n_samples=n, seed=seed)
    records = []
    for _, row in df.iterrows():
        fv = {k: row[k] for k in df.columns if k not in ("channel_type", "engaged")}
        records.append((row["channel_type"], bool(row["engaged"]), json.dumps(fv), "standard"))
    return records


def test_bootstrap_creates_active_metadata_row(tmp_path: Path) -> None:
    settings = _make_settings(tmp_path)
    trainer = ModelTrainer(settings)

    conn, cur = _mock_conn()

    with patch("psycopg2.connect", return_value=conn):
        model = trainer.bootstrap_from_synthetic(
            n_samples=500,
            database_url="postgresql://test:test@localhost/test",
        )

    assert model.version.startswith("bootstrap-")
    assert (tmp_path / "active" / "latest.joblib").exists()

    sql_calls = [c[0][0] for c in cur.execute.call_args_list if c[0]]
    assert any("UPDATE model_metadata SET is_active = false" in s for s in sql_calls)
    assert any("INSERT INTO model_metadata" in s for s in sql_calls)

    insert_idx = next(
        i for i, c in enumerate(cur.execute.call_args_list)
        if c[0] and "INSERT INTO model_metadata" in c[0][0]
    )
    params = cur.execute.call_args_list[insert_idx][0][1]
    assert params[0] is None  # tenant_id
    assert params[1] == model.version
    assert params[11] is True  # is_active


def test_bootstrap_without_db_url_skips_metadata(tmp_path: Path) -> None:
    settings = _make_settings(tmp_path)
    trainer = ModelTrainer(settings)

    with patch.dict("os.environ", {}, clear=True):
        model = trainer.bootstrap_from_synthetic(n_samples=500)

    assert model.version.startswith("bootstrap-")
    assert (tmp_path / "active" / "latest.joblib").exists()


def test_retrain_promoted_creates_metadata_and_deactivates_old(tmp_path: Path) -> None:
    settings = _make_settings(tmp_path)
    trainer = ModelTrainer(settings)

    conn, cur = _mock_conn()
    cur.fetchall.return_value = _synthetic_records()

    old_model = EngagementModel()
    old_model.version = "old"
    old_model.metrics = {"auc_roc": 0.0}

    with patch("psycopg2.connect", return_value=conn):
        new_model, metadata_id = trainer.retrain_from_db(
            database_url="postgresql://test:test@localhost/test",
            current_model=old_model,
        )

    assert new_model is not None
    assert metadata_id == "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"

    sql_calls = [c[0][0] for c in cur.execute.call_args_list if c[0]]
    assert any("UPDATE model_metadata SET is_active = false" in s for s in sql_calls)
    assert any("INSERT INTO model_metadata" in s for s in sql_calls)


def test_retrain_not_promoted_inserts_no_metadata(tmp_path: Path) -> None:
    settings = _make_settings(tmp_path)
    trainer = ModelTrainer(settings)

    conn, cur = _mock_conn()
    cur.fetchall.return_value = _synthetic_records()

    old_model = EngagementModel()
    old_model.version = "unbeatable"
    old_model.metrics = {"auc_roc": 1.0, "training_samples": 100000}

    with patch("psycopg2.connect", return_value=conn):
        result_model, metadata_id = trainer.retrain_from_db(
            database_url="postgresql://test:test@localhost/test",
            current_model=old_model,
        )

    assert result_model is None
    assert metadata_id is None

    sql_calls = [c[0][0] for c in cur.execute.call_args_list if c[0]]
    assert not any("INSERT INTO model_metadata" in s for s in sql_calls)


def _run_retrain_with_controlled_metrics(
    tmp_path: Path,
    new_auc: float,
    new_samples: int,
    current_auc: float,
    current_samples: int,
):
    """Helper: run retrain with mocked train() metrics to control promotion gate inputs."""
    settings = _make_settings(tmp_path)
    trainer = ModelTrainer(settings)

    conn, cur = _mock_conn()
    cur.fetchall.return_value = _synthetic_records()

    old_model = EngagementModel()
    old_model.version = "current"
    old_model.metrics = {"auc_roc": current_auc, "training_samples": current_samples}

    fake_metrics = {
        "auc_roc": new_auc,
        "training_samples": new_samples,
        "accuracy": 0.80,
        "precision": 0.80,
        "recall": 0.80,
        "f1": 0.80,
    }

    def mock_train(self_model, df):
        self_model.metrics = fake_metrics
        self_model.feature_importance = {"hour_of_day": 0.5}
        return fake_metrics

    with (
        patch("psycopg2.connect", return_value=conn),
        patch.object(EngagementModel, "train", mock_train),
        patch.object(EngagementModel, "save", MagicMock()),
    ):
        return trainer.retrain_from_db(
            database_url="postgresql://test:test@localhost/test",
            current_model=old_model,
        )


def test_equal_auc_more_samples_promotes(tmp_path: Path) -> None:
    new_model, metadata_id = _run_retrain_with_controlled_metrics(
        tmp_path, new_auc=0.85, new_samples=200, current_auc=0.85, current_samples=100,
    )
    assert new_model is not None
    assert metadata_id is not None


def test_equal_auc_same_samples_does_not_promote(tmp_path: Path) -> None:
    new_model, metadata_id = _run_retrain_with_controlled_metrics(
        tmp_path, new_auc=0.85, new_samples=100, current_auc=0.85, current_samples=100,
    )
    assert new_model is None
    assert metadata_id is None


def test_equal_auc_within_epsilon_more_samples_promotes(tmp_path: Path) -> None:
    new_model, metadata_id = _run_retrain_with_controlled_metrics(
        tmp_path, new_auc=0.850000001, new_samples=200, current_auc=0.85, current_samples=100,
    )
    assert new_model is not None
    assert metadata_id is not None


def test_equal_auc_fewer_samples_does_not_promote(tmp_path: Path) -> None:
    new_model, metadata_id = _run_retrain_with_controlled_metrics(
        tmp_path, new_auc=0.85, new_samples=80, current_auc=0.85, current_samples=100,
    )
    assert new_model is None
    assert metadata_id is None


def test_overfit_escape_promotes_with_more_samples(tmp_path: Path) -> None:
    new_model, metadata_id = _run_retrain_with_controlled_metrics(
        tmp_path, new_auc=0.95, new_samples=84, current_auc=1.0, current_samples=64,
    )
    assert new_model is not None
    assert metadata_id is not None


def test_overfit_escape_rejects_below_min_threshold(tmp_path: Path) -> None:
    new_model, metadata_id = _run_retrain_with_controlled_metrics(
        tmp_path, new_auc=0.50, new_samples=84, current_auc=1.0, current_samples=64,
    )
    assert new_model is None
    assert metadata_id is None


def test_overfit_escape_rejects_same_sample_count(tmp_path: Path) -> None:
    new_model, metadata_id = _run_retrain_with_controlled_metrics(
        tmp_path, new_auc=0.95, new_samples=64, current_auc=1.0, current_samples=64,
    )
    assert new_model is None
    assert metadata_id is None


def test_overfit_escape_does_not_fire_for_non_perfect_auc(tmp_path: Path) -> None:
    new_model, metadata_id = _run_retrain_with_controlled_metrics(
        tmp_path, new_auc=0.85, new_samples=250, current_auc=0.90, current_samples=200,
    )
    assert new_model is None
    assert metadata_id is None


def test_retrain_insufficient_data_returns_none(tmp_path: Path) -> None:
    settings = _make_settings(tmp_path)
    trainer = ModelTrainer(settings)

    conn, cur = _mock_conn()
    cur.fetchall.return_value = []

    with patch("psycopg2.connect", return_value=conn):
        result_model, metadata_id = trainer.retrain_from_db(
            database_url="postgresql://test:test@localhost/test",
        )

    assert result_model is None
    assert metadata_id is None
