import { useState, useEffect, useRef } from 'react';
import { useDashboardSocket } from '../hooks/useDashboardSocket';

interface DeliveryCompletedPayload {
  notificationId: string;
  recipient: string;
  channel: string;
  status: 'success' | 'failure';
  durationMs: number;
  attemptNumber: number;
  timestamp: string;
}
interface NotificationEnqueuedPayload {
  notificationId: string;
  recipient: string;
  priority: string;
  routingMode: string;
  timestamp: string;
}
interface NotificationStatusChangedPayload {
  notificationId: string;
  previousStatus: string;
  newStatus: string;
  channel?: string;
  timestamp: string;
}
interface EngagementRecordedPayload {
  notificationId: string;
  recipient: string;
  channel: string;
  engagementType: string;
  timestamp: string;
}

interface FeedEvent {
  id: string;
  type: 'enqueued' | 'delivered' | 'failed' | 'engaged' | 'status_changed';
  notificationId: string;
  recipient: string;
  channel?: string;
  detail: string;
  timestamp: string;
}

const TYPE_CONFIG: Record<FeedEvent['type'], { label: string; badgeCls: string; dotCls: string }> = {
  enqueued:       { label: 'Sent',      badgeCls: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400',     dotCls: 'bg-blue-500' },
  delivered:      { label: 'Delivered', badgeCls: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400', dotCls: 'bg-green-500' },
  failed:         { label: 'Failed',    badgeCls: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400',         dotCls: 'bg-red-500' },
  engaged:        { label: 'Engaged',   badgeCls: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400', dotCls: 'bg-amber-500' },
  status_changed: { label: 'Updated',   badgeCls: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300',        dotCls: 'bg-gray-400 dark:bg-gray-500' },
};

function EventRow({ event }: { event: FeedEvent }) {
  const config = TYPE_CONFIG[event.type];
  const time = new Date(event.timestamp).toLocaleTimeString([], {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });

  return (
    <div className="grid animate-[slideDown_0.2s_ease-out] border-b border-gray-100 dark:border-gray-700 px-4 py-2.5" style={{ gridTemplateColumns: '8px 1fr auto', gap: '0 12px', alignItems: 'start' }}>
      <div className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${config.dotCls}`} />
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-1.5 py-px text-[11px] font-medium ${config.badgeCls}`}>
            {config.label}
          </span>
          <span className="text-[13px] font-medium text-gray-900 dark:text-gray-100">
            {event.recipient}
          </span>
          {event.channel && (
            <span className="text-[11px] text-gray-400 dark:text-gray-500">
              via {event.channel}
            </span>
          )}
        </div>
        <div className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500">
          {event.detail}
        </div>
      </div>
      <span className="whitespace-nowrap text-[11px] tabular-nums text-gray-400 dark:text-gray-500">
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
    <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      <style>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: none; }
        }
      `}</style>

      <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
            Live event feed
          </span>
          <span className={`flex items-center gap-1.5 text-[11px] ${
            status === 'connected' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
          }`}>
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${
              status === 'connected' ? 'bg-green-500' : 'bg-red-500'
            }`} />
            {status === 'connected' ? 'Live' : status}
          </span>
        </div>
        {events.length > 0 && (
          <button
            onClick={() => setEvents([])}
            className="rounded-md border border-gray-300 dark:border-gray-600 bg-transparent px-2 py-0.5 text-[11px] text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            Clear
          </button>
        )}
      </div>

      <div className="max-h-[400px] overflow-y-auto">
        {events.length === 0 ? (
          <div className="py-10 text-center text-[13px] text-gray-400 dark:text-gray-500">
            {status === 'connected'
              ? 'Waiting for events…'
              : 'Not connected to event stream'}
          </div>
        ) : (
          events.map((event) => <EventRow key={event.id} event={event} />)
        )}
      </div>

      {events.length > 0 && (
        <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-4 py-1.5 text-[11px] text-gray-400 dark:text-gray-500">
          {events.length} events · showing most recent first
        </div>
      )}
    </div>
  );
}
