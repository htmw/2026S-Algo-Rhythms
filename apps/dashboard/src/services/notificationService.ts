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

  const json = await res.json();

  // API returns { data: [...], pagination: {...} } from cursor pagination endpoint
  const items = Array.isArray(json) ? json : json.data ?? [];

  return items.map((item: Record<string, unknown>) => ({
    id: item.id as string,
    recipient: item.recipient as string,
    message: (item.body ?? item.subject ?? "") as string,
    channel: (item.delivered_via ?? "email") as NotificationRecord["channel"],
    status: item.status as NotificationRecord["status"],
    createdAt: item.created_at as string,
    deliveredAt: (item.delivered_at ?? null) as string | null,
  }));
}