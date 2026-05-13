import { useEffect } from 'react';
import { useDashboardSocket } from '../hooks/useDashboardSocket';

const ALL_EVENTS = [
  'delivery.completed',
  'notification.status_changed',
  'channel.circuit_breaker_state_changed',
  'engagement.recorded',
  'notification.enqueued',
  'dlq.entry_added',
  'model.retrained',
];

export function SocketDebugPanel() {
  const { on, status } = useDashboardSocket();

  useEffect(() => {
    const cleanups = ALL_EVENTS.map((eventName) =>
      on(eventName, (payload) => {
        console.log(`[Socket event] ${eventName}`, payload);
      })
    );
    return () => cleanups.forEach((off) => off());
  }, [on]);

  const connected = status === 'connected';

  return (
    <div
      className={`fixed bottom-4 right-4 z-[9999] rounded-md border px-3 py-1.5 font-mono text-xs ${
        connected
          ? 'border-green-600 bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-400'
          : 'border-red-600 bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400'
      }`}
    >
      Socket: {status}
    </div>
  );
}
