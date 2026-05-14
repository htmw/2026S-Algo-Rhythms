import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api.js';

interface ModelInfo {
  loaded: boolean;
  version?: string;
  metrics?: Record<string, number>;
  feature_importance?: Record<string, number>;
  training_samples?: number;
  request_id?: string;
}

export function useModelMetrics() {
  return useQuery<ModelInfo>({
    queryKey: ['modelMetrics'],
    queryFn: () => apiFetch<ModelInfo>('/v1/model/info'),
    refetchInterval: 60_000,
    retry: 1,
  });
}

interface ModelHistoryEntry {
  version: string;
  auc_roc: number | null;
  accuracy: number | null;
  precision_score: number | null;
  recall_score: number | null;
  f1_score: number | null;
  training_samples: number;
  feature_importance: Record<string, number> | null;
  created_at: string;
}

interface ModelHistoryResponse {
  data: ModelHistoryEntry[];
  request_id: string;
}

export function useModelHistory() {
  return useQuery<ModelHistoryResponse>({
    queryKey: ['modelHistory'],
    queryFn: () => apiFetch<ModelHistoryResponse>('/v1/routing/model/history'),
    refetchInterval: 60_000,
    retry: 1,
  });
}
