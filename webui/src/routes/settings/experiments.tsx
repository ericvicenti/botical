import { createFileRoute } from "@tanstack/react-router";
import { useSettings, useSaveSettings } from "@/lib/api/queries";
import { cn } from "@/lib/utils/cn";
import { Beaker, Server, Check } from "lucide-react";

export const Route = createFileRoute("/settings/experiments")({
  component: ExperimentsPage,
});

function ExperimentsPage() {
  const { data: settings } = useSettings();
  const saveSettings = useSaveSettings();

  const handleToggleExe = () => {
    if (!settings) return;
    saveSettings.mutate({
      ...settings,
      exeEnabled: !settings.exeEnabled,
    });
  };

  const experiments = [
    {
      id: "exe",
      name: "exe.dev VMs",
      description: "Manage lightweight virtual machines from exe.dev directly in Iris. Create, delete, and run commands in cloud VMs.",
      icon: Server,
      enabled: settings?.exeEnabled ?? false,
      onToggle: handleToggleExe,
    },
  ];

  return (
    <div className="max-w-2xl mx-auto p-8">
      <div className="flex items-center gap-3 mb-2">
        <Beaker className="w-6 h-6 text-accent-primary" />
        <h1 className="text-2xl font-bold text-text-primary">Experiments</h1>
      </div>
      <p className="text-text-muted mb-8">
        Enable experimental features that are still in development. These may be unstable or change at any time.
      </p>

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
            <div
              className={cn(
                "w-12 h-12 rounded-lg flex items-center justify-center",
                experiment.enabled ? "bg-accent-primary/20" : "bg-bg-secondary"
              )}
            >
              <experiment.icon
                className={cn(
                  "w-6 h-6",
                  experiment.enabled ? "text-accent-primary" : "text-text-secondary"
                )}
              />
            </div>
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
            {experiment.enabled && <Check className="w-5 h-5 text-accent-primary" />}
          </button>
        ))}
      </div>

      <div className="mt-8 p-4 bg-bg-secondary rounded-lg border border-border">
        <div className="text-sm text-text-secondary">
          <strong>Note:</strong> Experimental features may require additional setup. For exe.dev,
          you'll need an active account and SSH key configured. Run{" "}
          <code className="px-1 py-0.5 bg-bg-primary rounded text-text-primary">ssh exe.dev</code>{" "}
          in your terminal to get started.
        </div>
      </div>
    </div>
  );
}
