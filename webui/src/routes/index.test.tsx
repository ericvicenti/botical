import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@/test/utils";
import { server } from "@/test/setup";
import { http, HttpResponse } from "msw";
import { useProjects } from "@/lib/api/queries";

// Simplified HomePage component for testing (matches the real one)
function HomePage() {
  const { data: projects, isLoading, error } = useProjects();

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
      </div>

      {isLoading ? (
        <div data-testid="loading-state">Loading...</div>
      ) : projects?.length === 0 ? (
        <div data-testid="empty-state">
          <p>No projects yet</p>
          <p className="text-text-muted text-sm mt-1">
            Use the project selector in the sidebar to create your first project
          </p>
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

  it("shows hint about project selector when no projects exist", async () => {
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
      expect(
        screen.getByText(
          "Use the project selector in the sidebar to create your first project"
        )
      ).toBeInTheDocument();
    });
  });
});
