import { useServices } from "@/lib/api/queries";
import { ServiceItem } from "./ServiceItem";
import { Settings } from "lucide-react";

interface ServiceListProps {
  projectId: string;
}

export function ServiceList({ projectId }: ServiceListProps) {
  const { data: services, isLoading } = useServices(projectId);

  if (isLoading) {
    return (
      <div className="py-2 text-sm text-text-muted text-center">
        Loading services...
      </div>
    );
  }

  if (!services || services.length === 0) {
    return (
      <div className="py-4 text-center">
        <Settings className="w-6 h-6 mx-auto text-text-muted mb-2" />
        <div className="text-sm text-text-muted">No services configured</div>
        <div className="text-xs text-text-muted mt-1">
          Use the service tool with saveAsService=true
        </div>
      </div>
    );
  }

  // Split into running and stopped services
  const running = services.filter((s) => s.isRunning);
  const stopped = services.filter((s) => !s.isRunning);

  return (
    <div className="space-y-2">
      {running.length > 0 && (
        <div>
          <div className="px-2 py-1 text-xs text-text-muted uppercase tracking-wide">
            Running ({running.length})
          </div>
          <div>
            {running.map((service) => (
              <ServiceItem key={service.id} service={service} />
            ))}
          </div>
        </div>
      )}
      {stopped.length > 0 && (
        <div>
          <div className="px-2 py-1 text-xs text-text-muted uppercase tracking-wide">
            Stopped ({stopped.length})
          </div>
          <div>
            {stopped.map((service) => (
              <ServiceItem key={service.id} service={service} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
