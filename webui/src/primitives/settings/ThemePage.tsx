import { useUI, type ThemePreference } from "@/contexts/ui";
import { cn } from "@/lib/utils/cn";
import { Sun, Moon, Monitor, Check } from "lucide-react";

interface ThemePageProps {
  params: Record<string, never>;
  search?: unknown;
}

export default function ThemePage(_props: ThemePageProps) {
  const { theme, resolvedTheme, setTheme } = useUI();

  const themes: { id: ThemePreference; label: string; icon: typeof Moon; description: string }[] = [
    { id: "system", label: "System", icon: Monitor, description: "Automatically match your operating system" },
    { id: "dark", label: "Dark", icon: Moon, description: "Easy on the eyes, perfect for night coding" },
    { id: "light", label: "Light", icon: Sun, description: "Bright and clean for daytime use" },
  ];

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-8">
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
              <Check className="w-5 h-5 text-accent-primary" />
            )}
          </button>
        ))}
      </div>

      {theme === "system" && (
        <div className="mt-6 p-4 bg-bg-secondary rounded-lg border border-border">
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            {resolvedTheme === "dark" ? (
              <Moon className="w-4 h-4" />
            ) : (
              <Sun className="w-4 h-4" />
            )}
            <span>
              Currently using <strong>{resolvedTheme}</strong> theme based on your system settings
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
