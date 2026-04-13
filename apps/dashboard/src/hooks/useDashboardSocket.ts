import { useEffect, useRef, useCallback, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { getApiKey } from '../lib/apiKey';

export type SocketStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

type EventHandler = (payload: unknown) => void;

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
    });
    socket.on('disconnect', () => {
      setStatus('disconnected');
    });
    socket.on('connect_error', () => {
      setStatus('error');
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