export type TabType =
  | "project"
  | "mission"
  | "file"
  | "process"
  | "diff"
  | "settings";

export interface Tab {
  id: string;
  type: TabType;
  label: string;
  icon?: string;
  data: TabData;
  dirty?: boolean;
}

export type TabData =
  | { type: "project"; projectId: string; projectName: string }
  | { type: "mission"; missionId: string; projectId: string; missionTitle: string }
  | { type: "file"; path: string; projectId: string }
  | { type: "process"; processId: string; projectId: string }
  | { type: "diff"; path: string; projectId: string; base?: string }
  | { type: "settings" };
