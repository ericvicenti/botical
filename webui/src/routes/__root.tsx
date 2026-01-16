import { createRootRoute, Link, Outlet } from "@tanstack/react-router";
import { useWebSocket } from "@/lib/websocket/context";
import { cn } from "@/lib/utils/cn";

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  const { status } = useWebSocket();

  return (
    <div className="h-screen flex flex-col bg-bg-primary">
      {/* Header */}
      <header className="h-12 flex items-center justify-between px-4 bg-bg-secondary border-b border-border">
        <div className="flex items-center gap-4">
          <Link to="/" className="text-lg font-semibold text-text-primary">
            Iris
          </Link>
          <nav className="flex items-center gap-2">
            <Link
              to="/"
              className="px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary hover:bg-bg-elevated rounded transition-colors"
              activeProps={{ className: "text-text-primary bg-bg-elevated" }}
            >
              Projects
            </Link>
          </nav>
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

      {/* Main content */}
      <main className="flex-1 overflow-auto scrollbar-thin">
        <Outlet />
      </main>
    </div>
  );
}
