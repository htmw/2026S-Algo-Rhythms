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

interface UseClassificationPollingResult {
  classification: RawContentClassification | null;
  isPolling: boolean;
  error: string | null;
}

interface NotificationPollResponse {
  content_classification: RawContentClassification | null;
}

const MAX_ATTEMPTS = 20;
const POLL_INTERVAL_MS = 1500;

export function useClassificationPolling(notificationId: string | null): UseClassificationPollingResult {
  const [classification, setClassification] = useState<RawContentClassification | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attemptRef = useRef(0);

  useEffect(() => {
    if (!notificationId) {
      setClassification(null);
      setIsPolling(false);
      setError(null);
      attemptRef.current = 0;
      return;
    }

    setClassification(null);
    setError(null);
    setIsPolling(true);
    attemptRef.current = 0;

    const intervalId = setInterval(async () => {
      attemptRef.current += 1;

      try {
        const data = await apiFetch<NotificationPollResponse>(`/v1/notifications/${notificationId}`);
        if (data.content_classification) {
          setClassification(data.content_classification);
          setIsPolling(false);
          clearInterval(intervalId);
          return;
        }
      } catch (err) {
        console.warn(`Classification poll attempt ${attemptRef.current} failed:`, err);
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

  return { classification, isPolling, error };
}
