import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchNotificationSummary } from '../services/notificationService';
import type { NotificationSummary } from '../services/notificationService';
import { useDashboardSocket } from './useDashboardSocket';

export function useNotificationSummary() {
  const queryClient = useQueryClient();
  const { on } = useDashboardSocket();

  useEffect(() => {
    const off1 = on('delivery.completed', (payload: unknown) => {
      const p = payload as { status?: string };
      queryClient.setQueryData<NotificationSummary>(
        ['notification-summary'],
        (old) => {
          if (!old) return old;
          return {
            ...old,
            delivered: old.delivered + 1,
            queued: Math.max(0, old.queued - 1),
          };
        }
      );
    });

    const off2 = on('notification.status_changed', (payload: unknown) => {
      const p = payload as { old_status?: string; new_status?: string };
      queryClient.setQueryData<NotificationSummary>(
        ['notification-summary'],
        (old) => {
          if (!old) return old;
          const updated = { ...old };
          if (p.old_status === 'queued') updated.queued = Math.max(0, updated.queued - 1);
          if (p.old_status === 'processing') updated.processing = Math.max(0, updated.processing - 1);
          if (p.new_status === 'delivered') updated.delivered += 1;
          if (p.new_status === 'failed') updated.failed += 1;
          if (p.new_status === 'processing') updated.processing += 1;
          return updated;
        }
      );
    });

    const off3 = on('notification.enqueued', () => {
      queryClient.setQueryData<NotificationSummary>(
        ['notification-summary'],
        (old) => {
          if (!old) return old;
          return {
            ...old,
            total: old.total + 1,
            queued: old.queued + 1,
          };
        }
      );
    });

    return () => { off1(); off2(); off3(); };
  }, [on, queryClient]);

  return useQuery({
    queryKey: ['notification-summary'],
    queryFn: fetchNotificationSummary,
    refetchInterval: 30000,
  });
}