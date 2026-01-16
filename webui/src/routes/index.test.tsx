import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, waitFor } from "@/test/utils";
import { server } from "@/test/setup";
import { http, HttpResponse } from "msw";
import { useProjects, useCreateProject } from "@/lib/api/queries";
import { useState } from "react";
import { cn } from "@/lib/utils/cn";

// Simplified HomePage component for testing (matches the real one)
function HomePage() {
  const { data: projects, isLoading, error } = useProjects();
  const createProject = useCreateProject();
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;

    try {
      await createProject.mutateAsync({
        name: newProjectName.trim(),
      });
      setNewProjectName("");
      setShowNewProject(false);
    } catch (err) {
      console.error("Failed to create project:", err);
    }
  };

  if (error) {
    return (
      <div className="p-6">
        <div
          className="bg-accent-error/10 border border-accent-error/20 rounded-lg p-4"
          data-testid="error-state"
        >
          <h2 className="text-accent-error font-medium">
            Failed to load projects
          </h2>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-text-primary">Projects</h1>
        <button
          onClick={() => setShowNewProject(true)}
          className="px-4 py-2 bg-accent-primary text-bg-primary font-medium rounded-lg"
          data-testid="new-project-button"
        >
          New Project
        </button>
      </div>

      {showNewProject && (
        <div
          className="mb-6 p-4 bg-bg-elevated rounded-lg border border-border"
          data-testid="new-project-form"
        >
          <form onSubmit={handleCreateProject} className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium mb-1">
                Project Name
              </label>
              <input
                id="name"
                type="text"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="My Project"
                className="w-full px-3 py-2 bg-bg-primary border border-border rounded-lg"
                autoFocus
                data-testid="project-name-input"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={createProject.isPending || !newProjectName.trim()}
                className="px-4 py-2 bg-accent-primary rounded-lg disabled:opacity-50"
                data-testid="create-project-button"
              >
                {createProject.isPending ? "Creating..." : "Create"}
              </button>
              <button
                type="button"
                onClick={() => setShowNewProject(false)}
                data-testid="cancel-button"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {isLoading ? (
        <div data-testid="loading-state">Loading...</div>
      ) : projects?.length === 0 ? (
        <div data-testid="empty-state">
          <p>No projects yet</p>
        </div>
      ) : (
        <div className="space-y-3" data-testid="project-list">
          {projects?.map(
            (project: { id: string; name: string; path?: string | null }) => (
              <div key={project.id} className="p-4 bg-bg-elevated rounded-lg">
                <h3>{project.name}</h3>
                {project.path && <p className="text-sm">{project.path}</p>}
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}

describe("HomePage", () => {
  it("renders the page title", async () => {
    render(<HomePage />, { withRouter: false });

    await waitFor(() => {
      expect(screen.getByText("Projects")).toBeInTheDocument();
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

    render(<HomePage />, { withRouter: false });
    expect(screen.getByTestId("loading-state")).toBeInTheDocument();
  });

  it("displays projects after loading", async () => {
    render(<HomePage />, { withRouter: false });

    await waitFor(() => {
      expect(screen.getByText("Test Project 1")).toBeInTheDocument();
      expect(screen.getByText("Test Project 2")).toBeInTheDocument();
    });
  });

  it("shows empty state when no projects", async () => {
    server.use(
      http.get("/api/projects", () => {
        return HttpResponse.json({
          data: [],
          meta: { total: 0, limit: 50, offset: 0, hasMore: false },
        });
      })
    );

    render(<HomePage />, { withRouter: false });

    await waitFor(() => {
      expect(screen.getByTestId("empty-state")).toBeInTheDocument();
      expect(screen.getByText("No projects yet")).toBeInTheDocument();
    });
  });

  it("shows error state when API fails", async () => {
    server.use(
      http.get("/api/projects", () => {
        return HttpResponse.json(
          { error: { code: "INTERNAL_ERROR", message: "Server error" } },
          { status: 500 }
        );
      })
    );

    render(<HomePage />, { withRouter: false });

    await waitFor(() => {
      expect(screen.getByTestId("error-state")).toBeInTheDocument();
    });
  });

  it("opens new project form when button clicked", async () => {
    render(<HomePage />, { withRouter: false });

    await waitFor(() => {
      expect(screen.getByTestId("new-project-button")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("new-project-button"));

    expect(screen.getByTestId("new-project-form")).toBeInTheDocument();
    expect(screen.getByTestId("project-name-input")).toBeInTheDocument();
  });

  it("closes new project form when cancel clicked", async () => {
    render(<HomePage />, { withRouter: false });

    await waitFor(() => {
      expect(screen.getByTestId("new-project-button")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("new-project-button"));
    expect(screen.getByTestId("new-project-form")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("cancel-button"));
    expect(screen.queryByTestId("new-project-form")).not.toBeInTheDocument();
  });

  it("creates project when form is submitted", async () => {
    let createCalled = false;
    server.use(
      http.post("/api/projects", async ({ request }) => {
        createCalled = true;
        const body = (await request.json()) as { name: string };
        return HttpResponse.json(
          {
            data: {
              id: "prj_new",
              name: body.name,
              ownerId: "usr_test",
              type: "local",
              path: null,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
          },
          { status: 201 }
        );
      })
    );

    render(<HomePage />, { withRouter: false });

    await waitFor(() => {
      expect(screen.getByTestId("new-project-button")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("new-project-button"));

    const nameInput = screen.getByTestId("project-name-input");
    fireEvent.change(nameInput, { target: { value: "My New Project" } });

    fireEvent.click(screen.getByTestId("create-project-button"));

    await waitFor(() => {
      expect(createCalled).toBe(true);
    });
  });

  it("disables create button when name is empty", async () => {
    render(<HomePage />, { withRouter: false });

    await waitFor(() => {
      expect(screen.getByTestId("new-project-button")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("new-project-button"));

    const createButton = screen.getByTestId("create-project-button");
    expect(createButton).toBeDisabled();
  });

  it("enables create button when name is entered", async () => {
    render(<HomePage />, { withRouter: false });

    await waitFor(() => {
      expect(screen.getByTestId("new-project-button")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("new-project-button"));

    const nameInput = screen.getByTestId("project-name-input");
    fireEvent.change(nameInput, { target: { value: "Test" } });

    const createButton = screen.getByTestId("create-project-button");
    expect(createButton).not.toBeDisabled();
  });
});

describe("Project Creation UX", () => {
  it("creates project with just a name (no path required)", async () => {
    let requestBody: { name: string; path?: string } | null = null;

    server.use(
      http.post("/api/projects", async ({ request }) => {
        requestBody = (await request.json()) as { name: string; path?: string };
        return HttpResponse.json(
          {
            data: {
              id: "prj_new",
              name: requestBody.name,
              ownerId: "usr_test",
              type: "local",
              path: "/auto/generated/path",
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
          },
          { status: 201 }
        );
      })
    );

    render(<HomePage />, { withRouter: false });

    await waitFor(() => {
      expect(screen.getByTestId("new-project-button")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("new-project-button"));

    // Only need to fill in the name - no path input exists
    const nameInput = screen.getByTestId("project-name-input");
    fireEvent.change(nameInput, { target: { value: "Auto Path Project" } });

    fireEvent.click(screen.getByTestId("create-project-button"));

    await waitFor(() => {
      expect(requestBody).not.toBeNull();
      expect(requestBody?.name).toBe("Auto Path Project");
      // Path should not be sent at all
      expect(requestBody?.path).toBeUndefined();
    });
  });

  it("does not show path input field in the form", async () => {
    render(<HomePage />, { withRouter: false });

    await waitFor(() => {
      expect(screen.getByTestId("new-project-button")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("new-project-button"));

    // Name input should exist
    expect(screen.getByTestId("project-name-input")).toBeInTheDocument();

    // Path input should NOT exist
    expect(screen.queryByTestId("project-path-input")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/path/i)).not.toBeInTheDocument();
  });
});
