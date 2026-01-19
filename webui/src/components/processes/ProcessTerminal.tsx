import { useEffect, useRef } from "react";
import { Terminal, type ITheme } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import { useProcessOutput } from "@/hooks/useProcessOutput";
import { useUI } from "@/contexts/ui";
import { cn } from "@/lib/utils/cn";

const darkTheme: ITheme = {
  background: "#1a1a1a",
  foreground: "#e0e0e0",
  cursor: "#e0e0e0",
  cursorAccent: "#1a1a1a",
  selectionBackground: "#3a3a3a",
  black: "#1a1a1a",
  red: "#e06c75",
  green: "#98c379",
  yellow: "#e5c07b",
  blue: "#61afef",
  magenta: "#c678dd",
  cyan: "#56b6c2",
  white: "#abb2bf",
  brightBlack: "#545862",
  brightRed: "#e06c75",
  brightGreen: "#98c379",
  brightYellow: "#e5c07b",
  brightBlue: "#61afef",
  brightMagenta: "#c678dd",
  brightCyan: "#56b6c2",
  brightWhite: "#c8ccd4",
};

const lightTheme: ITheme = {
  background: "#eff1f5",
  foreground: "#4c4f69",
  cursor: "#4c4f69",
  cursorAccent: "#eff1f5",
  selectionBackground: "#ccd0da",
  black: "#5c5f77",
  red: "#d20f39",
  green: "#40a02b",
  yellow: "#df8e1d",
  blue: "#1e66f5",
  magenta: "#8839ef",
  cyan: "#179299",
  white: "#acb0be",
  brightBlack: "#6c6f85",
  brightRed: "#d20f39",
  brightGreen: "#40a02b",
  brightYellow: "#df8e1d",
  brightBlue: "#1e66f5",
  brightMagenta: "#8839ef",
  brightCyan: "#179299",
  brightWhite: "#bcc0cc",
};

interface ProcessTerminalProps {
  processId: string;
  projectId: string;
  className?: string;
}

export function ProcessTerminal({
  processId,
  projectId,
  className,
}: ProcessTerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const lastOutputLengthRef = useRef(0);

  const { resolvedTheme } = useUI();
  const { output, isRunning, write, resize } = useProcessOutput({
    processId,
    projectId,
  });

  const terminalTheme = resolvedTheme === "light" ? lightTheme : darkTheme;

  // Initialize xterm.js
  useEffect(() => {
    if (!terminalRef.current) return;

    const terminal = new Terminal({
      cursorBlink: isRunning,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      fontSize: 13,
      lineHeight: 1.2,
      theme: terminalTheme,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(webLinksAddon);
    terminal.open(terminalRef.current);

    // Fit to container
    try {
      fitAddon.fit();
    } catch {
      // Ignore fit errors during initial render
    }

    xtermRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // Handle user input
    terminal.onData((data) => {
      if (isRunning) {
        write(data);
      }
    });

    // Handle resize events
    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit();
        const dims = fitAddon.proposeDimensions();
        if (dims && dims.cols && dims.rows) {
          resize(dims.cols, dims.rows);
        }
      } catch {
        // Ignore resize errors
      }
    });

    resizeObserver.observe(terminalRef.current);

    return () => {
      resizeObserver.disconnect();
      terminal.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  }, [processId]); // Re-initialize when process changes

  // Update cursor blink based on running state
  useEffect(() => {
    if (xtermRef.current) {
      xtermRef.current.options.cursorBlink = isRunning;
    }
  }, [isRunning]);

  // Update terminal theme when it changes
  useEffect(() => {
    if (xtermRef.current) {
      xtermRef.current.options.theme = terminalTheme;
    }
  }, [terminalTheme]);

  // Write new output to terminal
  useEffect(() => {
    if (!xtermRef.current) return;

    // Only write new content
    const newContent = output.slice(lastOutputLengthRef.current);
    if (newContent) {
      xtermRef.current.write(newContent);
      lastOutputLengthRef.current = output.length;
    }
  }, [output]);

  // Reset output tracking when processId changes
  useEffect(() => {
    lastOutputLengthRef.current = 0;
    if (xtermRef.current) {
      xtermRef.current.clear();
    }
  }, [processId]);

  // Handle write and resize dependencies
  useEffect(() => {
    // This effect ensures the terminal has access to the latest write/resize functions
  }, [write, resize]);

  return (
    <div className={cn("relative h-full w-full", className)}>
      <div
        ref={terminalRef}
        className="h-full w-full"
        style={{ backgroundColor: terminalTheme.background }}
      />
    </div>
  );
}
