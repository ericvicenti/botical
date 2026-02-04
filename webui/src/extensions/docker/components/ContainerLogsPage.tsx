/**
 * Container Logs Page
 *
 * Shows real-time logs from a Docker container.
 */

import { useRef, useEffect, useState } from "react";
import { Terminal, Loader2, AlertCircle, RefreshCw, Download } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useDockerContainerLogs } from "../api";

interface ContainerLogsPageProps {
  params: {
    containerId: string;
    containerName?: string;
  };
}

export function ContainerLogsPage({ params }: ContainerLogsPageProps) {
  const { containerId, containerName } = params;
  const [tail, setTail] = useState(100);
  const [autoScroll, setAutoScroll] = useState(true);
  const logsContainerRef = useRef<HTMLPreElement>(null);

  const { data: logs, isLoading, error, refetch, isFetching } = useDockerContainerLogs(
    containerId,
    { tail, timestamps: true }
  );

  // Auto-scroll to bottom when logs update
  useEffect(() => {
    if (autoScroll && logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const handleDownload = () => {
    if (!logs) return;
    const blob = new Blob([logs], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${containerName || containerId}-logs.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Parse logs and clean up Docker stream headers
  const cleanLogs = logs
    ? logs
        .split("\n")
        .map((line) => {
          // Docker multiplexed stream has 8-byte header
          // First byte: stream type (1=stdout, 2=stderr)
          // Bytes 2-4: reserved
          // Bytes 5-8: size (big-endian)
          // We'll just strip non-printable characters for simplicity
          return line.replace(/[\x00-\x09\x0B\x0C\x0E-\x1F]/g, "");
        })
        .filter((line) => line.trim())
        .join("\n")
    : "";

  const selectClassName = cn(
    "px-2 py-1 text-sm rounded border border-border",
    "bg-bg-primary text-text-primary",
    "focus:outline-none focus:border-accent-primary transition-colors"
  );

  return (
    <div className="h-full flex flex-col bg-bg-primary">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-3">
          <Terminal className="w-5 h-5 text-accent-success" />
          <div>
            <h1 className="text-lg font-medium text-text-primary">Logs</h1>
            <div className="text-xs text-text-muted">{containerName || containerId}</div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3">
          {/* Tail selector */}
          <select
            value={tail}
            onChange={(e) => setTail(Number(e.target.value))}
            className={selectClassName}
          >
            <option value={50}>Last 50 lines</option>
            <option value={100}>Last 100 lines</option>
            <option value={500}>Last 500 lines</option>
            <option value={1000}>Last 1000 lines</option>
          </select>

          {/* Auto-scroll toggle */}
          <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="rounded border-border"
            />
            Auto-scroll
          </label>

          {/* Refresh */}
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded text-sm",
              "bg-bg-elevated hover:bg-bg-surface text-text-primary transition-colors"
            )}
          >
            <RefreshCw className={cn("w-3.5 h-3.5", isFetching && "animate-spin")} />
            Refresh
          </button>

          {/* Download */}
          <button
            onClick={handleDownload}
            disabled={!logs}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded text-sm",
              "bg-bg-elevated hover:bg-bg-surface text-text-primary transition-colors",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            <Download className="w-3.5 h-3.5" />
            Download
          </button>
        </div>
      </div>

      {/* Logs content */}
      <div className="flex-1 overflow-hidden">
        {isLoading && !logs ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-6 h-6 animate-spin text-text-muted" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full">
            <AlertCircle className="w-8 h-8 text-accent-error mb-2" />
            <div className="text-text-secondary">Failed to load logs</div>
            <div className="text-sm text-text-muted mt-1">{error.message}</div>
          </div>
        ) : (
          <pre
            ref={logsContainerRef}
            className="h-full overflow-auto p-4 text-xs font-mono leading-relaxed text-text-primary"
          >
            {cleanLogs || <span className="text-text-muted">No logs available</span>}
          </pre>
        )}
      </div>
    </div>
  );
}
