import { useState, useEffect, useRef } from 'react';
import { apiFetch } from '../lib/api.js';

export interface RawContentClassification {
  urgency_score: number;
  category: string;
  time_sensitivity_score: number;
  sentiment_score: number;
  optimal_channel_hint: string;
  reasoning: string;
  keywords?: string[];
  category_encoded?: number;
}

export interface RawRoutingDecision {
  mode: 'adaptive' | 'static';
  reason: string;
  selected: 'email' | 'websocket' | 'webhook';
  exploration: boolean;
  predictions: Record<string, number>;
  model_version: string;
}

export interface EngagementResult {
  engaged: boolean;
  reason: string | null;
  channel: string;
  engagementType: string | null;
}

interface DeliveryAttempt {
  channel_type: string;
  engaged: boolean | null;
  engagement_type: string | null;
  engagement_reason: string | null;
}

interface UseNotificationPollingResult {
  classification: RawContentClassification | null;
  routingDecision: RawRoutingDecision | null;
  deliveredVia: string | null;
  status: string | null;
  engagementResult: EngagementResult | null;
  isPolling: boolean;
  error: string | null;
}

interface NotificationPollResponse {
  content_classification: RawContentClassification | null;
  routing_decision: RawRoutingDecision | null;
  delivered_via?: string | null;
  status?: string | null;
  delivery_attempts?: DeliveryAttempt[];
}

const MAX_ATTEMPTS = 20;
const POLL_INTERVAL_MS = 1500;

function extractEngagement(attempts: DeliveryAttempt[] | undefined): EngagementResult | null {
  if (!attempts) return null;
  const attempt = attempts.find((a) => a.engaged !== null);
  if (!attempt) return null;
  return {
    engaged: attempt.engaged as boolean,
    reason: attempt.engagement_reason ?? null,
    channel: attempt.channel_type,
    engagementType: attempt.engagement_type ?? null,
  };
}

export function useNotificationPolling(notificationId: string | null): UseNotificationPollingResult {
  const [classification, setClassification] = useState<RawContentClassification | null>(null);
  const [routingDecision, setRoutingDecision] = useState<RawRoutingDecision | null>(null);
  const [deliveredVia, setDeliveredVia] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [engagementResult, setEngagementResult] = useState<EngagementResult | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attemptRef = useRef(0);

  useEffect(() => {
    if (!notificationId) {
      setClassification(null);
      setRoutingDecision(null);
      setDeliveredVia(null);
      setStatus(null);
      setEngagementResult(null);
      setIsPolling(false);
      setError(null);
      attemptRef.current = 0;
      return;
    }

    setClassification(null);
    setRoutingDecision(null);
    setDeliveredVia(null);
    setStatus(null);
    setEngagementResult(null);
    setError(null);
    setIsPolling(true);
    attemptRef.current = 0;

    const intervalId = setInterval(async () => {
      attemptRef.current += 1;

      try {
        const data = await apiFetch<NotificationPollResponse>(`/v1/notifications/${notificationId}`);

        if (data.content_classification) {
          setClassification(data.content_classification);
          setRoutingDecision(data.routing_decision ?? null);
          setDeliveredVia(data.delivered_via ?? null);
          setStatus(data.status ?? null);
        }

        const engagement = extractEngagement(data.delivery_attempts);
        if (engagement) {
          setEngagementResult(engagement);
        }

        const hasClassification = data.content_classification !== null;
        const hasEngagement = engagement !== null;

        if (hasClassification && hasEngagement) {
          setIsPolling(false);
          clearInterval(intervalId);
          return;
        }
      } catch (err) {
        console.warn(`Notification poll attempt ${attemptRef.current} failed:`, err);
      }

      if (attemptRef.current >= MAX_ATTEMPTS) {
        setError('Classification pending - worker may be processing');
        setIsPolling(false);
        clearInterval(intervalId);
      }
    }, POLL_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
      setIsPolling(false);
    };
  }, [notificationId]);

  return { classification, routingDecision, deliveredVia, status, engagementResult, isPolling, error };
}
