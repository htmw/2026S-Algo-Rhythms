import type {
  DeliveryChannel,
  NotificationPriority,
  NotificationStatus,
  RoutingDecision,
} from './types.js';

export const DASHBOARD_EVENTS = {
  DELIVERY_COMPLETED: 'delivery.completed',
  NOTIFICATION_STATUS_CHANGED: 'notification.status_changed',
  CIRCUIT_BREAKER_STATE_CHANGED: 'channel.circuit_breaker_state_changed',
  ENGAGEMENT_RECORDED: 'engagement.recorded',
  NOTIFICATION_ENQUEUED: 'notification.enqueued',
  DLQ_ENTRY_ADDED: 'dlq.entry_added',
  MODEL_RETRAINED: 'model.retrained',
} as const;

export type DashboardEventName = typeof DASHBOARD_EVENTS[keyof typeof DASHBOARD_EVENTS];

export type CircuitBreakerState = 'closed' | 'open' | 'half_open';

export interface DeliveryCompletedPayload {
  notification_id: string;
  tenant_id: string;
  channel: DeliveryChannel;
  recipient_masked: string;
  success: boolean;
  attempt_number: number;
  latency_ms: number;
  error_code?: string;
  occurred_at: string;
}

export interface NotificationStatusChangedPayload {
  notification_id: string;
  tenant_id: string;
  previous_status: NotificationStatus;
  new_status: NotificationStatus;
  changed_at: string;
}

export interface CircuitBreakerStateChangedPayload {
  tenant_id: string;
  channel_id: string;
  channel: DeliveryChannel;
  previous_state: CircuitBreakerState;
  new_state: CircuitBreakerState;
  failure_count: number;
  changed_at: string;
}

export interface EngagementRecordedPayload {
  notification_id: string;
  tenant_id: string;
  channel: DeliveryChannel;
  recipient_masked: string;
  engagement_type: 'open' | 'click' | 'ack';
  engaged_at: string;
}

export interface NotificationEnqueuedPayload {
  notification_id: string;
  tenant_id: string;
  recipient_masked: string;
  priority: NotificationPriority;
  queue: string;
  enqueued_at: string;
}

export interface DlqEntryAddedPayload {
  notification_id: string;
  tenant_id: string;
  channel: DeliveryChannel;
  recipient_masked: string;
  attempts: number;
  last_error_code: string;
  last_error_message: string;
  failed_at: string;
}

export interface ModelRetrainedPayload {
  tenant_id: string | null;
  model_version: string;
  previous_version: string | null;
  promoted: boolean;
  metrics: {
    auc?: number;
    accuracy?: number;
    sample_count?: number;
  };
  feature_importance?: Record<string, number>;
  trained_at: string;
}

export interface DashboardEventEnvelope<T = unknown> {
  tenantId: string;
  event: DashboardEventName;
  payload: T;
}

export type DashboardEventPayloadMap = {
  [DASHBOARD_EVENTS.DELIVERY_COMPLETED]: DeliveryCompletedPayload;
  [DASHBOARD_EVENTS.NOTIFICATION_STATUS_CHANGED]: NotificationStatusChangedPayload;
  [DASHBOARD_EVENTS.CIRCUIT_BREAKER_STATE_CHANGED]: CircuitBreakerStateChangedPayload;
  [DASHBOARD_EVENTS.ENGAGEMENT_RECORDED]: EngagementRecordedPayload;
  [DASHBOARD_EVENTS.NOTIFICATION_ENQUEUED]: NotificationEnqueuedPayload;
  [DASHBOARD_EVENTS.DLQ_ENTRY_ADDED]: DlqEntryAddedPayload;
  [DASHBOARD_EVENTS.MODEL_RETRAINED]: ModelRetrainedPayload;
};

export type { RoutingDecision };
