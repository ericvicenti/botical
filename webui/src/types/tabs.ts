export type TabType =
  | "projects"
  | "project"
  | "mission"
  | "file"
  | "process"
  | "diff"
  | "settings"
  | "create-project"
  | "task";

export interface Tab {
  id: string;
  type: TabType;
  label: string;
  icon?: string;
  data: TabData;
  dirty?: boolean;
}

export type TabData =
  | { type: "projects" }
  | { type: "project"; projectId: string; projectName: string }
  | { type: "mission"; missionId: string; projectId: string; missionTitle: string }
  | { type: "file"; path: string; projectId: string }
  | { type: "process"; processId: string; projectId: string; label?: string }
  | { type: "diff"; path: string; projectId: string; base?: string }
  | { type: "settings" }
  | { type: "create-project" }
  | { type: "task"; sessionId: string; projectId: string; title: string };
