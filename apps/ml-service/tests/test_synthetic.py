from synthetic import ARCHETYPES, SyntheticDataGenerator


def test_generates_expected_columns() -> None:
    df = SyntheticDataGenerator(seed=1).generate(n_samples=200)
    expected = {
        "archetype",
        "channel_type",
        "hour_of_day",
        "day_of_week",
        "is_weekend",
        "historical_success_rate",
        "historical_engagement_rate",
        "hours_since_last_engagement",
        "hours_since_last_success",
        "avg_latency_ms",
        "attempts_30d",
        "notifications_sent_24h",
        "notifications_sent_7d",
        "notification_priority_score",
        "content_length",
        "channel_health",
        "engaged",
    }
    assert expected.issubset(df.columns)
    assert len(df) == 200


def test_engagement_label_is_binary() -> None:
    df = SyntheticDataGenerator(seed=2).generate(n_samples=500)
    assert set(df["engaged"].unique()).issubset({0, 1})


def test_all_archetypes_appear_with_enough_samples() -> None:
    df = SyntheticDataGenerator(seed=3).generate(n_samples=2000)
    for archetype in ARCHETYPES:
        assert (df["archetype"] == archetype).sum() > 0


def test_email_lover_engages_with_email_more_than_sms() -> None:
    df = SyntheticDataGenerator(seed=4).generate(n_samples=4000)
    el = df[df["archetype"] == "email_lover"]
    email_rate = el[el["channel_type"] == "email"]["engaged"].mean()
    sms_rate = el[el["channel_type"] == "sms_webhook"]["engaged"].mean()
    assert email_rate > sms_rate
