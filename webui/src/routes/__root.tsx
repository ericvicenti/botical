import { createRootRoute, Outlet } from "@tanstack/react-router";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useAgentActions } from "@/hooks/useAgentActions";
import { TabBar } from "@/components/layout/TabBar";
import { Sidebar } from "@/components/layout/Sidebar";
import { BottomPanel } from "@/components/layout/BottomPanel";
import { CommandProvider } from "@/commands/context";
import { CommandPalette } from "@/components/command-palette/CommandPalette";
import { BackendActionsLoader } from "@/commands/BackendActionsLoader";
import { ToastProvider } from "@/components/ui/Toast";
import { ResultDialogProvider } from "@/components/ui/ResultDialog";
import { registerAllCommands } from "@/commands/definitions";

// Register commands on app load
registerAllCommands();

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayoutInner() {
  useKeyboardShortcuts();
  useAgentActions();

  return (
    <div className="h-screen flex flex-col bg-bg-primary">
      {/* Main area with sidebar */}
      <div className="flex-1 flex overflow-hidden">
        <Sidebar />

        {/* Content area with tabs on top */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <TabBar />
          <main className="flex-1 overflow-auto scrollbar-thin">
            <Outlet />
          </main>
        </div>
      </div>

      {/* Bottom Panel */}
      <BottomPanel />

      {/* Command Palette */}
      <CommandPalette />
    </div>
  );
}

function RootLayout() {
  return (
    <ToastProvider>
      <ResultDialogProvider>
        <CommandProvider>
          <BackendActionsLoader />
          <RootLayoutInner />
        </CommandProvider>
      </ResultDialogProvider>
    </ToastProvider>
  );
}
