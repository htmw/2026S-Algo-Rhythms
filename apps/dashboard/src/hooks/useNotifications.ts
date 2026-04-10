import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api.js';
import type { NotificationDetail, NotificationListResponse } from '../types/notification.js';
import { useDashboardSocket } from './useDashboardSocket';

export function useNotifications(limit = 20) {
  const queryClient = useQueryClient();
  const { on } = useDashboardSocket();

  useEffect(() => {
    const off1 = on('notification.enqueued', () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    });
    const off2 = on('delivery.completed', () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    });
    const off3 = on('notification.status_changed', () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    });
    return () => { off1(); off2(); off3(); };
  }, [on, queryClient]);

  return useQuery<NotificationListResponse>({
    queryKey: ['notifications', limit],
    queryFn: () => apiFetch<NotificationListResponse>(`/v1/notifications?limit=${limit}`),
    refetchInterval: 30_000,
    retry: 2,
  });
}

export function useNotification(id: string | null) {
  return useQuery<NotificationDetail>({
    queryKey: ['notification', id],
    queryFn: () => apiFetch<NotificationDetail>(`/v1/notifications/${id}`),
    enabled: !!id,
    retry: 1,
  });
}