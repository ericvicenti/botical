import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { handleWebSocketEvent } from "./events";

type WSStatus = "connecting" | "connected" | "disconnected";

// Generate unique request IDs
let requestIdCounter = 0;
function generateRequestId(): string {
  return `req_${Date.now()}_${++requestIdCounter}`;
}

interface WebSocketContextValue {
  status: WSStatus;
  send: (message: object) => void;
  subscribe: (room: string) => void;
  unsubscribe: (room: string) => void;
}

const WebSocketContext = createContext<WebSocketContextValue | null>(null);

const RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 30000;

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<WSStatus>("disconnected");
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectDelayRef = useRef(RECONNECT_DELAY);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queryClient = useQueryClient();

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    setStatus("connecting");
    const socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      setStatus("connected");
      reconnectDelayRef.current = RECONNECT_DELAY;
    };

    socket.onclose = () => {
      setStatus("disconnected");
      wsRef.current = null;

      // Reconnect with exponential backoff
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, reconnectDelayRef.current);

      reconnectDelayRef.current = Math.min(
        reconnectDelayRef.current * 2,
        MAX_RECONNECT_DELAY
      );
    };

    socket.onerror = () => {
      socket.close();
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log(`[WebSocket] Received message:`, data.type, data);
        handleWebSocketEvent(data, queryClient);
      } catch (err) {
        console.error("[WebSocket] Failed to parse message:", err, event.data);
      }
    };

    wsRef.current = socket;
  }, [queryClient]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  const send = useCallback((message: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      // Auto-generate ID if not present
      const messageWithId = {
        id: generateRequestId(),
        ...message,
      };
      wsRef.current.send(JSON.stringify(messageWithId));
    }
  }, []);

  const subscribe = useCallback(
    (channel: string) => {
      send({
        type: "subscribe",
        payload: { channel },
      });
      console.log(`[WebSocket] Subscribing to channel: ${channel}`);
    },
    [send]
  );

  const unsubscribe = useCallback(
    (channel: string) => {
      send({
        type: "unsubscribe",
        payload: { channel },
      });
      console.log(`[WebSocket] Unsubscribing from channel: ${channel}`);
    },
    [send]
  );

  return (
    <WebSocketContext.Provider value={{ status, send, subscribe, unsubscribe }}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocket() {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error("useWebSocket must be used within WebSocketProvider");
  }
  return context;
}
