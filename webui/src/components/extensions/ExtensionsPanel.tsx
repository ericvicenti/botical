/**
 * ExtensionsPanel Component
 *
 * Lists all available extensions and allows enabling/disabling them per project.
 * Clicking on an extension shows detailed information including status, logs, and actions.
 * Shown in the sidebar when the Extensions panel is selected.
 */

import { useState } from "react";
import { useExtensions, useProjectExtensions, useToggleExtension } from "@/lib/api/extensions";
import { ExtensionCard } from "./ExtensionCard";
import { ExtensionDetailView } from "./ExtensionDetailView";
import type { Extension } from "@/lib/api/types";

interface ExtensionsPanelProps {
  projectId: string;
}

export function ExtensionsPanel({ projectId }: ExtensionsPanelProps) {
  const [selectedExtension, setSelectedExtension] = useState<Extension | null>(null);
  const { data: extensions, isLoading: extensionsLoading } = useExtensions();
  const { data: projectExtensions, isLoading: projectExtensionsLoading } = useProjectExtensions(projectId);
  const toggleExtension = useToggleExtension();

  const isLoading = extensionsLoading || projectExtensionsLoading;
  const enabledExtensions = projectExtensions?.enabled || [];

  const handleToggle = (extensionId: string, enabled: boolean) => {
    toggleExtension.mutate({
      projectId,
      extensionId,
      enabled,
    });
  };

  const handleSelectExtension = (extension: Extension) => {
    setSelectedExtension(extension);
  };

  const handleBack = () => {
    setSelectedExtension(null);
  };

  if (isLoading) {
    return (
      <div className="h-full flex flex-col" data-testid="extensions-panel">
        <div className="px-2 py-1 border-b border-border">
          <div className="text-xs font-medium text-text-secondary uppercase tracking-wide">
            Extensions
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-sm text-text-muted">Loading extensions...</div>
        </div>
      </div>
    );
  }

  // Show detail view if an extension is selected
  if (selectedExtension) {
    // Get the latest data for the selected extension
    const latestExtension = extensions?.find((e) => e.id === selectedExtension.id) || selectedExtension;
    const isEnabled = enabledExtensions.includes(latestExtension.id);

    return (
      <ExtensionDetailView
        extension={latestExtension}
        enabled={isEnabled}
        onBack={handleBack}
      />
    );
  }

  return (
    <div className="h-full flex flex-col" data-testid="extensions-panel">
      <div className="px-2 py-1 border-b border-border">
        <div className="text-xs font-medium text-text-secondary uppercase tracking-wide">
          Extensions
        </div>
      </div>
      <div className="flex-1 overflow-auto py-1">
        {extensions && extensions.length > 0 ? (
          extensions.map((extension) => (
            <ExtensionCard
              key={extension.id}
              extension={extension}
              enabled={enabledExtensions.includes(extension.id)}
              onToggle={(enabled) => handleToggle(extension.id, enabled)}
              onSelect={() => handleSelectExtension(extension)}
              isToggling={toggleExtension.isPending}
            />
          ))
        ) : (
          <div className="px-3 py-4 text-sm text-text-muted text-center">
            No extensions available
          </div>
        )}
      </div>
    </div>
  );
}
