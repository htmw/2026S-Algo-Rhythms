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