export type NotificationStatus =
  | 'pending'
  | 'queued'
  | 'processing'
  | 'delivered'
  | 'failed'
  | 'dlq';

export type NotificationChannel =
  | 'email'
  | 'sms'
  | 'websocket'
  | 'webhook'
  | 'sms_webhook'
  | 'push';

export interface Notification {
  id: string;
  recipient: string;
  body: string;
  channel: NotificationChannel;
  status: NotificationStatus;
  priority: string;
  createdAt: string;
  deliveredAt: string | null;
}

export interface DeliveryAttempt {
  channel_type: string;
  attempt_number: number;
  status: string;
  status_code: number | null;
  error_message: string | null;
  engaged: boolean | null;
  engagement_type: string | null;
  engagement_reason: string | null;
  engaged_at: string | null;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  feature_vector: Record<string, number> | null;
}

export interface NotificationDetail {
  id: string;
  recipient: string;
  body: string;
  channel: NotificationChannel;
  status: NotificationStatus;
  priority: string;
  createdAt: string;
  deliveredAt: string | null;
  attempts: number;
  routingMode: string;
  routing_decision?: Record<string, unknown> | null;
  content_classification?: Record<string, unknown> | null;
  delivery_attempts?: DeliveryAttempt[];
}

export interface NotificationListResponse {
  data: NotificationDetail[];
  pagination: {
    total: number;
    limit: number;
    cursor: string | null;
  };
}

export interface NotificationSummary {
  total: number;
  delivered: number;
  failed: number;
  queued: number;
  processing: number;
}