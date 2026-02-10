import { cn } from "@/lib/utils/cn";
import { useNavigate, useLocation } from "@tanstack/react-router";
import { useUI } from "@/contexts/ui";
import { Key, Palette, Keyboard, Beaker, Info, User } from "lucide-react";
import type { SettingsPage } from "@/types/tabs";

interface SettingsItem {
  id: SettingsPage;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  path: string;
}

const SETTINGS_ITEMS: SettingsItem[] = [
  { id: "account", label: "Account", icon: User, path: "/settings/account" },
  { id: "models", label: "Model Providers", icon: Key, path: "/settings/models" },
  { id: "theme", label: "Theme", icon: Palette, path: "/settings/theme" },
  { id: "shortcuts", label: "Keyboard Shortcuts", icon: Keyboard, path: "/settings/shortcuts" },
  { id: "experiments", label: "Experiments", icon: Beaker, path: "/settings/experiments" },
  { id: "about", label: "About", icon: Info, path: "/settings/about" },
];

export function SettingsPanel() {
  const navigate = useNavigate();
  const location = useLocation();
  const { closeSidebarOnMobile } = useUI();

  const handleItemClick = (item: SettingsItem) => {
    navigate({ to: item.path });
    closeSidebarOnMobile();
  };

  return (
    <div className="h-full flex flex-col">
      <div className="px-2 py-1 border-b border-border">
        <div className="text-xs font-medium text-text-secondary uppercase tracking-wide">
          Settings
        </div>
      </div>
      <div className="flex-1 overflow-auto py-1">
        {SETTINGS_ITEMS.map((item) => {
          const isActive = location.pathname === item.path ||
            (location.pathname === "/settings" && item.id === "account");
          return (
            <button
              key={item.id}
              onClick={() => handleItemClick(item)}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2 text-left",
                "hover:bg-bg-elevated transition-colors",
                "text-sm",
                isActive
                  ? "text-text-primary bg-bg-elevated"
                  : "text-text-secondary"
              )}
            >
              <item.icon className="w-4 h-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
