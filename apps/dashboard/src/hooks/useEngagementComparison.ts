import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api.js';

interface DataPoint {
  date: string;
  routing_mode: string;
  total: number;
  engaged: number;
}

interface EngagementComparisonResponse {
  data: DataPoint[];
  request_id: string;
}

export interface ChartPoint {
  date: string;
  static: number;
  adaptive: number;
}

function transformData(raw: DataPoint[]): ChartPoint[] {
  const map: Record<string, ChartPoint> = {};
  for (const { date, routing_mode, total, engaged } of raw) {
    const d = date.split('T')[0];
    if (!map[d]) map[d] = { date: d, static: 0, adaptive: 0 };
    const rate = total > 0 ? Math.round((engaged / total) * 100) : 0;
    if (routing_mode === 'static') map[d].static = rate;
    if (routing_mode === 'adaptive') map[d].adaptive = rate;
  }
  return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
}

export function useEngagementComparison() {
  return useQuery<ChartPoint[]>({
    queryKey: ['engagementComparison'],
    queryFn: async () => {
      const res = await apiFetch<EngagementComparisonResponse>(
        '/v1/routing/engagement-comparison',
      );
      return transformData(res.data ?? []);
    },
    refetchInterval: 60_000,
    retry: 2,
  });
}
