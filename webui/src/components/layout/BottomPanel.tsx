import { useUI } from "@/contexts/ui";
import { cn } from "@/lib/utils/cn";
import { Terminal, AlertCircle, Radio, ChevronDown, ChevronUp } from "lucide-react";
import { useState, useCallback } from "react";

const TABS = [
  { id: "output", icon: Terminal, label: "Output" },
  { id: "problems", icon: AlertCircle, label: "Problems" },
  { id: "services", icon: Radio, label: "Services" },
] as const;

export function BottomPanel() {
  const {
    bottomPanelVisible,
    bottomPanelTab,
    setBottomPanelTab,
    toggleBottomPanel,
  } = useUI();
  const [height, setHeight] = useState(200);

  const handleResize = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startY = e.clientY;
      const startHeight = height;

      const handleMouseMove = (e: MouseEvent) => {
        const delta = startY - e.clientY;
        setHeight(Math.max(100, Math.min(500, startHeight + delta)));
      };

      const handleMouseUp = () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [height]
  );

  if (!bottomPanelVisible) {
    return (
      <div className="h-8 bg-bg-secondary border-t border-border flex items-center justify-between px-2">
        <div className="flex gap-2">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setBottomPanelTab(tab.id);
                toggleBottomPanel();
              }}
              className="text-xs text-text-secondary hover:text-text-primary flex items-center gap-1"
            >
              <tab.icon className="w-3 h-3" />
              {tab.label}
            </button>
          ))}
        </div>
        <button
          onClick={toggleBottomPanel}
          className="text-text-secondary hover:text-text-primary"
        >
          <ChevronUp className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div
      className="bg-bg-secondary border-t border-border flex flex-col"
      style={{ height }}
    >
      <div
        className="h-1 cursor-ns-resize hover:bg-accent-primary transition-colors"
        onMouseDown={handleResize}
      />

      <div className="h-8 border-b border-border flex items-center justify-between px-2 shrink-0">
        <div className="flex gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setBottomPanelTab(tab.id)}
              className={cn(
                "px-2 py-1 text-xs rounded flex items-center gap-1",
                bottomPanelTab === tab.id
                  ? "bg-bg-elevated text-text-primary"
                  : "text-text-secondary hover:text-text-primary"
              )}
            >
              <tab.icon className="w-3 h-3" />
              {tab.label}
            </button>
          ))}
        </div>
        <button
          onClick={toggleBottomPanel}
          className="text-text-secondary hover:text-text-primary"
        >
          <ChevronDown className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        <BottomPanelContent tab={bottomPanelTab} />
      </div>
    </div>
  );
}

function BottomPanelContent({ tab }: { tab: string }) {
  switch (tab) {
    case "output":
      return <OutputPanel />;
    case "problems":
      return <ProblemsPanel />;
    case "services":
      return <ServicesPanel />;
    default:
      return null;
  }
}

function OutputPanel() {
  return (
    <div className="p-2 font-mono text-sm text-text-secondary">
      Output will appear here...
    </div>
  );
}

function ProblemsPanel() {
  return (
    <div className="p-2 text-sm text-text-secondary">No problems detected</div>
  );
}

function ServicesPanel() {
  return (
    <div className="p-2 text-sm text-text-secondary">No services running</div>
  );
}
