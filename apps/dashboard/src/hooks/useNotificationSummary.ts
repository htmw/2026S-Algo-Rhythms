import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchNotificationSummary } from '../services/notificationService';
import { useDashboardSocket } from './useDashboardSocket';

export function useNotificationSummary() {
  const queryClient = useQueryClient();
  const { on } = useDashboardSocket();

  useEffect(() => {
    const off1 = on('delivery.completed', () => {
      queryClient.invalidateQueries({ queryKey: ['notification-summary'] });
    });
    const off2 = on('notification.status_changed', () => {
      queryClient.invalidateQueries({ queryKey: ['notification-summary'] });
    });
    const off3 = on('notification.enqueued', () => {
      queryClient.invalidateQueries({ queryKey: ['notification-summary'] });
    });
    return () => { off1(); off2(); off3(); };
  }, [on, queryClient]);

  return useQuery({
    queryKey: ['notification-summary'],
    queryFn: fetchNotificationSummary,
    refetchInterval: 30000,
  });
}