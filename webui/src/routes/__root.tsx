import { createRootRoute, Link, Outlet } from "@tanstack/react-router";
import { useWebSocket } from "@/lib/websocket/context";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { TabBar } from "@/components/layout/TabBar";
import { Sidebar } from "@/components/layout/Sidebar";
import { BottomPanel } from "@/components/layout/BottomPanel";
import { cn } from "@/lib/utils/cn";

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  const { status } = useWebSocket();
  useKeyboardShortcuts();

  return (
    <div className="h-screen flex flex-col bg-bg-primary">
      {/* Header */}
      <header className="h-10 flex items-center justify-between px-4 bg-bg-secondary border-b border-border shrink-0">
        <div className="flex items-center gap-4">
          <Link to="/" className="text-lg font-semibold text-text-primary">
            Iris
          </Link>
        </div>
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex items-center gap-2 text-xs",
              status === "connected"
                ? "text-accent-success"
                : status === "connecting"
                  ? "text-accent-warning"
                  : "text-accent-error"
            )}
          >
            <div
              className={cn(
                "w-2 h-2 rounded-full",
                status === "connected"
                  ? "bg-accent-success"
                  : status === "connecting"
                    ? "bg-accent-warning"
                    : "bg-accent-error"
              )}
            />
            {status}
          </div>
        </div>
      </header>

      {/* Tab Bar */}
      <TabBar />

      {/* Main area with sidebar */}
      <div className="flex-1 flex overflow-hidden">
        <Sidebar />

        <main className="flex-1 overflow-auto scrollbar-thin">
          <Outlet />
        </main>
      </div>

      {/* Bottom Panel */}
      <BottomPanel />
    </div>
  );
}
