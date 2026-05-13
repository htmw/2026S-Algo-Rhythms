import { useEffect } from 'react';
import { useDashboardSocket } from '../hooks/useDashboardSocket';
import { useThemeContext } from '../contexts/ThemeContext.js';

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
  const { isDark } = useThemeContext();

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
    <div style={{
      position: 'fixed',
      bottom: 16,
      right: 16,
      padding: '6px 12px',
      borderRadius: 6,
      fontSize: 12,
      background: connected
        ? (isDark ? '#052E16' : '#E1F5EE')
        : (isDark ? '#450A0A' : '#FCEBEB'),
      color: connected ? '#0F6E56' : '#A32D2D',
      border: '1px solid currentColor',
      fontFamily: 'monospace',
      zIndex: 9999,
    }}>
      Socket: {status}
    </div>
  );
}
