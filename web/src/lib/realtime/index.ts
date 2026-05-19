import { useCallback, useEffect, useRef } from "react";

const WS_BASE: string =
  (import.meta.env.VITE_WS_BASE as string | undefined) ??
  (window.location.protocol === "https:" ? "wss://" : "ws://") +
    window.location.host;

type Handler = (msg: unknown) => void;

/**
 * useTopicSubscription opens a WebSocket to the given API path (e.g.
 * `/ws/run/<runId>`), invokes onMessage(parsedJSON) for every inbound frame,
 * and auto-reconnects with exponential backoff. Returns a `reconnected` token
 * the caller can watch to refetch authoritative state via REST.
 */
export function useTopicSubscription(
  path: string | null | undefined,
  onMessage: Handler,
  onReconnect?: () => void,
) {
  const handlerRef = useRef(onMessage);
  const reconnectRef = useRef(onReconnect);
  handlerRef.current = onMessage;
  reconnectRef.current = onReconnect;

  useEffect(() => {
    if (!path) return;
    let ws: WebSocket | null = null;
    let closed = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const connect = (isReconnect: boolean) => {
      if (closed) return;
      const url = `${WS_BASE}/api${path}`;
      ws = new WebSocket(url);
      ws.onopen = () => {
        attempt = 0;
        if (isReconnect) reconnectRef.current?.();
      };
      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          handlerRef.current(data);
        } catch {
          // ignore non-JSON frames
        }
      };
      ws.onclose = () => {
        if (closed) return;
        attempt += 1;
        const delay = Math.min(30_000, 500 * 2 ** Math.min(attempt, 5));
        timer = setTimeout(() => connect(true), delay);
      };
      ws.onerror = () => {
        // onclose will follow; nothing to do here.
      };
    };

    connect(false);
    return () => {
      closed = true;
      if (timer) clearTimeout(timer);
      ws?.close();
    };
  }, [path]);
}

/**
 * useWebSocketPublisher exposes a function to send JSON-serializable messages
 * to a server topic via WebSocket. The connection is kept alive while the
 * caller is mounted. An optional onMessage handler turns the socket into a
 * bidirectional channel (avoids opening a separate subscribe socket).
 */
export function useWebSocketPublisher(
  path: string | null | undefined,
  onMessage?: Handler,
) {
  const ref = useRef<WebSocket | null>(null);
  const handlerRef = useRef(onMessage);
  handlerRef.current = onMessage;
  useEffect(() => {
    if (!path) return;
    const url = `${WS_BASE}/api${path}`;
    const ws = new WebSocket(url);
    ref.current = ws;
    ws.onmessage = (e) => {
      const fn = handlerRef.current;
      if (!fn) return;
      try {
        const data = JSON.parse(e.data);
        fn(data);
      } catch {
        // ignore non-JSON frames
      }
    };
    return () => {
      ws.close();
      ref.current = null;
    };
  }, [path]);

  return useCallback((msg: unknown) => {
    const ws = ref.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(msg));
  }, []);
}
