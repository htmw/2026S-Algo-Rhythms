import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api.js';

interface Recipient {
  recipient: string;
  total_sent: number;
  total_engaged: number;
  channels_used: number;
  last_engaged_at: string | null;
}

interface RecipientListResponse {
  data: Recipient[];
  request_id: string;
}

export function useRecipients() {
  return useQuery<RecipientListResponse>({
    queryKey: ['recipients'],
    queryFn: () => apiFetch<RecipientListResponse>('/v1/routing/recipients'),
    refetchInterval: 60_000,
    retry: 2,
  });
}

interface EngagementRow {
  channel: string;
  sent: number;
  engaged: number;
  delivered: number;
}

interface EngagementResponse {
  data: EngagementRow[];
  request_id: string;
}

export function useRecipientEngagement(recipient: string) {
  return useQuery<EngagementResponse>({
    queryKey: ['recipientEngagement', recipient],
    queryFn: () =>
      apiFetch<EngagementResponse>(
        `/v1/routing/recipients/${encodeURIComponent(recipient)}/engagement`,
      ),
    enabled: !!recipient,
    retry: 1,
  });
}
