import type {
  NotificationPriority,
  NotificationStatus,
  DeliveryChannel,
  RoutingMode,
  RoutingDecision,
} from '@notifyengine/shared';

export interface Notification {
  id: string;
  tenant_id: string;
  recipient: string;
  subject: string | null;
  body?: string;
  priority: NotificationPriority;
  status: NotificationStatus;
  routing_mode: RoutingMode;
  delivered_via: DeliveryChannel | null;
  delivered_at: string | null;
  failed_at: string | null;
  routing_decision: RoutingDecision | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface DeliveryAttempt {
  id: string;
  channel_type: DeliveryChannel;
  attempt_number: number;
  status: 'pending' | 'success' | 'failure' | 'timeout';
  status_code: number | null;
  error_message: string | null;
  engaged: boolean | null;
  engagement_type: string | null;
  engaged_at: string | null;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
}

export interface NotificationDetail extends Notification {
  delivery_attempts: DeliveryAttempt[];
}

export interface NotificationListResponse {
  data: Notification[];
  total: number;
}