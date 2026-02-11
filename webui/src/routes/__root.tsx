import { createRootRoute, Outlet } from "@tanstack/react-router";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useAgentActions } from "@/hooks/useAgentActions";
import { useWorkflowNotifications } from "@/hooks/useWorkflowNotifications";
import { useAutoDocumentTitle } from "@/hooks/useDocumentTitle";
import { TabBar } from "@/components/layout/TabBar";
import { Sidebar } from "@/components/layout/Sidebar";
import { BottomPanel } from "@/components/layout/BottomPanel";
import { CommandProvider } from "@/commands/context";
import { CommandPalette } from "@/components/command-palette/CommandPalette";
import { FilePaletteProvider } from "@/contexts/file-palette";
import { FilePalette } from "@/components/file-palette/FilePalette";
import { BackendActionsLoader } from "@/commands/BackendActionsLoader";
import { ToastProvider } from "@/components/ui/Toast";
import { ResultDialogProvider } from "@/components/ui/ResultDialog";
import { RunningCommandProvider } from "@/components/ui/RunningCommandDialog";
import { registerAllCommands } from "@/commands/definitions";
import { useUI } from "@/contexts/ui";
import { useCommands } from "@/commands/context";
import { NewTaskModal } from "@/components/tasks/NewTaskModal";
import { Command } from "lucide-react";

// Register commands on app load
registerAllCommands();

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayoutInner() {
  useKeyboardShortcuts();
  useAgentActions();
  useWorkflowNotifications();
  useAutoDocumentTitle();

  const { showNewTaskModal, closeNewTaskModal, selectedProjectId } = useUI();
  const { sidebarCollapsed, toggleSidebar } = useUI();
  const { openPalette } = useCommands();

  return (
    <div className="h-screen flex flex-col bg-bg-primary">
      {/* Mobile sidebar overlay */}
      {!sidebarCollapsed && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={toggleSidebar}
        />
      )}

      {/* Main area with sidebar */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar: on mobile, position fixed overlay; on desktop, normal flow */}
        <div className={`
          md:relative md:z-auto
          fixed inset-y-0 left-0 z-50
          transition-transform duration-200 ease-out
          ${sidebarCollapsed ? '-translate-x-full md:translate-x-0' : 'translate-x-0'}
        `}>
          <Sidebar />
        </div>

        {/* Content area with tabs on top */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <TabBar />
          <main className="flex-1 overflow-auto scrollbar-thin">
            <Outlet />
          </main>
        </div>
      </div>

      {/* Bottom Panel */}
      <BottomPanel />

      {/* Mobile FAB for Command Palette */}
      <button
        onClick={openPalette}
        className="sm:hidden fixed bottom-4 left-4 z-30 w-12 h-12 rounded-full bg-accent-primary text-white shadow-lg flex items-center justify-center active:bg-accent-primary/80"
        title="Command Palette"
      >
        <Command className="w-5 h-5" />
      </button>

      {/* Command Palette */}
      <CommandPalette />

      {/* File Palette */}
      <FilePalette />

      {/* New Task Modal */}
      {showNewTaskModal && selectedProjectId && (
        <NewTaskModal
          projectId={selectedProjectId}
          onClose={closeNewTaskModal}
        />
      )}
    </div>
  );
}

function RootLayout() {
  return (
    <ToastProvider>
      <ResultDialogProvider>
        <RunningCommandProvider>
          <FilePaletteProvider>
            <CommandProvider>
              <BackendActionsLoader />
              <RootLayoutInner />
            </CommandProvider>
          </FilePaletteProvider>
        </RunningCommandProvider>
      </ResultDialogProvider>
    </ToastProvider>
  );
}
