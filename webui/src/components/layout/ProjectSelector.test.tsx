import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, waitFor } from "@/test/utils";
import { server } from "@/test/setup";
import { http, HttpResponse } from "msw";
import { useState, useRef, useEffect } from "react";
import { ChevronDown, FolderTree } from "lucide-react";
import { useProjects } from "@/lib/api/queries";
import { useUI } from "@/contexts/ui";
import { cn } from "@/lib/utils/cn";

// Test version without navigation
function TestProjectSelector() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { data: projects, isLoading } = useProjects();
  const { selectedProjectId, setSelectedProject } = useUI();

  const selectedProject = projects?.find((p) => p.id === selectedProjectId);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelectProject = (project: { id: string; name: string }) => {
    setSelectedProject(project.id);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
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
        <ChevronDown
          className={cn(
            "w-4 h-4 text-text-secondary shrink-0 transition-transform",
            isOpen && "rotate-180"
          )}
        />
      </button>

      {isOpen && (
        <div
          data-testid="project-dropdown"
          className="absolute top-full left-0 right-0 z-50 bg-bg-elevated border border-border rounded-b-lg shadow-lg max-h-64 overflow-auto"
        >
          {isLoading ? (
            <div className="px-3 py-2 text-sm text-text-muted">Loading...</div>
          ) : !projects?.length ? (
            <div className="px-3 py-2 text-sm text-text-muted">
              No projects available
            </div>
          ) : (
            <div className="py-1">
              {projects.map((project) => (
                <button
                  key={project.id}
                  onClick={() => handleSelectProject(project)}
                  data-testid={`project-option-${project.id}`}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 text-left",
                    "hover:bg-bg-secondary transition-colors",
                    "text-sm",
                    project.id === selectedProjectId
                      ? "text-accent-primary bg-bg-secondary"
                      : "text-text-primary"
                  )}
                >
                  <FolderTree className="w-4 h-4 shrink-0" />
                  <span className="truncate">{project.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

describe("ProjectSelector", () => {
  it("renders with 'Select a project' when no project is selected", async () => {
    render(<TestProjectSelector />, { withRouter: false });

    await waitFor(() => {
      expect(screen.getByTestId("project-selector-label")).toHaveTextContent(
        "Select a project"
      );
    });
  });

  it("shows loading state initially", () => {
    server.use(
      http.get("/api/projects", async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return HttpResponse.json({
          data: [],
          meta: { total: 0, limit: 50, offset: 0, hasMore: false },
        });
      })
    );

    render(<TestProjectSelector />, { withRouter: false });
    expect(screen.getByTestId("project-selector-label")).toHaveTextContent(
      "Loading..."
    );
  });

  it("opens dropdown when clicked", async () => {
    render(<TestProjectSelector />, { withRouter: false });

    await waitFor(() => {
      expect(screen.getByTestId("project-selector-label")).toHaveTextContent(
        "Select a project"
      );
    });

    // Dropdown should not be visible initially
    expect(screen.queryByTestId("project-dropdown")).not.toBeInTheDocument();

    // Click to open
    fireEvent.click(screen.getByTestId("project-selector-trigger"));

    // Dropdown should now be visible
    expect(screen.getByTestId("project-dropdown")).toBeInTheDocument();
  });

  it("shows project list in dropdown", async () => {
    render(<TestProjectSelector />, { withRouter: false });

    // Wait for projects to load
    await waitFor(() => {
      expect(screen.getByTestId("project-selector-label")).toHaveTextContent(
        "Select a project"
      );
    });

    // Open dropdown
    fireEvent.click(screen.getByTestId("project-selector-trigger"));

    // Should show projects
    await waitFor(() => {
      expect(screen.getByText("Test Project 1")).toBeInTheDocument();
      expect(screen.getByText("Test Project 2")).toBeInTheDocument();
    });
  });

  it("selects a project and updates label", async () => {
    render(<TestProjectSelector />, { withRouter: false });

    // Wait for projects to load
    await waitFor(() => {
      expect(screen.getByTestId("project-selector-label")).toHaveTextContent(
        "Select a project"
      );
    });

    // Open dropdown
    fireEvent.click(screen.getByTestId("project-selector-trigger"));

    // Wait for projects
    await waitFor(() => {
      expect(screen.getByText("Test Project 1")).toBeInTheDocument();
    });

    // Click a project
    fireEvent.click(screen.getByText("Test Project 1"));

    // Label should update
    await waitFor(() => {
      expect(screen.getByTestId("project-selector-label")).toHaveTextContent(
        "Test Project 1"
      );
    });

    // Dropdown should close
    expect(screen.queryByTestId("project-dropdown")).not.toBeInTheDocument();
  });

  it("shows 'No projects available' when there are no projects", async () => {
    server.use(
      http.get("/api/projects", () => {
        return HttpResponse.json({
          data: [],
          meta: { total: 0, limit: 50, offset: 0, hasMore: false },
        });
      })
    );

    render(<TestProjectSelector />, { withRouter: false });

    // Wait for load
    await waitFor(() => {
      expect(screen.getByTestId("project-selector-label")).toHaveTextContent(
        "Select a project"
      );
    });

    // Open dropdown
    fireEvent.click(screen.getByTestId("project-selector-trigger"));

    // Should show empty message
    expect(screen.getByText("No projects available")).toBeInTheDocument();
  });

  it("highlights selected project in dropdown", async () => {
    render(<TestProjectSelector />, { withRouter: false });

    // Wait for load
    await waitFor(() => {
      expect(screen.getByTestId("project-selector-label")).toHaveTextContent(
        "Select a project"
      );
    });

    // Open dropdown and select a project
    fireEvent.click(screen.getByTestId("project-selector-trigger"));

    await waitFor(() => {
      expect(screen.getByText("Test Project 1")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Test Project 1"));

    // Re-open dropdown
    fireEvent.click(screen.getByTestId("project-selector-trigger"));

    // Selected project should have highlight class
    await waitFor(() => {
      const selectedOption = screen.getByTestId("project-option-prj_test1");
      expect(selectedOption).toHaveClass("text-accent-primary");
    });
  });
});
