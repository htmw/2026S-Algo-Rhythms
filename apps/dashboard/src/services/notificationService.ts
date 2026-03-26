export interface NotificationSummary {
  total: number;
  delivered: number;
  failed: number;
  queued: number;
  processing: number;
}

export interface NotificationRecord {
  id: string;
  recipient: string;
  message: string;
  channel: "email" | "push" | "sms" | "websocket" | "sms_webhook";
  status: "delivered" | "failed" | "queued" | "processing" | "pending" | "dlq";
  createdAt: string;
  deliveredAt: string | null;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";
const API_KEY = import.meta.env.VITE_API_KEY;

function getHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${API_KEY}`,
  };
}

export async function fetchNotificationSummary(): Promise<NotificationSummary> {
  const res = await fetch(`${API_BASE_URL}/v1/notifications/summary`, {
    headers: getHeaders(),
  });

  if (!res.ok) {
    throw new Error("Failed to fetch summary");
  }

  return res.json();
}

export async function fetchRecentNotifications(): Promise<NotificationRecord[]> {
  const res = await fetch(`${API_BASE_URL}/v1/notifications?limit=20`, {
    headers: getHeaders(),
  });

  if (!res.ok) {
    throw new Error("Failed to fetch notifications");
  }

  const data = await res.json();

  // 🔥 FIX: map backend → frontend format
  return data.map((item: Record<string, unknown>) => ({
    id: item.id,
    recipient: item.recipient,
    message: item.message || item.body,   // fallback fix
    channel: item.channel || item.delivered_via || "email",
    status: item.status,
    createdAt: item.createdAt || item.created_at,
    deliveredAt: item.deliveredAt || item.delivered_at,
  }));
}