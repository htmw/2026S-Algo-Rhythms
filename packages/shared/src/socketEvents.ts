import type {
  DeliveryChannel,
  NotificationPriority,
  NotificationStatus,
  RoutingMode,
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

export interface DeliveryRoutingInfo {
  mode: RoutingMode;
  exploration: boolean;
  modelVersion: string | null;
}

export interface DeliveryCompletedPayload {
  notificationId: string;
  recipient: string;
  channel: DeliveryChannel;
  status: 'success' | 'failure';
  statusCode: number | null;
  durationMs: number;
  attemptNumber: number;
  routing: DeliveryRoutingInfo;
  priority: NotificationPriority;
  timestamp: string;
}

export interface NotificationStatusChangedPayload {
  notificationId: string;
  previousStatus: NotificationStatus;
  newStatus: NotificationStatus;
  channel: string | null;
  timestamp: string;
}

export interface CircuitBreakerStateChangedPayload {
  channelType: DeliveryChannel;
  previousState: CircuitBreakerState;
  newState: CircuitBreakerState;
  failureCount: number;
  timestamp: string;
}

export type EngagementType = 'ws_ack' | 'email_open' | 'webhook_2xx' | 'link_click';

export interface EngagementRecordedPayload {
  notificationId: string;
  recipient: string;
  channel: DeliveryChannel;
  engagementType: EngagementType;
  timestamp: string;
}

export interface NotificationEnqueuedPayload {
  notificationId: string;
  recipient: string;
  priority: NotificationPriority;
  routingMode: RoutingMode;
  timestamp: string;
}

export interface DlqEntryAddedPayload {
  notificationId: string;
  recipient: string;
  lastChannel: DeliveryChannel;
  lastError: string;
  totalAttempts: number;
  timestamp: string;
}

export interface ModelRetrainedMetrics {
  accuracy: number;
  aucRoc: number;
  precision: number;
  recall: number;
  f1: number;
}

export interface ModelRetrainedPayload {
  version: string;
  promoted: boolean;
  metrics: ModelRetrainedMetrics;
  trainingSamples: number;
  previousVersion: string | null;
  previousAucRoc: number | null;
  timestamp: string;
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
