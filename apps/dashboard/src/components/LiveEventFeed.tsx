import { useState, useEffect, useRef } from 'react';
import { useDashboardSocket } from '../hooks/useDashboardSocket';
import type {
  DeliveryCompletedPayload,
  NotificationEnqueuedPayload,
  NotificationStatusChangedPayload,
  EngagementRecordedPayload,
} from '@notifyengine/shared';

interface FeedEvent {
  id: string;
  type: 'enqueued' | 'delivered' | 'failed' | 'engaged' | 'status_changed';
  notificationId: string;
  recipient: string;
  channel?: string;
  detail: string;
  timestamp: string;
}

const TYPE_CONFIG = {
  enqueued:       { label: 'Sent',     bg: '#E6F1FB', color: '#185FA5', dot: '#378ADD' },
  delivered:      { label: 'Delivered', bg: '#E1F5EE', color: '#0F6E56', dot: '#1D9E75' },
  failed:         { label: 'Failed',   bg: '#FCEBEB', color: '#A32D2D', dot: '#E24B4A' },
  engaged:        { label: 'Engaged',  bg: '#FAEEDA', color: '#854F0B', dot: '#EF9F27' },
  status_changed: { label: 'Updated',  bg: '#F1EFE8', color: '#5F5E5A', dot: '#888780' },
};

function EventRow({ event }: { event: FeedEvent }) {
  const config = TYPE_CONFIG[event.type];
  const time = new Date(event.timestamp).toLocaleTimeString([], {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '8px 1fr auto',
      gap: '0 12px',
      alignItems: 'start',
      padding: '10px 16px',
      borderBottom: '1px solid #F1EFE8',
      animation: 'slideDown 0.2s ease-out',
    }}>
      {/* Status dot */}
      <div style={{
        width: 8, height: 8, borderRadius: '50%',
        background: config.dot, marginTop: 5, flexShrink: 0,
      }} />

      {/* Content */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{
            fontSize: 11, fontWeight: 500, padding: '1px 7px',
            borderRadius: 999, background: config.bg, color: config.color,
          }}>
            {config.label}
          </span>
          <span style={{ fontSize: 13, color: '#3d3d3a', fontWeight: 500 }}>
            {event.recipient}
          </span>
          {event.channel && (
            <span style={{ fontSize: 11, color: '#888780' }}>
              via {event.channel}
            </span>
          )}
        </div>
        <div style={{ fontSize: 11, color: '#888780', marginTop: 2 }}>
          {event.detail}
        </div>
      </div>

      {/* Time */}
      <span style={{
        fontSize: 11, color: '#888780',
        fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
      }}>
        {time}
      </span>
    </div>
  );
}

export function LiveEventFeed() {
  const { on, status } = useDashboardSocket();
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const counterRef = useRef(0);

  const addEvent = (event: FeedEvent) => {
    setEvents((prev) => [event, ...prev].slice(0, 100));
  };

  useEffect(() => {
    const off1 = on('notification.enqueued', (raw) => {
      const p = raw as NotificationEnqueuedPayload;
      addEvent({
        id: `${++counterRef.current}`,
        type: 'enqueued',
        notificationId: p.notificationId,
        recipient: p.recipient,
        detail: `Priority: ${p.priority} · Routing: ${p.routingMode}`,
        timestamp: p.timestamp,
      });
    });

    const off2 = on('delivery.completed', (raw) => {
      const p = raw as DeliveryCompletedPayload;
      addEvent({
        id: `${++counterRef.current}`,
        type: p.status === 'success' ? 'delivered' : 'failed',
        notificationId: p.notificationId,
        recipient: p.recipient,
        channel: p.channel,
        detail: p.status === 'success'
          ? `Delivered in ${p.durationMs}ms · attempt ${p.attemptNumber}`
          : `Failed after ${p.durationMs}ms · attempt ${p.attemptNumber}`,
        timestamp: p.timestamp,
      });
    });

    const off3 = on('notification.status_changed', (raw) => {
      const p = raw as NotificationStatusChangedPayload;
      addEvent({
        id: `${++counterRef.current}`,
        type: 'status_changed',
        notificationId: p.notificationId,
        recipient: '',
        channel: p.channel ?? undefined,
        detail: `${p.previousStatus} → ${p.newStatus}`,
        timestamp: p.timestamp,
      });
    });

    const off4 = on('engagement.recorded', (raw) => {
      const p = raw as EngagementRecordedPayload;
      addEvent({
        id: `${++counterRef.current}`,
        type: 'engaged',
        notificationId: p.notificationId,
        recipient: p.recipient,
        channel: p.channel,
        detail: p.engagementType.replace('_', ' '),
        timestamp: p.timestamp,
      });
    });

    return () => { off1(); off2(); off3(); off4(); };
  }, [on]);

  return (
    <div style={{
      border: '1px solid #D3D1C7',
      borderRadius: 12,
      overflow: 'hidden',
      background: '#fff',
      fontFamily: 'sans-serif',
    }}>
      <style>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: none; }
        }
      `}</style>

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px',
        borderBottom: '1px solid #D3D1C7',
        background: '#F1EFE8',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 500, color: '#2C2C2A' }}>
            Live event feed
          </span>
          <span style={{
            fontSize: 11, display: 'flex', alignItems: 'center', gap: 5,
            color: status === 'connected' ? '#0F6E56' : '#A32D2D',
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%', display: 'inline-block',
              background: status === 'connected' ? '#1D9E75' : '#E24B4A',
            }} />
            {status === 'connected' ? 'Live' : status}
          </span>
        </div>
        {events.length > 0 && (
          <button
            onClick={() => setEvents([])}
            style={{
              fontSize: 11, padding: '2px 8px', borderRadius: 6,
              border: '1px solid #B4B2A9', background: 'transparent',
              color: '#5F5E5A', cursor: 'pointer',
            }}
          >
            Clear
          </button>
        )}
      </div>

      {/* Event list */}
      <div style={{ maxHeight: 400, overflowY: 'auto' }}>
        {events.length === 0 ? (
          <div style={{
            padding: '40px 16px', textAlign: 'center',
            color: '#888780', fontSize: 13,
          }}>
            {status === 'connected'
              ? 'Waiting for events…'
              : 'Not connected to event stream'}
          </div>
        ) : (
          events.map((event) => <EventRow key={event.id} event={event} />)
        )}
      </div>

      {/* Footer */}
      {events.length > 0 && (
        <div style={{
          padding: '6px 16px', fontSize: 11, color: '#888780',
          borderTop: '1px solid #D3D1C7', background: '#F1EFE8',
        }}>
          {events.length} events · showing most recent first
        </div>
      )}
    </div>
  );
}