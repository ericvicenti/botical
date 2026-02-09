import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/auth";
import { cn } from "@/lib/utils/cn";
import { Save, Check, LogOut, Mail, User as UserIcon } from "lucide-react";

interface AccountPageProps {
  params: Record<string, never>;
  search?: unknown;
}

export default function AccountPage(_props: AccountPageProps) {
  const { user, logout, updateProfile, mode } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName || "");
    }
  }, [user]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateProfile({ displayName: displayName.trim() || undefined });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error("Failed to update profile:", err);
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = (displayName.trim() || "") !== (user?.displayName || "");

  return (
    <div className="max-w-2xl mx-auto p-8">
      <h1 className="text-2xl font-bold text-text-primary mb-2">Account</h1>
      <p className="text-text-muted mb-8">
        Manage your account settings.
      </p>

      <div className="space-y-6">
        {/* Email (read-only) */}
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1">
            Email
          </label>
          <div className="flex items-center gap-2">
            <Mail className="w-4 h-4 text-text-muted" />
            <span className="text-text-primary">{user?.email || "—"}</span>
          </div>
        </div>

        {/* Display Name */}
        {mode === "multi-user" && (
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">
              Display Name
            </label>
            <div className="relative">
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Enter your name"
                className={cn(
                  "w-full px-3 py-2 bg-bg-secondary border border-border rounded-lg",
                  "text-text-primary placeholder:text-text-muted",
                  "focus:outline-none focus:border-accent-primary",
                  "text-sm"
                )}
                data-testid="display-name-input"
              />
            </div>
          </div>
        )}

        {/* Save */}
        {mode === "multi-user" && (
          <div className="flex items-center gap-4">
            <button
              onClick={handleSave}
              disabled={saving || !hasChanges}
              className={cn(
                "px-6 py-2.5 rounded-lg font-medium",
                "flex items-center gap-2 transition-colors",
                "bg-accent-primary text-white hover:bg-accent-primary/90",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
              data-testid="save-profile-button"
            >
              {saving ? (
                <>Saving...</>
              ) : saved ? (
                <>
                  <Check className="w-4 h-4" />
                  Saved!
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save
                </>
              )}
            </button>
          </div>
        )}

        {/* Divider */}
        <div className="border-t border-border" />

        {/* Logout */}
        {mode === "multi-user" && (
          <div>
            <button
              onClick={logout}
              className={cn(
                "px-6 py-2.5 rounded-lg font-medium",
                "flex items-center gap-2 transition-colors",
                "bg-red-500/10 text-red-600 dark:text-red-400",
                "hover:bg-red-500/20"
              )}
              data-testid="logout-button"
            >
              <LogOut className="w-4 h-4" />
              Log Out
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
