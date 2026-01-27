import { useState, useRef, useEffect } from "react";
import { ChevronDown, FolderTree, LayoutList, Plus, FolderOpen } from "lucide-react";
import { useProjects } from "@/lib/api/queries";
import { useUI } from "@/contexts/ui";
import { useTabs } from "@/contexts/tabs";
import { useNavigate } from "@tanstack/react-router";
import { cn } from "@/lib/utils/cn";
import { OpenProjectModal } from "./OpenProjectModal";

export function ProjectSelector() {
  const [isOpen, setIsOpen] = useState(false);
  const [isOpenProjectModalOpen, setIsOpenProjectModalOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { data: projects, isLoading } = useProjects();
  const { selectedProjectId, setSelectedProject } = useUI();
  const { openTab, openPreviewTab } = useTabs();
  const navigate = useNavigate();

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
    openPreviewTab({
      type: "project",
      projectId: project.id,
      projectName: project.name,
    });
    navigate({ to: "/projects/$projectId", params: { projectId: project.id } });
    setIsOpen(false);
  };

  const handleCreateProject = () => {
    openTab({ type: "create-project" });
    navigate({ to: "/create-project" });
    setIsOpen(false);
  };

  const handleOpenProject = () => {
    setIsOpen(false);
    setIsOpenProjectModalOpen(true);
  };

  const handleProjectOpened = (project: { id: string; name: string }) => {
    setSelectedProject(project.id);
    openPreviewTab({
      type: "project",
      projectId: project.id,
      projectName: project.name,
    });
    navigate({ to: "/projects/$projectId", params: { projectId: project.id } });
  };

  const handleViewAllProjects = () => {
    openPreviewTab({ type: "projects" });
    navigate({ to: "/" });
    setIsOpen(false);
  };

  const handleGoToProjectHome = () => {
    if (selectedProject) {
      openPreviewTab({
        type: "project",
        projectId: selectedProject.id,
        projectName: selectedProject.name,
      });
      navigate({ to: "/projects/$projectId", params: { projectId: selectedProject.id } });
    }
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <div
        className={cn(
          "w-full h-9 flex items-center justify-between",
          "bg-bg-elevated text-sm text-text-primary border-b border-border"
        )}
      >
        {/* Project name - clicking navigates to project home */}
        <button
          onClick={handleGoToProjectHome}
          className={cn(
            "flex-1 h-full flex items-center gap-2 px-3 min-w-0",
            "hover:bg-bg-secondary/50 transition-colors",
            !selectedProject && "pointer-events-none"
          )}
          title={selectedProject ? `Go to ${selectedProject.name}` : undefined}
        >
          <FolderTree className="w-4 h-4 text-accent-primary shrink-0" />
          <span className="truncate">
            {isLoading
              ? "Loading..."
              : selectedProject?.name ?? "Select a project"}
          </span>
        </button>
        {/* Dropdown toggle button */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            "h-full px-2 flex items-center justify-center",
            "hover:bg-bg-secondary/50 transition-colors",
            "border-l border-border/50"
          )}
          title="Switch project"
        >
          <ChevronDown
            className={cn(
              "w-4 h-4 text-text-secondary shrink-0 transition-transform",
              isOpen && "rotate-180"
            )}
          />
        </button>
      </div>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 z-50 bg-bg-elevated border border-border rounded-b-lg shadow-lg max-h-64 overflow-auto">
          {isLoading ? (
            <div className="px-3 py-2 text-sm text-text-muted">Loading...</div>
          ) : (
            <div className="py-1">
              {projects?.map((project) => (
                <button
                  key={project.id}
                  onClick={() => handleSelectProject(project)}
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
              {projects && projects.length > 0 && (
                <div className="border-t border-border my-1" />
              )}
              <button
                onClick={handleViewAllProjects}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2 text-left",
                  "hover:bg-bg-secondary transition-colors",
                  "text-sm text-text-secondary"
                )}
              >
                <LayoutList className="w-4 h-4 shrink-0" />
                <span>View All Projects</span>
              </button>
              <button
                onClick={handleOpenProject}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2 text-left",
                  "hover:bg-bg-secondary transition-colors",
                  "text-sm text-text-secondary"
                )}
              >
                <FolderOpen className="w-4 h-4 shrink-0" />
                <span>Open Project</span>
              </button>
              <button
                onClick={handleCreateProject}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2 text-left",
                  "hover:bg-bg-secondary transition-colors",
                  "text-sm text-text-secondary"
                )}
              >
                <Plus className="w-4 h-4 shrink-0" />
                <span>Create New Project</span>
              </button>
            </div>
          )}
        </div>
      )}

      <OpenProjectModal
        isOpen={isOpenProjectModalOpen}
        onClose={() => setIsOpenProjectModalOpen(false)}
        onProjectOpened={handleProjectOpened}
      />
    </div>
  );
}
