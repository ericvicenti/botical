import { createFileRoute } from "@tanstack/react-router";
import { useUI } from "@/contexts/ui";
import { cn } from "@/lib/utils/cn";
import { Sun, Moon, Monitor } from "lucide-react";

export const Route = createFileRoute("/settings/theme")({
  component: ThemePage,
});

function ThemePage() {
  const { theme, setTheme } = useUI();

  const themes = [
    { id: "dark", label: "Dark", icon: Moon, description: "Easy on the eyes, perfect for night coding" },
    { id: "light", label: "Light", icon: Sun, description: "Bright and clean for daytime use" },
  ] as const;

  return (
    <div className="max-w-2xl mx-auto p-8">
      <h1 className="text-2xl font-bold text-text-primary mb-2">Theme</h1>
      <p className="text-text-muted mb-8">
        Choose your preferred color theme for the interface.
      </p>

      <div className="grid gap-4">
        {themes.map((t) => (
          <button
            key={t.id}
            onClick={() => setTheme(t.id)}
            className={cn(
              "flex items-center gap-4 p-4 rounded-lg border transition-colors text-left",
              theme === t.id
                ? "border-accent-primary bg-accent-primary/10"
                : "border-border hover:border-text-muted"
            )}
          >
            <div className={cn(
              "w-12 h-12 rounded-lg flex items-center justify-center",
              theme === t.id ? "bg-accent-primary/20" : "bg-bg-secondary"
            )}>
              <t.icon className={cn(
                "w-6 h-6",
                theme === t.id ? "text-accent-primary" : "text-text-secondary"
              )} />
            </div>
            <div className="flex-1">
              <div className={cn(
                "font-medium",
                theme === t.id ? "text-accent-primary" : "text-text-primary"
              )}>
                {t.label}
              </div>
              <div className="text-sm text-text-muted">{t.description}</div>
            </div>
            {theme === t.id && (
              <div className="w-2 h-2 rounded-full bg-accent-primary" />
            )}
          </button>
        ))}
      </div>

      <div className="mt-8 p-4 bg-bg-secondary rounded-lg border border-border">
        <div className="flex items-center gap-2 text-sm text-text-muted">
          <Monitor className="w-4 h-4" />
          <span>System theme preference support coming soon</span>
        </div>
      </div>
    </div>
  );
}
