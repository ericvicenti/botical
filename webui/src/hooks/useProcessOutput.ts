import { useState, useEffect, useCallback, useRef } from "react";
import { useWebSocket } from "@/lib/websocket/context";
import { subscribeToProcessEvents, type WSEvent } from "@/lib/websocket/events";
import { useProcessOutput as useProcessOutputQuery, useProcess } from "@/lib/api/queries";

interface UseProcessOutputOptions {
  processId: string;
  projectId: string;
}

interface UseProcessOutputResult {
  output: string;
  isRunning: boolean;
  status: string | null;
  exitCode: number | null;
  write: (data: string) => void;
  resize: (cols: number, rows: number) => void;
  kill: () => void;
}

export function useProcessOutput({
  processId,
  projectId,
}: UseProcessOutputOptions): UseProcessOutputResult {
  const { subscribe, unsubscribe, send } = useWebSocket();
  const { data: initialOutput } = useProcessOutputQuery(processId);
  const { data: process } = useProcess(processId);

  // Accumulated output from streaming events
  const [streamedOutput, setStreamedOutput] = useState("");
  // Track if we've initialized from the query
  const initializedRef = useRef(false);

  // Subscribe to project room when connected
  useEffect(() => {
    if (projectId) {
      subscribe(`project:${projectId}`);
      return () => {
        unsubscribe(`project:${projectId}`);
      };
    }
  }, [projectId, subscribe, unsubscribe]);

  // Initialize output from query data
  useEffect(() => {
    if (initialOutput && !initializedRef.current) {
      const combined = initialOutput.map((chunk) => chunk.data).join("");
      setStreamedOutput(combined);
      initializedRef.current = true;
    }
  }, [initialOutput]);

  // Handle streaming events from WebSocket
  useEffect(() => {
    const handleProcessEvent = (event: WSEvent) => {
      // Only handle events for this process
      if (event.payload.id !== processId) return;

      switch (event.type) {
        case "process.output":
          setStreamedOutput((prev) => prev + (event.payload.data as string));
          break;
        case "process.exited":
        case "process.killed":
          // Process has ended - no action needed, query will update
          break;
      }
    };

    const unsubscribeEvents = subscribeToProcessEvents(handleProcessEvent);
    return unsubscribeEvents;
  }, [processId]);

  // Reset state when processId changes
  useEffect(() => {
    setStreamedOutput("");
    initializedRef.current = false;
  }, [processId]);

  const write = useCallback(
    (data: string) => {
      send({
        type: "process.write",
        payload: { id: processId, data },
      });
    },
    [send, processId]
  );

  const resize = useCallback(
    (cols: number, rows: number) => {
      send({
        type: "process.resize",
        payload: { id: processId, cols, rows },
      });
    },
    [send, processId]
  );

  const kill = useCallback(() => {
    send({
      type: "process.kill",
      payload: { id: processId },
    });
  }, [send, processId]);

  const isRunning = process?.status === "running" || process?.status === "starting";

  return {
    output: streamedOutput,
    isRunning,
    status: process?.status ?? null,
    exitCode: process?.exitCode ?? null,
    write,
    resize,
    kill,
  };
}
