import { useWebSocket } from "@/lib/websocket/context";
import { cn } from "@/lib/utils/cn";

export function BottomPanel() {
  const { status } = useWebSocket();

  return (
    <div className="h-6 bg-bg-secondary border-t border-border flex items-center justify-end px-3">
      <ConnectionStatus status={status} />
    </div>
  );
}

function ConnectionStatus({ status }: { status: "connected" | "connecting" | "disconnected" }) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 text-xs",
        status === "connected"
          ? "text-accent-success"
          : status === "connecting"
            ? "text-accent-warning"
            : "text-accent-error"
      )}
    >
      <div
        className={cn(
          "w-1.5 h-1.5 rounded-full",
          status === "connected"
            ? "bg-accent-success"
            : status === "connecting"
              ? "bg-accent-warning"
              : "bg-accent-error"
        )}
      />
      {status}
    </div>
  );
}
