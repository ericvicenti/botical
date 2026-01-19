/**
 * App Host
 *
 * Hosts an Iris App, managing the WebSocket connection for real-time
 * UI updates and action handling.
 */

import React, { useEffect, useState, useCallback, useRef } from "react";
import { SDRRenderer } from "./SDRRenderer";

// Types
interface ComponentNode {
  $: "component";
  type: string;
  props: Record<string, unknown>;
  children?: unknown[];
  key?: string;
}

interface UISyncPayload {
  tree: ComponentNode | null;
  state: Record<string, unknown>;
}

interface AppErrorPayload {
  category: string;
  message: string;
  stack?: string;
  file?: string;
  line?: number;
  column?: number;
  recoverable: boolean;
}

interface SDRMessage {
  id: string;
  type: string;
  payload: unknown;
  timestamp: number;
}

interface AppHostProps {
  /** App ID */
  appId: string;
  /** Project ID */
  projectId: string;
  /** WebSocket URL for the app */
  wsUrl?: string;
}

type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

/**
 * App Host Component
 *
 * Manages connection to an Iris App and renders its UI.
 */
export function AppHost({ appId, projectId, wsUrl }: AppHostProps) {
  const [tree, setTree] = useState<ComponentNode | null>(null);
  const [state, setState] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<AppErrorPayload | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [lastValidTree, setLastValidTree] = useState<ComponentNode | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);

  // Connect to the app's WebSocket
  useEffect(() => {
    const url = wsUrl || `/api/apps/${projectId}/${appId}/ws`;

    function connect() {
      setStatus("connecting");

      // TODO: Use actual WebSocket URL
      // For now, we'll simulate the connection
      console.log(`[AppHost] Connecting to ${url}`);

      // Simulate connection for development
      // In production, this would be:
      // const ws = new WebSocket(url);

      // Mock successful connection
      setTimeout(() => {
        setStatus("connected");
        reconnectAttempts.current = 0;

        // TODO: Remove mock data - this simulates receiving initial UI
        // In production, this comes from the WebSocket
      }, 500);
    }

    connect();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [appId, projectId, wsUrl]);

  // Handle incoming messages
  const handleMessage = useCallback((message: SDRMessage) => {
    switch (message.type) {
      case "ui:sync": {
        const payload = message.payload as UISyncPayload;
        setTree(payload.tree);
        setState(payload.state);
        setError(null);

        // Store last valid tree for error recovery
        if (payload.tree) {
          setLastValidTree(payload.tree);
        }
        break;
      }

      case "app:error": {
        const payload = message.payload as AppErrorPayload;
        setError(payload);
        // Keep showing last valid UI with error overlay
        break;
      }

      case "app:reload": {
        // App was hot-reloaded, UI sync will follow
        console.log("[AppHost] App reloaded");
        break;
      }

      case "state:update": {
        // Partial state update
        const { key, value } = message.payload as { key: string; value: unknown };
        setState((prev) => ({ ...prev, [key]: value }));
        break;
      }

      default:
        console.warn("[AppHost] Unknown message type:", message.type);
    }
  }, []);

  // Send action to the server
  const handleAction = useCallback(
    (action: string, args?: unknown) => {
      console.log("[AppHost] Action:", action, args);

      // TODO: Send via WebSocket
      // wsRef.current?.send(JSON.stringify({
      //   type: "action:call",
      //   payload: { action, args },
      //   id: generateId(),
      //   timestamp: Date.now(),
      // }));

      // For now, simulate action handling
      // This would normally go to the server and come back via ui:sync
    },
    []
  );

  // Render loading state
  if (status === "connecting") {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>
          <div style={styles.spinner} />
          <p>Connecting to app...</p>
        </div>
      </div>
    );
  }

  // Render error state (connection error)
  if (status === "error") {
    return (
      <div style={styles.container}>
        <div style={styles.errorContainer}>
          <h3>Connection Error</h3>
          <p>Failed to connect to the app. Retrying...</p>
        </div>
      </div>
    );
  }

  // Render app UI
  const displayTree = tree || lastValidTree;

  return (
    <div style={styles.container}>
      {/* Error overlay */}
      {error && (
        <div style={styles.errorOverlay}>
          <div style={styles.errorContent}>
            <div style={styles.errorHeader}>
              <span style={styles.errorBadge}>{error.category}</span>
              <h3 style={styles.errorTitle}>Error in app</h3>
            </div>
            <p style={styles.errorMessage}>{error.message}</p>
            {error.file && (
              <p style={styles.errorLocation}>
                {error.file}
                {error.line && `:${error.line}`}
                {error.column && `:${error.column}`}
              </p>
            )}
            {error.stack && (
              <pre style={styles.errorStack}>{error.stack}</pre>
            )}
            <button
              style={styles.errorButton}
              onClick={() => {
                // TODO: Open file in editor
                console.log("Open in editor:", error.file);
              }}
            >
              Open in Editor
            </button>
          </div>
        </div>
      )}

      {/* App content */}
      {displayTree ? (
        <SDRRenderer tree={displayTree} onAction={handleAction} state={state} />
      ) : (
        <div style={styles.empty}>
          <p>App loaded but no UI returned</p>
          <p style={{ fontSize: 12, color: "#888" }}>
            Make sure your app's ui() function returns a component tree
          </p>
        </div>
      )}
    </div>
  );
}

// Styles
const styles: Record<string, React.CSSProperties> = {
  container: {
    position: "relative",
    width: "100%",
    height: "100%",
    overflow: "auto",
  },

  loading: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    gap: 16,
    color: "#666",
  },

  spinner: {
    width: 32,
    height: 32,
    border: "3px solid #e5e5e5",
    borderTopColor: "#0066cc",
    borderRadius: "50%",
    animation: "spin 1s linear infinite",
  },

  empty: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    color: "#888",
    textAlign: "center",
    padding: 24,
  },

  errorContainer: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    color: "#dc3545",
    textAlign: "center",
    padding: 24,
  },

  errorOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(220, 53, 69, 0.95)",
    color: "white",
    padding: 16,
    zIndex: 1000,
    boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
  },

  errorContent: {
    maxWidth: 600,
    margin: "0 auto",
  },

  errorHeader: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },

  errorBadge: {
    backgroundColor: "rgba(255,255,255,0.2)",
    padding: "2px 8px",
    borderRadius: 4,
    fontSize: 12,
    textTransform: "uppercase",
  },

  errorTitle: {
    margin: 0,
    fontSize: 18,
  },

  errorMessage: {
    fontSize: 14,
    margin: "0 0 8px 0",
    fontWeight: 500,
  },

  errorLocation: {
    fontSize: 12,
    margin: "0 0 12px 0",
    fontFamily: "monospace",
    opacity: 0.9,
  },

  errorStack: {
    fontSize: 11,
    fontFamily: "monospace",
    backgroundColor: "rgba(0,0,0,0.2)",
    padding: 12,
    borderRadius: 4,
    overflow: "auto",
    maxHeight: 150,
    whiteSpace: "pre-wrap",
    margin: "0 0 12px 0",
  },

  errorButton: {
    backgroundColor: "white",
    color: "#dc3545",
    border: "none",
    padding: "8px 16px",
    borderRadius: 4,
    fontWeight: 500,
    cursor: "pointer",
  },
};

// Add keyframe animation via a style tag
if (typeof document !== "undefined") {
  const styleSheet = document.createElement("style");
  styleSheet.textContent = `
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(styleSheet);
}

export default AppHost;
