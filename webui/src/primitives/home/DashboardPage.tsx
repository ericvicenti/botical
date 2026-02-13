import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils/cn";
import { apiClientRaw } from "@/lib/api/client";
import { useProjects } from "@/lib/api/queries";
import { useTabs } from "@/contexts/tabs";
import { useUI } from "@/contexts/ui";

interface StatusSession {
  id: string;
  title: string;
  agent: string | null;
  projectId: string;
  projectName: string;
  messageCount: number;
  lastActivity: number;
  status: string;
  lastMessage?: string;
  hasError?: boolean;
}

interface StatusMessage {
  sessionId: string;
  role: string;
  text: string;
  createdAt: number;
  agent: string | null;
}

interface StatusData {
  timestamp: number;
  activeSessions: StatusSession[];
  recentSessions: StatusSession[];
  recentMessages: StatusMessage[];
  heartbeat: {
    lastRun: number | null;
    nextRun: number | null;
    status: string;
    lastError: string | null;
  };
  services: {
    server: string;
    uptime: number;
  };
}

function useStatusData() {
  return useQuery({
    queryKey: ["status-data"],
    queryFn: async () => {
      const response = await apiClientRaw<StatusData>("/status/data");
      return response.data;
    },
    refetchInterval: 10_000,
  });
}

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function DashboardPage() {
  const { data: statusData, isLoading: statusLoading } = useStatusData();
  const { data: projects } = useProjects();
  const navigate = useNavigate();
  const { openTab } = useTabs();
  const { setSelectedProject } = useUI();

  const handleSessionClick = (session: StatusSession) => {
    setSelectedProject(session.projectId);
    openTab({
      type: "task",
      sessionId: session.id,
      projectId: session.projectId,
      title: session.title || session.id,
    });
    navigate({
      to: "/projects/$projectId/tasks/$sessionId",
      params: { projectId: session.projectId, sessionId: session.id },
    });
  };

  const handleProjectClick = (project: { id: string; name: string }) => {
    setSelectedProject(project.id);
    openTab({
      type: "project",
      projectId: project.id,
      projectName: project.name,
    });
    navigate({
      to: "/projects/$projectId",
      params: { projectId: project.id },
    });
  };

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Dashboard</h1>
          <p className="text-sm text-text-muted mt-1">
            {statusData ? (
              <span className="flex items-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                Server up {formatUptime(statusData.services.uptime)}
              </span>
            ) : (
              "Loading..."
            )}
          </p>
        </div>
      </div>

      {/* Leopard Heartbeat */}
      <section>
        <div className="bg-bg-elevated rounded-lg border border-border p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                {statusData ? (
                  // Determine pulse color based on heartbeat status
                  (() => {
                    const { lastRun, status, lastError } = statusData.heartbeat;
                    const now = Date.now();
                    const threeHoursMs = 3 * 60 * 60 * 1000;
                    
                    let pulseColor = "bg-gray-500"; // default
                    let statusText = "Unknown";
                    
                    if (status === "disabled") {
                      pulseColor = "bg-gray-500";
                      statusText = "Disabled";
                    } else if (lastError) {
                      pulseColor = "bg-red-500";
                      statusText = "Error";
                    } else if (lastRun && (now - lastRun) > threeHoursMs) {
                      pulseColor = "bg-yellow-500";
                      statusText = "Overdue";
                    } else if (lastRun) {
                      pulseColor = "bg-green-500";
                      statusText = "Healthy";
                    } else {
                      pulseColor = "bg-blue-500";
                      statusText = "Pending";
                    }
                    
                    return (
                      <>
                        <span className={`inline-block w-3 h-3 rounded-full animate-pulse ${pulseColor}`} />
                        <h2 className="text-lg font-semibold text-text-primary">
                          Leopard Heartbeat
                        </h2>
                        <span className={`px-2 py-1 text-xs font-semibold rounded ${
                          statusText === "Healthy" ? "bg-green-500/20 text-green-400" :
                          statusText === "Error" ? "bg-red-500/20 text-red-400" :
                          statusText === "Overdue" ? "bg-yellow-500/20 text-yellow-400" :
                          statusText === "Pending" ? "bg-blue-500/20 text-blue-400" :
                          "bg-gray-500/20 text-gray-400"
                        }`}>
                          {statusText}
                        </span>
                      </>
                    );
                  })()
                ) : (
                  <>
                    <span className="inline-block w-3 h-3 rounded-full bg-gray-500 animate-pulse" />
                    <h2 className="text-lg font-semibold text-text-primary">Leopard Heartbeat</h2>
                    <span className="px-2 py-1 text-xs font-semibold rounded bg-gray-500/20 text-gray-400">Loading...</span>
                  </>
                )}
              </div>
            </div>
            <div className="text-sm text-text-muted text-right">
              {statusData?.heartbeat ? (
                <>
                  <div>
                    Last: {statusData.heartbeat.lastRun 
                      ? timeAgo(statusData.heartbeat.lastRun)
                      : "Never"
                    }
                  </div>
                  <div>
                    Next: {statusData.heartbeat.nextRun 
                      ? new Date(statusData.heartbeat.nextRun).toLocaleString()
                      : "Not scheduled"
                    }
                  </div>
                </>
              ) : (
                <div>Loading...</div>
              )}
            </div>
          </div>
          {statusData?.heartbeat.lastError && (
            <div className="mt-3 p-2 bg-red-500/10 border border-red-500/20 rounded text-sm text-red-400">
              <strong>Error:</strong> {statusData.heartbeat.lastError}
            </div>
          )}
        </div>
      </section>

      {/* Active Sessions */}
      <section>
        <h2 className="text-lg font-semibold text-text-primary mb-3 flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
          Active Sessions
          {statusData && (
            <span className="text-sm font-normal text-text-muted">
              ({statusData.activeSessions.length})
            </span>
          )}
        </h2>

        {statusLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="h-20 bg-bg-elevated rounded-lg animate-pulse"
              />
            ))}
          </div>
        ) : statusData?.activeSessions.length === 0 ? (
          <div className="text-center py-8 bg-bg-elevated rounded-lg border border-border">
            <p className="text-text-secondary">No active sessions</p>
          </div>
        ) : (
          <div className="space-y-2">
            {statusData?.activeSessions.map((session) => (
              <button
                key={`${session.projectId}-${session.id}`}
                onClick={() => handleSessionClick(session)}
                className={cn(
                  "block w-full text-left p-4 bg-bg-elevated rounded-lg border border-border",
                  "hover:border-accent-primary/50 hover:bg-bg-elevated/80 transition-colors"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium text-text-primary truncate">
                        {session.title || session.id}
                      </h3>
                      {session.agent && (
                        <span className="shrink-0 px-2 py-0.5 text-xs font-semibold rounded bg-amber-500/20 text-amber-400">
                          {session.agent}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-text-muted">
                      <span>{session.projectName}</span>
                      <span>·</span>
                      <span>{session.messageCount} msgs</span>
                      <span>·</span>
                      <span>{timeAgo(session.lastActivity)}</span>
                    </div>
                    {session.lastMessage && (
                      <p className="text-sm text-text-secondary mt-2 line-clamp-2">
                        {session.lastMessage}
                      </p>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Recent Sessions */}
      {statusData && statusData.recentSessions.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-text-primary mb-3">
            Recent Sessions
            <span className="text-sm font-normal text-text-muted ml-2">
              (last 24h)
            </span>
          </h2>
          <div className="space-y-2">
            {statusData.recentSessions.map((session) => (
              <button
                key={`recent-${session.projectId}-${session.id}`}
                onClick={() => handleSessionClick(session)}
                className={cn(
                  "block w-full text-left p-4 bg-bg-elevated rounded-lg border",
                  session.hasError
                    ? "border-red-500/30"
                    : "border-border",
                  "hover:border-accent-primary/50 hover:bg-bg-elevated/80 transition-colors"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium text-text-primary truncate">
                        {session.title || session.id}
                      </h3>
                      {session.agent && (
                        <span className="shrink-0 px-2 py-0.5 text-xs font-semibold rounded bg-amber-500/20 text-amber-400">
                          {session.agent}
                        </span>
                      )}
                      {session.hasError && (
                        <span className="shrink-0 px-2 py-0.5 text-xs font-semibold rounded bg-red-500/20 text-red-400">
                          error
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-text-muted">
                      <span>{session.projectName}</span>
                      <span>·</span>
                      <span>{session.messageCount} msgs</span>
                      <span>·</span>
                      <span>{timeAgo(session.lastActivity)}</span>
                    </div>
                    {session.lastMessage && (
                      <p className="text-sm text-text-secondary mt-2 line-clamp-2">
                        {session.lastMessage}
                      </p>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Recent Activity */}
      <section>
        <h2 className="text-lg font-semibold text-text-primary mb-3">
          Recent Activity
        </h2>

        {statusLoading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="h-14 bg-bg-elevated rounded-lg animate-pulse"
              />
            ))}
          </div>
        ) : statusData?.recentMessages.length === 0 ? (
          <div className="text-center py-8 bg-bg-elevated rounded-lg border border-border">
            <p className="text-text-secondary">No recent activity</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {statusData?.recentMessages.map((msg, i) => (
              <div
                key={`${msg.sessionId}-${msg.createdAt}-${i}`}
                className="p-3 bg-bg-elevated rounded-lg border border-border"
              >
                <div className="flex items-center gap-2 mb-1 text-xs">
                  <span
                    className={cn(
                      "px-2 py-0.5 rounded font-semibold",
                      msg.role === "user"
                        ? "bg-blue-500/20 text-blue-400"
                        : "bg-purple-500/20 text-purple-400"
                    )}
                  >
                    {msg.role}
                  </span>
                  {msg.agent && (
                    <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 font-semibold">
                      {msg.agent}
                    </span>
                  )}
                  <span className="text-text-muted ml-auto">
                    {timeAgo(msg.createdAt)}
                  </span>
                </div>
                <p className="text-sm text-text-secondary line-clamp-2">
                  {msg.text}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Projects */}
      <section>
        <h2 className="text-lg font-semibold text-text-primary mb-3">
          Projects
          {projects && (
            <span className="text-sm font-normal text-text-muted ml-2">
              ({projects.length})
            </span>
          )}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {projects?.map((project) => (
            <button
              key={project.id}
              onClick={() => handleProjectClick(project)}
              className={cn(
                "block w-full text-left p-4 bg-bg-elevated rounded-lg border border-border",
                "hover:border-accent-primary/50 hover:bg-bg-elevated/80 transition-colors"
              )}
            >
              <h3 className="font-medium text-text-primary">{project.name}</h3>
              {project.description && (
                <p className="text-sm text-text-secondary mt-1 line-clamp-1">
                  {project.description}
                </p>
              )}
              {project.path && (
                <p className="text-xs text-text-muted font-mono mt-1 truncate">
                  {project.path}
                </p>
              )}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
