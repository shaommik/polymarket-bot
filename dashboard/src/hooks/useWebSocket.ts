import { useEffect, useRef, useCallback } from 'react';
import type { WsEvent } from '@shared/types';

const WS_URL = `ws://${window.location.host}/ws/feed`;
const RECONNECT_DELAY_MS = 3000;
const MAX_RETRIES = 10;

export type WsEventHandler = (event: WsEvent) => void;

export function useWebSocket(onEvent: WsEventHandler) {
  const wsRef = useRef<WebSocket | null>(null);
  const retriesRef = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stoppedRef = useRef(false);
  const onEventRef = useRef(onEvent);

  // Keep handler ref fresh without restarting the socket
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  const connect = useCallback(() => {
    if (stoppedRef.current) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      retriesRef.current = 0;
    };

    ws.onmessage = (msg: MessageEvent<string>) => {
      let parsed: WsEvent;
      try {
        parsed = JSON.parse(msg.data) as WsEvent;
      } catch {
        return;
      }
      onEventRef.current(parsed);
    };

    ws.onclose = () => {
      if (stoppedRef.current) return;
      if (retriesRef.current >= MAX_RETRIES) return;

      const delay = Math.min(RECONNECT_DELAY_MS * Math.pow(2, retriesRef.current), 60_000);
      retriesRef.current++;
      reconnectTimer.current = setTimeout(connect, delay);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    stoppedRef.current = false;
    connect();

    return () => {
      stoppedRef.current = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close(1000, 'Component unmounted');
    };
  }, [connect]);
}
