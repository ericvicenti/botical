import { createFileRoute } from "@tanstack/react-router";
import { cn } from "@/lib/utils/cn";
import { Beaker } from "lucide-react";

export const Route = createFileRoute("/settings/experiments")({
  component: ExperimentsPage,
});

function ExperimentsPage() {
  const experiments: Array<{
    id: string;
    name: string;
    description: string;
    enabled: boolean;
    onToggle: () => void;
  }> = [];

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-8">
      <div className="flex items-center gap-3 mb-2">
        <Beaker className="w-6 h-6 text-accent-primary" />
        <h1 className="text-2xl font-bold text-text-primary">Experiments</h1>
      </div>
      <p className="text-text-muted mb-8">
        Enable experimental features that are still in development. These may be unstable or change at any time.
      </p>

      {experiments.length === 0 ? (
        <div className="mt-6 rounded-lg border border-border bg-bg-secondary p-4 text-sm text-text-secondary">
          No experiments are available right now.
        </div>
      ) : (
        <div className="grid gap-4">
          {experiments.map((experiment) => (
            <button
              key={experiment.id}
              onClick={experiment.onToggle}
              className={cn(
                "flex items-center gap-4 p-4 rounded-lg border transition-colors text-left",
                experiment.enabled
                  ? "border-accent-primary bg-accent-primary/10"
                  : "border-border hover:border-text-muted"
              )}
            >
              <div className="flex-1">
                <div
                  className={cn(
                    "font-medium",
                    experiment.enabled ? "text-accent-primary" : "text-text-primary"
                  )}
                >
                  {experiment.name}
                </div>
                <div className="text-sm text-text-muted">{experiment.description}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
