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
import { NewTaskModal } from "@/components/tasks/NewTaskModal";

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
