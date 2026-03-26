import json
import os
import random
import uuid
from datetime import datetime, timedelta

import psycopg2
from faker import Faker

fake = Faker()

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://notify:notify@localhost:5432/notifyengine",
)

TOTAL_EXAMPLES = 10000
PROFILES = ["email_fan", "push_fan", "mixed"]
CHANNELS = ["email", "websocket", "sms_webhook"]


def choose_profile() -> str:
    return random.choice(PROFILES)


def choose_channel(profile: str) -> str:
    if profile == "email_fan":
        return random.choices(["email", "websocket", "sms_webhook"], weights=[0.7, 0.2, 0.1])[0]
    if profile == "push_fan":
        return random.choices(["email", "websocket", "sms_webhook"], weights=[0.1, 0.6, 0.3])[0]
    return random.choice(CHANNELS)


def choose_engagement(profile: str, channel: str) -> bool:
    if profile == "email_fan" and channel == "email":
        return random.random() < 0.85
    if profile == "push_fan" and channel in ("websocket", "sms_webhook"):
        return random.random() < 0.8
    if profile == "mixed":
        return random.random() < 0.55
    return random.random() < 0.3


def build_feature_vector(profile: str, channel: str) -> dict:
    return {
        "profile": profile,
        "channel_type": channel,
        "hour_of_day": random.randint(0, 23),
        "day_of_week": random.randint(0, 6),
        "is_weekend": random.choice([0, 1]),
        "historical_success_rate": round(random.uniform(0.2, 0.95), 3),
        "historical_engagement_rate": round(random.uniform(0.1, 0.9), 3),
        "hours_since_last_engagement": round(random.uniform(1, 240), 2),
        "hours_since_last_success": round(random.uniform(1, 168), 2),
        "avg_latency_ms": random.randint(50, 2500),
        "attempts_30d": random.randint(1, 50),
        "notifications_sent_24h": random.randint(0, 10),
        "notifications_sent_7d": random.randint(0, 40),
        "notification_priority_score": random.choice([1, 2, 3, 4]),
        "content_length": random.randint(20, 500),
        "channel_health": round(random.uniform(0.7, 1.0), 2),
    }


def fetch_reference_ids(cur):
    cur.execute("SELECT id FROM tenants ORDER BY created_at LIMIT 1")
    tenant_row = cur.fetchone()
    if not tenant_row:
        raise RuntimeError("No tenant found. Run the seed script first.")

    tenant_id = tenant_row[0]

    cur.execute(
        """
        SELECT id, type
        FROM channels
        WHERE tenant_id = %s
        """,
        (tenant_id,),
    )
    channel_rows = cur.fetchall()
    if not channel_rows:
        raise RuntimeError("No channels found for tenant. Seed data may be missing.")

    channel_map = {channel_type: channel_id for channel_id, channel_type in channel_rows}
    return tenant_id, channel_map


def create_notification(cur, tenant_id: str, recipient: str, channel: str) -> str:
    notification_id = str(uuid.uuid4())
    routing_mode = "adaptive"
    priority = random.choice(["critical", "high", "standard", "bulk"])

    cur.execute(
        """
        INSERT INTO notifications (
            id, tenant_id, recipient, subject, body, priority, routing_mode, status,
            delivered_via, delivered_at, metadata, created_at, updated_at
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, NOW(), %s::jsonb, NOW(), NOW())
        """,
        (
            notification_id,
            tenant_id,
            recipient,
            fake.sentence(nb_words=4),
            fake.text(max_nb_chars=120),
            priority,
            routing_mode,
            "delivered",
            channel,
            json.dumps({"source": "synthetic_generator"}),
        ),
    )
    return notification_id


def insert_delivery_attempt(cur, tenant_id: str, notification_id: str, channel_id: str, channel: str, engaged: bool, feature_vector: dict):
    started_at = datetime.now() - timedelta(days=random.randint(0, 30), minutes=random.randint(0, 1440))
    duration_ms = random.randint(50, 2500)
    completed_at = started_at + timedelta(milliseconds=duration_ms)

    if engaged:
        status = "success"
        status_code = 200
        error_message = None
        engagement_type = random.choice(["email_open", "ws_ack", "webhook_2xx"])
        engaged_at = completed_at + timedelta(minutes=random.randint(1, 180))
    else:
        status = random.choice(["success", "failure", "timeout"])
        status_code = 200 if status == "success" else random.choice([408, 500, 502])
        error_message = None if status == "success" else random.choice(["timeout", "provider error", "temporary failure"])
        engagement_type = None
        engaged_at = None

    cur.execute(
        """
        INSERT INTO delivery_attempts (
            tenant_id, notification_id, channel_id, channel_type,
            attempt_number, status, status_code, error_message,
            engaged, engaged_at, engagement_type,
            started_at, completed_at, duration_ms, feature_vector
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)
        """,
        (
            tenant_id,
            notification_id,
            channel_id,
            channel,
            1,
            status,
            status_code,
            error_message,
            engaged,
            engaged_at,
            engagement_type,
            started_at,
            completed_at,
            duration_ms,
            json.dumps(feature_vector),
        ),
    )
    return duration_ms, engaged_at, status


def upsert_recipient_stats(cur, tenant_id: str, recipient: str, channel: str, engaged: bool, duration_ms: int, status: str, engaged_at):
    successes = 1 if status == "success" else 0
    engagements = 1 if engaged else 0
    last_success_at = datetime.now() if successes else None
    last_failure_at = datetime.now() if status in ("failure", "timeout") else None

    cur.execute(
        """
        INSERT INTO recipient_channel_stats (
            tenant_id, recipient, channel_type, attempts_30d, successes_30d, engagements_30d,
            avg_latency_ms, last_success_at, last_engaged_at, last_failure_at,
            notifications_received_24h, notifications_received_7d, updated_at
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
        ON CONFLICT (tenant_id, recipient, channel_type)
        DO UPDATE SET
            attempts_30d = recipient_channel_stats.attempts_30d + 1,
            successes_30d = recipient_channel_stats.successes_30d + EXCLUDED.successes_30d,
            engagements_30d = recipient_channel_stats.engagements_30d + EXCLUDED.engagements_30d,
            avg_latency_ms = EXCLUDED.avg_latency_ms,
            last_success_at = COALESCE(EXCLUDED.last_success_at, recipient_channel_stats.last_success_at),
            last_engaged_at = COALESCE(EXCLUDED.last_engaged_at, recipient_channel_stats.last_engaged_at),
            last_failure_at = COALESCE(EXCLUDED.last_failure_at, recipient_channel_stats.last_failure_at),
            notifications_received_24h = recipient_channel_stats.notifications_received_24h + 1,
            notifications_received_7d = recipient_channel_stats.notifications_received_7d + 1,
            updated_at = NOW()
        """,
        (
            tenant_id,
            recipient,
            channel,
            1,
            successes,
            engagements,
            float(duration_ms),
            last_success_at,
            engaged_at,
            last_failure_at,
            random.randint(0, 5),
            random.randint(1, 20),
        ),
    )


def main():
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()

    try:
        tenant_id, channel_map = fetch_reference_ids(cur)

        # Set tenant context for RLS
        cur.execute("SELECT set_config('app.current_tenant_id', %s, false)", (str(tenant_id),))

        inserted = 0
        for _ in range(TOTAL_EXAMPLES):
            profile = choose_profile()
            channel = choose_channel(profile)

            if channel not in channel_map:
                continue

            recipient = fake.email()
            engaged = choose_engagement(profile, channel)
            feature_vector = build_feature_vector(profile, channel)

            notification_id = create_notification(cur, tenant_id, recipient, channel)
            duration_ms, engaged_at, status = insert_delivery_attempt(
                cur,
                tenant_id,
                notification_id,
                channel_map[channel],
                channel,
                engaged,
                feature_vector,
            )
            upsert_recipient_stats(cur, tenant_id, recipient, channel, engaged, duration_ms, status, engaged_at)
            inserted += 1

        conn.commit()
        print(f"Inserted {inserted} synthetic delivery examples.")
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    main()