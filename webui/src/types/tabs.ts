export type TabType =
  | "projects"
  | "project"
  | "project-settings"
  | "mission"
  | "file"
  | "folder"
  | "process"
  | "diff"
  | "settings"
  | "create-project"
  | "task"
  | "commit"
  | "review-commit"
  | "page"; // Generic page primitive type

export type SettingsPage = "account" | "api-keys" | "models" | "theme" | "shortcuts" | "experiments" | "about";

export interface Tab {
  id: string;
  type: TabType;
  label: string;
  icon?: string;
  data: TabData;
  dirty?: boolean;
  /** Preview tabs are temporary - replaced when opening another preview */
  preview?: boolean;
}

export type TabData =
  | { type: "projects" }
  | { type: "project"; projectId: string; projectName: string }
  | { type: "project-settings"; projectId: string; projectName: string }
  | { type: "mission"; missionId: string; projectId: string; missionTitle: string }
  | { type: "file"; path: string; projectId: string }
  | { type: "folder"; path: string; projectId: string }
  | { type: "process"; processId: string; projectId: string; label?: string }
  | { type: "diff"; path: string; projectId: string; base?: string }
  | { type: "settings"; page: SettingsPage }
  | { type: "create-project" }
  | { type: "task"; sessionId: string; projectId: string; title: string }
  | { type: "commit"; hash: string; projectId: string }
  | { type: "review-commit"; projectId: string }
  | {
      type: "page";
      pageId: string;
      params: Record<string, unknown>;
      search?: Record<string, unknown>;
      label: string;
      icon: string;
    };
