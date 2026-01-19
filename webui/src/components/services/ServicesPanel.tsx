import { useState } from "react";
import { useServices, useCreateService } from "@/lib/api/queries";
import { ServiceItem } from "@/components/processes/ServiceItem";
import type { Service } from "@/lib/api/types";
import { cn } from "@/lib/utils/cn";
import { Plus, Radio, ChevronDown, ChevronRight } from "lucide-react";

interface ServicesPanelProps {
  projectId: string;
}

export function ServicesPanel({ projectId }: ServicesPanelProps) {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const { data: services, isLoading } = useServices(projectId);

  const running = services?.filter((s) => s.isRunning) || [];
  const stopped = services?.filter((s) => !s.isRunning) || [];

  return (
    <div className="h-full flex flex-col">
      <div className="px-2 py-1 border-b border-border flex items-center justify-between">
        <div className="text-xs font-medium text-text-secondary uppercase tracking-wide">
          Services
        </div>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className={cn(
            "p-0.5 rounded hover:bg-bg-elevated transition-colors",
            "text-text-secondary hover:text-accent-primary",
            showCreateForm && "text-accent-primary bg-bg-elevated"
          )}
          title="Create new service"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {showCreateForm && (
        <div className="p-2 border-b border-border bg-bg-elevated/50">
          <CreateServiceForm
            projectId={projectId}
            onClose={() => setShowCreateForm(false)}
          />
        </div>
      )}

      <div className="flex-1 overflow-auto py-1">
        {isLoading ? (
          <div className="py-2 text-sm text-text-muted text-center">
            Loading services...
          </div>
        ) : !services || services.length === 0 ? (
          <EmptyState onCreateClick={() => setShowCreateForm(true)} />
        ) : (
          <div className="space-y-2">
            {running.length > 0 && (
              <ServiceSection
                title="Running"
                count={running.length}
                services={running}
                defaultOpen
              />
            )}
            {stopped.length > 0 && (
              <ServiceSection
                title="Stopped"
                count={stopped.length}
                services={stopped}
                defaultOpen={running.length === 0}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface ServiceSectionProps {
  title: string;
  count: number;
  services: Service[];
  defaultOpen?: boolean;
}

function ServiceSection({ title, count, services, defaultOpen = true }: ServiceSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-2 py-1 flex items-center gap-1 text-xs text-text-muted uppercase tracking-wide hover:text-text-secondary"
      >
        {isOpen ? (
          <ChevronDown className="w-3 h-3" />
        ) : (
          <ChevronRight className="w-3 h-3" />
        )}
        {title} ({count})
      </button>
      {isOpen && (
        <div>
          {services.map((service) => (
            <ServiceItem key={service.id} service={service} />
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState({ onCreateClick }: { onCreateClick: () => void }) {
  return (
    <div className="py-6 text-center">
      <Radio className="w-8 h-8 mx-auto text-text-muted mb-2" />
      <div className="text-sm text-text-muted mb-1">No services configured</div>
      <div className="text-xs text-text-muted mb-3">
        Services are long-running processes that can auto-start
      </div>
      <button
        onClick={onCreateClick}
        className={cn(
          "inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-sm",
          "bg-accent-primary text-white hover:bg-accent-primary/90 transition-colors"
        )}
      >
        <Plus className="w-4 h-4" />
        Create Service
      </button>
    </div>
  );
}

interface CreateServiceFormProps {
  projectId: string;
  onClose: () => void;
}

function CreateServiceForm({ projectId, onClose }: CreateServiceFormProps) {
  const [name, setName] = useState("");
  const [command, setCommand] = useState("");
  const [cwd, setCwd] = useState("");
  const [autoStart, setAutoStart] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const createService = useCreateService();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim() || !command.trim()) {
      return;
    }

    createService.mutate(
      {
        projectId,
        name: name.trim(),
        command: command.trim(),
        cwd: cwd.trim() || undefined,
        autoStart,
        createdBy: "user",
      },
      {
        onSuccess: () => {
          setName("");
          setCommand("");
          setCwd("");
          setAutoStart(false);
          onClose();
        },
        onError: (error) => {
          console.error("Failed to create service:", error);
          alert(`Failed to create service: ${error.message}`);
        },
      }
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-xs text-text-secondary mb-1">
          Service Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., dev-server"
          className={cn(
            "w-full px-2 py-1.5 text-sm rounded border border-border",
            "bg-bg-primary text-text-primary",
            "focus:outline-none focus:border-accent-primary"
          )}
          autoFocus
        />
      </div>

      <div>
        <label className="block text-xs text-text-secondary mb-1">
          Command
        </label>
        <input
          type="text"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder="e.g., npm run dev"
          className={cn(
            "w-full px-2 py-1.5 text-sm rounded border border-border",
            "bg-bg-primary text-text-primary font-mono",
            "focus:outline-none focus:border-accent-primary"
          )}
        />
      </div>

      <button
        type="button"
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="text-xs text-text-muted hover:text-text-secondary"
      >
        {showAdvanced ? "Hide" : "Show"} advanced options
      </button>

      {showAdvanced && (
        <div className="space-y-3 pt-1">
          <div>
            <label className="block text-xs text-text-secondary mb-1">
              Working Directory (optional)
            </label>
            <input
              type="text"
              value={cwd}
              onChange={(e) => setCwd(e.target.value)}
              placeholder="Leave empty for project root"
              className={cn(
                "w-full px-2 py-1.5 text-sm rounded border border-border",
                "bg-bg-primary text-text-primary font-mono",
                "focus:outline-none focus:border-accent-primary"
              )}
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={autoStart}
              onChange={(e) => setAutoStart(e.target.checked)}
              className="rounded border-border"
            />
            <span className="text-sm text-text-secondary">
              Auto-start when Iris launches
            </span>
          </label>
        </div>
      )}

      <div className="flex items-center gap-2 pt-1">
        <button
          type="submit"
          disabled={!name.trim() || !command.trim() || createService.isPending}
          className={cn(
            "flex-1 px-3 py-1.5 rounded text-sm font-medium",
            "bg-accent-primary text-white",
            "hover:bg-accent-primary/90 transition-colors",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        >
          {createService.isPending ? "Creating..." : "Create Service"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className={cn(
            "px-3 py-1.5 rounded text-sm",
            "text-text-secondary hover:text-text-primary",
            "hover:bg-bg-elevated transition-colors"
          )}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
