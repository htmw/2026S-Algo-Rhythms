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

  return (
    <div style={{
      position: 'fixed',
      bottom: 16,
      right: 16,
      padding: '6px 12px',
      borderRadius: 6,
      fontSize: 12,
      background: status === 'connected' ? '#E1F5EE' : '#FCEBEB',
      color: status === 'connected' ? '#0F6E56' : '#A32D2D',
      border: '1px solid currentColor',
      fontFamily: 'monospace',
      zIndex: 9999,
    }}>
      Socket: {status}
    </div>
  );
}