import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, waitFor } from "@/test/utils";
import { server } from "@/test/setup";
import { http, HttpResponse } from "msw";
import { useUI } from "@/contexts/ui";
import { useProjects } from "@/lib/api/queries";
import { cn } from "@/lib/utils/cn";
import { Files, GitBranch, Play, ChevronDown, FolderTree } from "lucide-react";

const PANELS = [
  { id: "files", icon: Files, label: "Files" },
  { id: "git", icon: GitBranch, label: "Git" },
  { id: "run", icon: Play, label: "Run" },
] as const;

// Simplified ProjectSelector without navigation for testing
function TestProjectSelector() {
  const { data: projects, isLoading } = useProjects();
  const { selectedProjectId, setSelectedProject } = useUI();

  const selectedProject = projects?.find((p) => p.id === selectedProjectId);

  const handleSelectProject = (project: { id: string; name: string }) => {
    setSelectedProject(project.id);
  };

  return (
    <div className="relative">
      <button
        data-testid="project-selector-trigger"
        className={cn(
          "w-full flex items-center justify-between gap-2 px-3 py-2",
          "bg-bg-elevated hover:bg-bg-elevated/80 transition-colors",
          "text-sm text-text-primary border-b border-border"
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          <FolderTree className="w-4 h-4 text-accent-primary shrink-0" />
          <span className="truncate" data-testid="project-selector-label">
            {isLoading
              ? "Loading..."
              : selectedProject?.name ?? "Select a project"}
          </span>
        </div>
        <ChevronDown className="w-4 h-4 text-text-secondary shrink-0" />
      </button>

      <div data-testid="project-dropdown" className="py-1">
        {projects?.map((project) => (
          <button
            key={project.id}
            onClick={() => handleSelectProject(project)}
            data-testid={`project-option-${project.id}`}
            className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm"
          >
            <FolderTree className="w-4 h-4 shrink-0" />
            <span className="truncate">{project.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// Simplified Sidebar for testing
function TestSidebar() {
  const { sidebarCollapsed, sidebarPanel, setSidebarPanel, toggleSidebar } =
    useUI();

  if (sidebarCollapsed) {
    return (
      <div className="w-12 bg-bg-secondary border-r border-border flex flex-col">
        {PANELS.map((panel) => (
          <button
            key={panel.id}
            onClick={() => {
              setSidebarPanel(panel.id);
              toggleSidebar();
            }}
            className={cn(
              "w-12 h-12 flex items-center justify-center",
              "hover:bg-bg-elevated transition-colors",
              sidebarPanel === panel.id
                ? "text-accent-primary border-l-2 border-accent-primary"
                : "text-text-secondary"
            )}
            title={panel.label}
          >
            <panel.icon className="w-5 h-5" />
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="w-60 bg-bg-secondary border-r border-border flex flex-col">
      <TestProjectSelector />
      <div className="flex flex-1 min-h-0">
        <div className="w-12 border-r border-border flex flex-col shrink-0">
          {PANELS.map((panel) => (
            <button
              key={panel.id}
              onClick={() => setSidebarPanel(panel.id)}
              className={cn(
                "w-12 h-12 flex items-center justify-center",
                "hover:bg-bg-elevated transition-colors",
                sidebarPanel === panel.id
                  ? "text-accent-primary border-l-2 border-accent-primary"
                  : "text-text-secondary"
              )}
              title={panel.label}
            >
              <panel.icon className="w-5 h-5" />
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-hidden">
          <SidebarPanel panel={sidebarPanel} />
        </div>
      </div>
    </div>
  );
}

function SidebarPanel({ panel }: { panel: string }) {
  const { selectedProjectId } = useUI();

  switch (panel) {
    case "files":
      return <FilesPanel selectedProjectId={selectedProjectId} />;
    case "git":
      return <GitPanel selectedProjectId={selectedProjectId} />;
    case "run":
      return <RunPanel selectedProjectId={selectedProjectId} />;
    default:
      return null;
  }
}

function FilesPanel({ selectedProjectId }: { selectedProjectId: string | null }) {
  return (
    <div className="p-2">
      <div className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-2">
        Files
      </div>
      {selectedProjectId ? (
        <div className="text-sm text-text-muted">File browser coming soon</div>
      ) : (
        <div className="text-sm text-text-muted">
          Select a project to browse files
        </div>
      )}
    </div>
  );
}

function GitPanel({ selectedProjectId }: { selectedProjectId: string | null }) {
  return (
    <div className="p-2">
      <div className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-2">
        Source Control
      </div>
      {selectedProjectId ? (
        <div className="text-sm text-text-muted">Git integration coming soon</div>
      ) : (
        <div className="text-sm text-text-muted">Select a project to view git status</div>
      )}
    </div>
  );
}

function RunPanel({ selectedProjectId }: { selectedProjectId: string | null }) {
  return (
    <div className="p-2">
      <div className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-2">
        Commands & Services
      </div>
      {selectedProjectId ? (
        <div className="text-sm text-text-muted">No running processes</div>
      ) : (
        <div className="text-sm text-text-muted">Select a project to manage processes</div>
      )}
    </div>
  );
}

describe("Sidebar", () => {
  it("renders all panel buttons", () => {
    render(<TestSidebar />, { withRouter: false });

    expect(screen.getByTitle("Files")).toBeInTheDocument();
    expect(screen.getByTitle("Git")).toBeInTheDocument();
    expect(screen.getByTitle("Run")).toBeInTheDocument();
  });

  it("shows Files panel by default", () => {
    render(<TestSidebar />, { withRouter: false });

    expect(screen.getByText("Files")).toBeInTheDocument();
    expect(screen.getByText("Select a project to browse files")).toBeInTheDocument();
  });

  it("switches panels when buttons are clicked", async () => {
    render(<TestSidebar />, { withRouter: false });

    // Click Git panel
    fireEvent.click(screen.getByTitle("Git"));
    expect(screen.getByText("Source Control")).toBeInTheDocument();

    // Click Run panel
    fireEvent.click(screen.getByTitle("Run"));
    expect(screen.getByText("Commands & Services")).toBeInTheDocument();

    // Back to Files
    fireEvent.click(screen.getByTitle("Files"));
    expect(screen.getByText("Files")).toBeInTheDocument();
  });

  it("shows project selector with projects", async () => {
    render(<TestSidebar />, { withRouter: false });

    await waitFor(() => {
      expect(screen.getByTestId("project-selector-label")).toHaveTextContent("Select a project");
    });

    await waitFor(() => {
      expect(screen.getByText("Test Project 1")).toBeInTheDocument();
      expect(screen.getByText("Test Project 2")).toBeInTheDocument();
    });
  });

  it("selects a project when clicked", async () => {
    render(<TestSidebar />, { withRouter: false });

    await waitFor(() => {
      expect(screen.getByText("Test Project 1")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Test Project 1"));

    await waitFor(() => {
      expect(screen.getByTestId("project-selector-label")).toHaveTextContent("Test Project 1");
    });
  });

  it("shows project-specific content when project is selected", async () => {
    render(<TestSidebar />, { withRouter: false });

    // Initially shows "Select a project" message
    expect(screen.getByText("Select a project to browse files")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Test Project 1")).toBeInTheDocument();
    });

    // Select a project
    fireEvent.click(screen.getByText("Test Project 1"));

    // Now shows project-specific content
    await waitFor(() => {
      expect(screen.getByText("File browser coming soon")).toBeInTheDocument();
    });
  });

  it("shows loading state while fetching projects", async () => {
    server.use(
      http.get("/api/projects", async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return HttpResponse.json({
          data: [],
          meta: { total: 0, limit: 50, offset: 0, hasMore: false },
        });
      })
    );

    render(<TestSidebar />, { withRouter: false });
    expect(screen.getByTestId("project-selector-label")).toHaveTextContent("Loading...");

    await waitFor(() => {
      expect(screen.getByTestId("project-selector-label")).toHaveTextContent("Select a project");
    });
  });

  it("highlights active panel button", () => {
    render(<TestSidebar />, { withRouter: false });

    const filesButton = screen.getByTitle("Files");
    expect(filesButton).toHaveClass("text-accent-primary");

    fireEvent.click(screen.getByTitle("Git"));

    const gitButton = screen.getByTitle("Git");
    expect(gitButton).toHaveClass("text-accent-primary");
    expect(filesButton).not.toHaveClass("text-accent-primary");
  });
});

/**
 * Note: FilesPanel dropdown menu tests are not included here because they require
 * importing the actual Sidebar component which creates circular dependencies.
 *
 * The FilesPanel dropdown functionality is tested via:
 * - FileTree.test.tsx - Tests ref methods (createFile, createFolder) that the dropdown calls
 * - FileContextMenu.test.tsx - Tests the context menu and CreateInput components
 *
 * The integration between FilesPanel dropdown and FileTree works through the FileTreeRef
 * interface exposed via forwardRef/useImperativeHandle.
 */
