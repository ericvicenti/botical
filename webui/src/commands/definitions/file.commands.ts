import type { Command } from "../types";

export const fileCommands: Command[] = [
  {
    id: "file.create",
    label: "Create File",
    description: "Create a new file in the current project",
    category: "file",
    when: (ctx) => ctx.selectedProjectId !== null,
    args: [
      {
        name: "path",
        type: "string",
        label: "File Path",
        placeholder: "Enter file path (e.g., src/utils/helper.ts)",
        required: true,
      },
    ],
    execute: async (ctx, args) => {
      const path = args.path as string;
      if (!path || !ctx.selectedProjectId) return;

      ctx.tabActions.openTab({
        type: "file",
        projectId: ctx.selectedProjectId,
        path,
      });
    },
  },
  {
    id: "file.save",
    label: "Save File",
    description: "Save the current file",
    category: "file",
    shortcut: { key: "s", mod: true },
    when: (ctx) => {
      const activeTab = ctx.tabs.find((t) => t.id === ctx.activeTabId);
      return activeTab?.type === "file" && activeTab.dirty === true;
    },
    execute: async () => {
      // File saving will be handled by the file editor component
      // This command triggers the save event
      window.dispatchEvent(new CustomEvent("iris:file:save"));
    },
  },
  {
    id: "file.delete",
    label: "Delete File",
    description: "Delete the current file",
    category: "file",
    when: (ctx) => {
      const activeTab = ctx.tabs.find((t) => t.id === ctx.activeTabId);
      return activeTab?.type === "file";
    },
    execute: async (ctx) => {
      const activeTab = ctx.tabs.find((t) => t.id === ctx.activeTabId);
      if (activeTab?.type === "file") {
        // File deletion would be handled via API
        // For now, just close the tab
        ctx.tabActions.closeTab(activeTab.id);
      }
    },
  },
];
