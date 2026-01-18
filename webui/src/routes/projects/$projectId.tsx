import { createFileRoute, Link } from "@tanstack/react-router";
import {
  useProject,
  useSessions,
  useMissions,
  useProcesses,
  useFiles,
} from "@/lib/api/queries";
import { cn } from "@/lib/utils/cn";
import { FolderTree, AlertTriangle, CheckCircle, Info } from "lucide-react";

export const Route = createFileRoute("/projects/$projectId")({
  component: ProjectPage,
});

function ProjectPage() {
  const { projectId } = Route.useParams();
  const { data: project, isLoading: projectLoading } = useProject(projectId);
  const { data: sessions } = useSessions(projectId);
  const { data: missions } = useMissions(projectId);
  const { data: processes } = useProcesses(projectId);
  const { data: files, isLoading: filesLoading, error: filesError } = useFiles(projectId);

  if (projectLoading) {
    return (
      <div className="p-6">
        <div className="h-8 w-48 bg-bg-elevated rounded animate-pulse mb-6" />
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-24 bg-bg-elevated rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-6">
        <div className="bg-accent-error/10 border border-accent-error/20 rounded-lg p-4">
          <h2 className="text-accent-error font-medium">Project not found</h2>
        </div>
      </div>
    );
  }

  const runningProcesses = processes?.filter(
    (p) => p.status === "running" || p.status === "starting"
  );

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <Link
          to="/"
          className="text-sm text-text-muted hover:text-text-secondary mb-2 inline-block"
        >
          ← Projects
        </Link>
        <h1 className="text-2xl font-bold text-text-primary">{project.name}</h1>
        {project.path && (
          <p className="text-text-muted font-mono text-sm mt-1">
            {project.path}
          </p>
        )}
        {project.description && (
          <p className="text-text-secondary mt-2">{project.description}</p>
        )}
      </div>

      {/* Project Info Panel */}
      <div className="bg-bg-elevated rounded-lg border border-border p-4 mb-6">
        <h2 className="font-semibold text-text-primary mb-4 flex items-center gap-2">
          <Info className="w-4 h-4" />
          Project Settings
        </h2>

        <div className="space-y-3">
          {/* Project ID */}
          <div>
            <label className="text-xs text-text-muted uppercase tracking-wide">Project ID</label>
            <p className="font-mono text-sm text-text-secondary">{project.id}</p>
          </div>

          {/* Project Path */}
          <div>
            <label className="text-xs text-text-muted uppercase tracking-wide">Filesystem Path</label>
            {project.path ? (
              <p className="font-mono text-sm text-text-primary break-all">{project.path}</p>
            ) : (
              <div className="flex items-center gap-2 text-accent-warning">
                <AlertTriangle className="w-4 h-4" />
                <span className="text-sm">No path configured - files panel will be empty</span>
              </div>
            )}
          </div>

          {/* Files Status */}
          <div>
            <label className="text-xs text-text-muted uppercase tracking-wide">Files Status</label>
            {filesLoading ? (
              <p className="text-sm text-text-muted">Loading files...</p>
            ) : filesError ? (
              <div className="flex items-center gap-2 text-accent-error">
                <AlertTriangle className="w-4 h-4" />
                <span className="text-sm">Error loading files: {filesError instanceof Error ? filesError.message : "Unknown error"}</span>
              </div>
            ) : files && files.length > 0 ? (
              <div className="flex items-center gap-2 text-accent-success">
                <CheckCircle className="w-4 h-4" />
                <span className="text-sm">{files.length} items in root directory</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-accent-warning">
                <FolderTree className="w-4 h-4" />
                <span className="text-sm">No files found (directory may be empty or path may be invalid)</span>
              </div>
            )}
          </div>

          {/* File list preview */}
          {files && files.length > 0 && (
            <div>
              <label className="text-xs text-text-muted uppercase tracking-wide">Root Files Preview</label>
              <div className="mt-1 bg-bg-primary rounded border border-border p-2 max-h-32 overflow-auto">
                <ul className="text-sm font-mono space-y-0.5">
                  {files.slice(0, 10).map((file) => (
                    <li key={file.path} className="flex items-center gap-2 text-text-secondary">
                      <span className={file.type === "directory" ? "text-accent-warning" : "text-text-muted"}>
                        {file.type === "directory" ? "📁" : "📄"}
                      </span>
                      {file.name}
                    </li>
                  ))}
                  {files.length > 10 && (
                    <li className="text-text-muted">... and {files.length - 10} more</li>
                  )}
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sessions */}
        <div className="bg-bg-elevated rounded-lg border border-border p-4">
          <h2 className="font-semibold text-text-primary mb-4">Sessions</h2>
          {!sessions?.length ? (
            <p className="text-text-muted text-sm">No sessions yet</p>
          ) : (
            <div className="space-y-2">
              {sessions.slice(0, 5).map((session) => (
                <div
                  key={session.id}
                  className="p-3 bg-bg-primary rounded border border-border"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-text-primary">
                      {session.title}
                    </span>
                    <StatusBadge status={session.status} />
                  </div>
                  <div className="text-xs text-text-muted mt-1">
                    {session.messageCount} messages
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Missions */}
        <div className="bg-bg-elevated rounded-lg border border-border p-4">
          <h2 className="font-semibold text-text-primary mb-4">Missions</h2>
          {!missions?.length ? (
            <p className="text-text-muted text-sm">No missions yet</p>
          ) : (
            <div className="space-y-2">
              {missions.slice(0, 5).map((mission) => (
                <div
                  key={mission.id}
                  className="p-3 bg-bg-primary rounded border border-border"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-text-primary">
                      {mission.title}
                    </span>
                    <MissionStatusBadge status={mission.status} />
                  </div>
                  <div className="text-xs text-text-muted mt-1">
                    Created{" "}
                    {new Date(mission.createdAt).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Running Processes */}
        <div className="bg-bg-elevated rounded-lg border border-border p-4 lg:col-span-2">
          <h2 className="font-semibold text-text-primary mb-4">
            Running Processes
            {runningProcesses?.length ? (
              <span className="ml-2 text-sm text-text-muted">
                ({runningProcesses.length})
              </span>
            ) : null}
          </h2>
          {!runningProcesses?.length ? (
            <p className="text-text-muted text-sm">No running processes</p>
          ) : (
            <div className="space-y-2">
              {runningProcesses.map((process) => (
                <div
                  key={process.id}
                  className="p-3 bg-bg-primary rounded border border-border font-mono text-sm"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-text-primary truncate">
                      {process.command}
                    </span>
                    <ProcessStatusBadge status={process.status} />
                  </div>
                  <div className="text-xs text-text-muted mt-1">
                    {process.cwd}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "px-2 py-0.5 text-xs rounded-full",
        status === "active"
          ? "bg-accent-success/20 text-accent-success"
          : status === "archived"
            ? "bg-text-muted/20 text-text-muted"
            : "bg-accent-error/20 text-accent-error"
      )}
    >
      {status}
    </span>
  );
}

function MissionStatusBadge({
  status,
}: {
  status:
    | "planning"
    | "pending"
    | "running"
    | "paused"
    | "completed"
    | "cancelled";
}) {
  const colors = {
    planning: "bg-accent-warning/20 text-accent-warning",
    pending: "bg-text-muted/20 text-text-muted",
    running: "bg-accent-primary/20 text-accent-primary",
    paused: "bg-accent-warning/20 text-accent-warning",
    completed: "bg-accent-success/20 text-accent-success",
    cancelled: "bg-accent-error/20 text-accent-error",
  };

  return (
    <span className={cn("px-2 py-0.5 text-xs rounded-full", colors[status])}>
      {status}
    </span>
  );
}

function ProcessStatusBadge({
  status,
}: {
  status: "starting" | "running" | "completed" | "failed" | "killed";
}) {
  const colors = {
    starting: "bg-accent-warning/20 text-accent-warning",
    running: "bg-accent-success/20 text-accent-success",
    completed: "bg-text-muted/20 text-text-muted",
    failed: "bg-accent-error/20 text-accent-error",
    killed: "bg-accent-error/20 text-accent-error",
  };

  return (
    <span className={cn("px-2 py-0.5 text-xs rounded-full", colors[status])}>
      {status}
    </span>
  );
}
