import { useRef, useEffect, useCallback, useState } from "react";
import { useConnectionStore, type ConnectionStatus } from "../stores/connection";

interface UseWebSocketOptions {
  url: string;
  onMessage?: (data: unknown) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (error: Event) => void;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

interface UseWebSocketReturn {
  isConnected: boolean;
  send: (data: unknown) => void;
  reconnect: () => void;
}

export function useWebSocket(options: UseWebSocketOptions): UseWebSocketReturn {
  const {
    url,
    onMessage,
    onOpen,
    onClose,
    onError,
    reconnectInterval = 3000,
    maxReconnectAttempts = 5,
  } = options;

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectCountRef = useRef(0);
  const [isConnected, setIsConnected] = useState(false);
  const onMessageRef = useRef(onMessage);
  const onOpenRef = useRef(onOpen);
  const onCloseRef = useRef(onClose);
  const onErrorRef = useRef(onError);

  onMessageRef.current = onMessage;
  onOpenRef.current = onOpen;
  onCloseRef.current = onClose;
  onErrorRef.current = onError;

  const setStatus = useConnectionStore((s) => s.setStatus);
  const setError = useConnectionStore((s) => s.setError);
  const setAttempts = useConnectionStore((s) => s.setAttempts);
  const registerReconnect = useConnectionStore((s) => s.registerReconnect);

  const updateStatus = useCallback(
    (status: ConnectionStatus) => {
      setStatus(status);
      if (status === "connected") setError(null);
    },
    [setStatus, setError]
  );

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    updateStatus(reconnectCountRef.current > 0 ? "reconnecting" : "connecting");

    try {
      const ws = new WebSocket(url);

      ws.onopen = () => {
        setIsConnected(true);
        reconnectCountRef.current = 0;
        setAttempts(0);
        updateStatus("connected");
        onOpenRef.current?.();
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string);
          onMessageRef.current?.(data);
        } catch {
          onMessageRef.current?.(event.data);
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        onCloseRef.current?.();

        // Auto-reconnect
        if (reconnectCountRef.current < maxReconnectAttempts) {
          reconnectCountRef.current++;
          setAttempts(reconnectCountRef.current);
          updateStatus("reconnecting");
          setTimeout(connect, reconnectInterval);
        } else {
          updateStatus("disconnected");
        }
      };

      ws.onerror = (event) => {
        onErrorRef.current?.(event);
        setError("WebSocket 连接异常");
      };

      wsRef.current = ws;
    } catch {
      updateStatus("disconnected");
      setError("WebSocket 创建失败");
    }
  }, [url, reconnectInterval, maxReconnectAttempts, updateStatus, setError, setAttempts]);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect]);

  const send = useCallback((data: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  const reconnect = useCallback(() => {
    wsRef.current?.close();
    reconnectCountRef.current = 0;
    setAttempts(0);
    connect();
  }, [connect, setAttempts]);

  // 把 reconnect 注册到全局 store，供 ConnectionBanner 调用
  useEffect(() => {
    registerReconnect(reconnect);
    return () => registerReconnect(null);
  }, [reconnect, registerReconnect]);

  return { isConnected, send, reconnect };
}
