/**
 * Container Logs Page
 *
 * Shows real-time logs from a Docker container.
 */

import { useRef, useEffect, useState } from "react";
import { Terminal, Loader2, AlertCircle, RefreshCw, Download } from "lucide-react";
import { cn } from "@/lib/utils";
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

  return (
    <div className="h-full flex flex-col bg-zinc-950">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <Terminal className="w-5 h-5 text-green-400" />
          <div>
            <h1 className="text-lg font-medium">Logs</h1>
            <div className="text-xs text-zinc-500">{containerName || containerId}</div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3">
          {/* Tail selector */}
          <select
            value={tail}
            onChange={(e) => setTail(Number(e.target.value))}
            className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm"
          >
            <option value={50}>Last 50 lines</option>
            <option value={100}>Last 100 lines</option>
            <option value={500}>Last 500 lines</option>
            <option value={1000}>Last 1000 lines</option>
          </select>

          {/* Auto-scroll toggle */}
          <label className="flex items-center gap-2 text-sm text-zinc-400">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="rounded"
            />
            Auto-scroll
          </label>

          {/* Refresh */}
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-2 px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-sm"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", isFetching && "animate-spin")} />
            Refresh
          </button>

          {/* Download */}
          <button
            onClick={handleDownload}
            disabled={!logs}
            className="flex items-center gap-2 px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-sm disabled:opacity-50"
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
            <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full">
            <AlertCircle className="w-8 h-8 text-red-500 mb-2" />
            <div className="text-zinc-400">Failed to load logs</div>
            <div className="text-sm text-zinc-500 mt-1">{error.message}</div>
          </div>
        ) : (
          <pre
            ref={logsContainerRef}
            className="h-full overflow-auto p-4 text-xs font-mono leading-relaxed"
          >
            {cleanLogs || <span className="text-zinc-500">No logs available</span>}
          </pre>
        )}
      </div>
    </div>
  );
}
