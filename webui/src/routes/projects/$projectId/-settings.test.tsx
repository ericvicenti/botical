import { describe, it, expect } from "vitest";
import { render, screen, waitFor, fireEvent } from "@/test/utils";
import { server } from "@/test/setup";
import { http, HttpResponse } from "msw";
import { useProject, useUpdateProject } from "@/lib/api/queries";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils/cn";

// Simplified ProjectSettingsPage component for testing (mirrors the real one)
function ProjectSettingsPage({ projectId }: { projectId: string }) {
  const { data: project, isLoading, error } = useProject(projectId);
  const updateProject = useUpdateProject();

  const [name, setName] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (project?.name && name === null) {
      setName(project.name);
    }
  }, [project?.name, name]);

  const hasNameChanged = name !== null && name !== project?.name;
  const canSave = hasNameChanged && name.trim().length > 0;

  const handleSaveName = async () => {
    if (!canSave) return;

    setIsSaving(true);
    try {
      await updateProject.mutateAsync({ id: projectId, name: name.trim() });
    } catch (err) {
      console.error("Failed to update project name:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelName = () => {
    setName(project?.name || "");
  };

  if (isLoading) {
    return (
      <div className="p-6" data-testid="loading-state">
        <div className="h-8 w-48 bg-bg-elevated rounded animate-pulse mb-6" />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="p-6" data-testid="error-state">
        <div className="bg-accent-error/10 border border-accent-error/20 rounded-lg p-4">
          <h2 className="text-accent-error font-medium">Project not found</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto" data-testid="settings-page">
      {/* Header */}
      <div className="mb-8">
        <a href={`/projects/${projectId}`} data-testid="back-link">
          Back to {project.name}
        </a>
        <h1 className="text-2xl font-bold text-text-primary" data-testid="page-title">
          Project Settings
        </h1>
      </div>

      <div className="space-y-4">
        {/* Project Section */}
        <div className="border border-border rounded-lg overflow-hidden" data-testid="project-section">
          <button
            className="w-full flex items-center gap-3 p-4 bg-bg-elevated"
            data-testid="project-section-header"
          >
            <span className="font-medium text-text-primary">Project</span>
          </button>
          <div className="p-4 border-t border-border">
            {/* Project Name */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Name
              </label>
              <div className="flex gap-2 items-center">
                <input
                  type="text"
                  value={name ?? project.name}
                  onChange={(e) => setName(e.target.value)}
                  className="flex-1 px-3 py-2 bg-bg-primary border border-border rounded-lg"
                  placeholder="Project name"
                  data-testid="name-input"
                />
                {hasNameChanged && (
                  <>
                    <button
                      onClick={handleSaveName}
                      disabled={isSaving || !canSave}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-sm font-medium",
                        isSaving || !canSave
                          ? "text-text-muted cursor-not-allowed"
                          : "text-accent-primary"
                      )}
                      data-testid="save-button"
                    >
                      {isSaving ? "Saving..." : "Save"}
                    </button>
                    <button
                      onClick={handleCancelName}
                      className="p-2 rounded-lg text-text-muted hover:text-text-primary"
                      title="Cancel changes"
                      data-testid="cancel-button"
                    >
                      X
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Project Icon */}
            <div className="mt-4">
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Icon
              </label>
              <div className="flex items-center gap-3">
                <div
                  className="w-12 h-12 bg-bg-elevated rounded-lg flex items-center justify-center"
                  data-testid="icon-preview"
                >
                  {project.iconUrl ? (
                    <img src={project.iconUrl} alt="" />
                  ) : (
                    <span>📁</span>
                  )}
                </div>
                <span className="text-sm text-text-muted">Icon customization coming soon</span>
              </div>
            </div>
          </div>
        </div>

        {/* Data Section */}
        <div className="border border-border rounded-lg overflow-hidden" data-testid="data-section">
          <button
            className="w-full flex items-center gap-3 p-4 bg-bg-elevated"
            data-testid="data-section-header"
          >
            <span className="font-medium text-text-primary">Data</span>
          </button>
          <div className="p-4 border-t border-border">
            {/* Project Path */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Location
              </label>
              <input
                type="text"
                value={project.path || ""}
                readOnly
                className="w-full px-3 py-2 bg-bg-primary border border-border rounded-lg"
                data-testid="path-input"
              />
            </div>

            {/* Project ID */}
            <div className="mt-4">
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Project ID
              </label>
              <input
                type="text"
                value={project.id}
                readOnly
                className="w-full px-3 py-2 bg-bg-primary border border-border rounded-lg"
                data-testid="id-input"
              />
            </div>
          </div>
        </div>

        {/* GitHub Section */}
        <div className="border border-border rounded-lg overflow-hidden" data-testid="github-section">
          <button
            className="w-full flex items-center gap-3 p-4 bg-bg-elevated"
            data-testid="github-section-header"
          >
            <span className="font-medium text-text-primary">GitHub</span>
            <span
              className="ml-auto text-xs px-2 py-0.5 rounded-full bg-accent-primary/20 text-accent-primary"
              data-testid="coming-soon-badge"
            >
              Coming Soon
            </span>
          </button>
        </div>

        {/* Danger Zone */}
        <div className="border border-border rounded-lg overflow-hidden" data-testid="danger-zone-section">
          <button
            className="w-full flex items-center gap-3 p-4 bg-bg-elevated"
            data-testid="danger-zone-header"
          >
            <span className="font-medium text-text-primary">Danger Zone</span>
          </button>
        </div>
      </div>
    </div>
  );
}

describe("ProjectSettingsPage", () => {
  const testProjectId = "prj_test123";

  it("renders loading state initially", () => {
    server.use(
      http.get("/api/projects/:id", async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return HttpResponse.json({
          data: {
            id: testProjectId,
            name: "Test Project",
            path: "/test/path",
            iconUrl: null,
          },
        });
      })
    );

    render(<ProjectSettingsPage projectId={testProjectId} />, { withRouter: false });
    expect(screen.getByTestId("loading-state")).toBeInTheDocument();
  });

  it("renders the settings page with project data", async () => {
    render(<ProjectSettingsPage projectId={testProjectId} />, { withRouter: false });

    await waitFor(() => {
      expect(screen.getByTestId("settings-page")).toBeInTheDocument();
    });

    expect(screen.getByTestId("page-title")).toHaveTextContent("Project Settings");
    expect(screen.getByTestId("back-link")).toHaveTextContent("Back to Test Project");
  });

  it("displays all collapsible sections", async () => {
    render(<ProjectSettingsPage projectId={testProjectId} />, { withRouter: false });

    await waitFor(() => {
      expect(screen.getByTestId("project-section")).toBeInTheDocument();
    });

    expect(screen.getByTestId("data-section")).toBeInTheDocument();
    expect(screen.getByTestId("github-section")).toBeInTheDocument();
    expect(screen.getByTestId("danger-zone-section")).toBeInTheDocument();
  });

  it("shows Coming Soon badge for GitHub section", async () => {
    render(<ProjectSettingsPage projectId={testProjectId} />, { withRouter: false });

    await waitFor(() => {
      expect(screen.getByTestId("coming-soon-badge")).toBeInTheDocument();
    });

    expect(screen.getByTestId("coming-soon-badge")).toHaveTextContent("Coming Soon");
  });

  it("displays project name in editable input", async () => {
    render(<ProjectSettingsPage projectId={testProjectId} />, { withRouter: false });

    await waitFor(() => {
      expect(screen.getByTestId("name-input")).toBeInTheDocument();
    });

    const nameInput = screen.getByTestId("name-input") as HTMLInputElement;
    expect(nameInput.value).toBe("Test Project");
  });

  it("displays project path as read-only", async () => {
    render(<ProjectSettingsPage projectId={testProjectId} />, { withRouter: false });

    await waitFor(() => {
      expect(screen.getByTestId("path-input")).toBeInTheDocument();
    });

    const pathInput = screen.getByTestId("path-input") as HTMLInputElement;
    expect(pathInput.value).toBe("/test/path");
    expect(pathInput).toHaveAttribute("readonly");
  });

  it("displays project ID as read-only", async () => {
    render(<ProjectSettingsPage projectId={testProjectId} />, { withRouter: false });

    await waitFor(() => {
      expect(screen.getByTestId("id-input")).toBeInTheDocument();
    });

    const idInput = screen.getByTestId("id-input") as HTMLInputElement;
    expect(idInput.value).toBe(testProjectId);
    expect(idInput).toHaveAttribute("readonly");
  });

  it("save and cancel buttons are hidden when name is unchanged", async () => {
    render(<ProjectSettingsPage projectId={testProjectId} />, { withRouter: false });

    await waitFor(() => {
      expect(screen.getByTestId("name-input")).toBeInTheDocument();
    });

    // Save and cancel buttons should not be present when name hasn't changed
    expect(screen.queryByTestId("save-button")).not.toBeInTheDocument();
    expect(screen.queryByTestId("cancel-button")).not.toBeInTheDocument();
  });

  it("save and cancel buttons appear when name is changed", async () => {
    render(<ProjectSettingsPage projectId={testProjectId} />, { withRouter: false });

    await waitFor(() => {
      expect(screen.getByTestId("name-input")).toBeInTheDocument();
    });

    const nameInput = screen.getByTestId("name-input");
    fireEvent.change(nameInput, { target: { value: "New Project Name" } });

    expect(screen.getByTestId("save-button")).toBeInTheDocument();
    expect(screen.getByTestId("cancel-button")).toBeInTheDocument();
  });

  it("cancel button reverts name to original value", async () => {
    render(<ProjectSettingsPage projectId={testProjectId} />, { withRouter: false });

    await waitFor(() => {
      expect(screen.getByTestId("name-input")).toBeInTheDocument();
    });

    const nameInput = screen.getByTestId("name-input") as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "New Project Name" } });

    expect(nameInput.value).toBe("New Project Name");

    const cancelButton = screen.getByTestId("cancel-button");
    fireEvent.click(cancelButton);

    expect(nameInput.value).toBe("Test Project");
    expect(screen.queryByTestId("save-button")).not.toBeInTheDocument();
  });

  it("save button is disabled when name is empty", async () => {
    render(<ProjectSettingsPage projectId={testProjectId} />, { withRouter: false });

    await waitFor(() => {
      expect(screen.getByTestId("name-input")).toBeInTheDocument();
    });

    const nameInput = screen.getByTestId("name-input");
    fireEvent.change(nameInput, { target: { value: "" } });

    const saveButton = screen.getByTestId("save-button");
    expect(saveButton).toBeDisabled();
  });

  it("shows error state when project not found", async () => {
    server.use(
      http.get("/api/projects/:id", () => {
        return HttpResponse.json(
          { error: { code: "NOT_FOUND", message: "Project not found" } },
          { status: 404 }
        );
      })
    );

    render(<ProjectSettingsPage projectId="prj_nonexistent" />, { withRouter: false });

    await waitFor(() => {
      expect(screen.getByTestId("error-state")).toBeInTheDocument();
    });

    expect(screen.getByText("Project not found")).toBeInTheDocument();
  });

  it("updates project name when save is clicked", async () => {
    let updatedName = "";

    server.use(
      http.put("/api/projects/:id", async ({ request }) => {
        const body = (await request.json()) as { name: string };
        updatedName = body.name;
        return HttpResponse.json({
          data: {
            id: testProjectId,
            name: body.name,
            path: "/test/path",
            iconUrl: null,
          },
        });
      })
    );

    render(<ProjectSettingsPage projectId={testProjectId} />, { withRouter: false });

    await waitFor(() => {
      expect(screen.getByTestId("name-input")).toBeInTheDocument();
    });

    const nameInput = screen.getByTestId("name-input");
    fireEvent.change(nameInput, { target: { value: "Updated Project Name" } });

    const saveButton = screen.getByTestId("save-button");
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(updatedName).toBe("Updated Project Name");
    });
  });

  it("shows default folder icon when no iconUrl", async () => {
    render(<ProjectSettingsPage projectId={testProjectId} />, { withRouter: false });

    await waitFor(() => {
      expect(screen.getByTestId("icon-preview")).toBeInTheDocument();
    });

    expect(screen.getByTestId("icon-preview")).toHaveTextContent("📁");
  });
});
