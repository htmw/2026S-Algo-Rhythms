export interface NotificationJob {
  notificationId: string;
  tenantId: string;
  recipient: string;
  priority: NotificationPriority;
  routingMode: RoutingMode;
  channelPreference?: string[];
  forceChannel?: string;
}

export interface RoutingDecision {
  selected: string;
  predictions: Record<string, number>;
  exploration: boolean;
  reason: string;
  modelVersion: string;
}

export interface ApiError {
  code: string;
  message: string;
  retry_after_ms?: number;
}

export type NotificationPriority = 'critical' | 'high' | 'standard' | 'bulk';

export type RoutingMode = 'adaptive' | 'static' | 'forced';

export type NotificationStatus =
  | 'accepted'
  | 'queued'
  | 'processing'
  | 'delivered'
  | 'failed'
  | 'dlq';

export type DeliveryChannel = 'email' | 'sms_webhook' | 'websocket' | 'webhook';
