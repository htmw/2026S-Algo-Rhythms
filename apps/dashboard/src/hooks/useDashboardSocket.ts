import { useEffect, useRef, useCallback, useState } from 'react';
import { io, Socket } from 'socket.io-client';

type EventHandler = (payload: unknown) => void;
export type SocketStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

function getApiKey(): string {
  return import.meta.env.VITE_API_KEY ?? '';
}

export function useDashboardSocket() {
  const socketRef = useRef<Socket | null>(null);
  const [status, setStatus] = useState<SocketStatus>('connecting');

  useEffect(() => {
    const socket = io(`${import.meta.env.VITE_API_URL}/dashboard`, {
      auth: { token: getApiKey() },
      transports: ['websocket'],
    });
    socketRef.current = socket;
    socket.on('connect', () => {
      setStatus('connected');
      console.debug('[Socket] Connected:', socket.id);
    });
    socket.on('disconnect', (reason) => {
      setStatus('disconnected');
      console.debug('[Socket] Disconnected:', reason);
    });
    socket.on('connect_error', (err) => {
      setStatus('error');
      console.error('[Socket] Error:', err.message);
    });
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  const on = useCallback((event: string, handler: EventHandler) => {
    const socket = socketRef.current;
    if (!socket) return () => {};
    socket.on(event, handler);
    return () => { socket.off(event, handler); };
  }, []);

  return { on, status };
}