import random
import uuid
from datetime import datetime
import psycopg2

TOTAL_RECORDS = 10000

USER_TYPES = ["email", "push", "mixed"]

def generate_user_type():
    return random.choice(USER_TYPES)

def generate_channel(user_type):
    if user_type == "email":
        return "email"
    elif user_type == "push":
        return "websocket"
    else:
        return random.choice(["email", "websocket"])

def generate_engagement(user_type, channel):
    if user_type == "email" and channel == "email":
        return random.random() < 0.8
    elif user_type == "push" and channel == "websocket":
        return random.random() < 0.75
    else:
        return random.random() < 0.4

def main():
    conn = psycopg2.connect(
        host="localhost",
        port=5432,
        database="notifyengine",
        user="postgres",
        password="postgres"
    )
    cursor = conn.cursor()

    for _ in range(TOTAL_RECORDS):
        notification_id = str(uuid.uuid4())
        channel = generate_channel(generate_user_type())
        engaged = generate_engagement(generate_user_type(), channel)

        # Insert into delivery_attempts
        cursor.execute("""
            INSERT INTO delivery_attempts (
                notification_id,
                channel_type,
                attempt_number,
                status,
                engaged,
                started_at,
                completed_at
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s)
        """, (
            notification_id,
            channel,
            1,
            "success",
            engaged,
            datetime.now(),
            datetime.now()
        ))

        # Insert into recipient_channel_stats
        cursor.execute("""
            INSERT INTO recipient_channel_stats (
                channel_type,
                success_count,
                engagement_count
            )
            VALUES (%s, %s, %s)
        """, (
            channel,
            1,
            1 if engaged else 0
        ))

    conn.commit()
    cursor.close()
    conn.close()

    print("Synthetic data generated successfully!")

if __name__ == "__main__":
    main()