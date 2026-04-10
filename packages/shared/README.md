# packages/shared

Shared TypeScript types, constants, Zod validation schemas, and Socket.IO event definitions used by `apps/api`, `apps/worker`, and `apps/dashboard`. Single source of truth for cross-service contracts.

## Exported types and interfaces

From `src/types.ts`:

| Export | Kind | Description |
|---|---|---|
| `NotificationJob` | interface | Job data shape for BullMQ notification queues |
| `RoutingDecision` | interface | ML routing result: selected channel, predictions, exploration flag, reason, model version |
| `ApiError` | interface | Standard error envelope: code, message, optional retry_after_ms |
| `NotificationPriority` | type | `'critical' \| 'high' \| 'standard' \| 'bulk'` |
| `RoutingMode` | type | `'adaptive' \| 'static' \| 'forced'` |
| `NotificationStatus` | type | `'accepted' \| 'queued' \| 'processing' \| 'delivered' \| 'failed' \| 'dlq'` |
| `DeliveryChannel` | type | `'email' \| 'sms_webhook' \| 'websocket' \| 'webhook'` |

From `src/constants.ts`:

| Export | Kind | Description |
|---|---|---|
| `QUEUE_NAMES` | object | BullMQ queue name strings (CRITICAL, HIGH, STANDARD, BULK, DLQ, ML_RETRAIN, STATS_ROLLUP) |
| `QUEUE_CONCURRENCY` | object | Worker concurrency per priority queue |
| `RETRY_CONFIG` | object | Per-priority retry attempts and exponential backoff config |
| `PRIORITY_SCORE` | object | Numeric scores: critical=4, high=3, standard=2, bulk=1 |

From `src/schemas.ts`:

| Export | Kind | Description |
|---|---|---|
| `SendNotificationSchema` | Zod schema | Validates notification submission request body |
| `CreateTenantSchema` | Zod schema | Validates tenant creation request body |
| `SendNotificationInput` | type | Inferred type from `SendNotificationSchema` |
| `CreateTenantInput` | type | Inferred type from `CreateTenantSchema` |

From `src/socketEvents.ts`:

| Export | Kind | Description |
|---|---|---|
| `DASHBOARD_EVENTS` | object | Event name constants for Socket.IO dashboard namespace |
| `DashboardEventName` | type | Union of all dashboard event name strings |
| `CircuitBreakerState` | type | `'closed' \| 'open' \| 'half_open'` |
| `DeliveryRoutingInfo` | interface | Routing metadata attached to delivery events |
| `DeliveryCompletedPayload` | interface | Payload for delivery.completed events |
| `NotificationStatusChangedPayload` | interface | Payload for notification.status_changed events |
| `CircuitBreakerStateChangedPayload` | interface | Payload for channel.circuit_breaker_state_changed events |
| `EngagementType` | type | `'ws_ack' \| 'email_open' \| 'webhook_2xx' \| 'link_click'` |
| `EngagementRecordedPayload` | interface | Payload for engagement.recorded events |
| `NotificationEnqueuedPayload` | interface | Payload for notification.enqueued events |
| `DlqEntryAddedPayload` | interface | Payload for dlq.entry_added events |
| `ModelRetrainedMetrics` | interface | Training metrics (accuracy, aucRoc, precision, recall, f1) |
| `ModelRetrainedPayload` | interface | Payload for model.retrained events |
| `DashboardEventEnvelope<T>` | interface | Generic wrapper: tenantId + event name + typed payload |
| `DashboardEventPayloadMap` | type | Maps each event name to its payload type |
