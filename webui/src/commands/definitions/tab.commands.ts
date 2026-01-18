import type { Command, ExecutionContext } from "../types";

export const tabCommands: Command[] = [
  {
    id: "tab.close",
    label: "Close Tab",
    description: "Close the current tab",
    category: "tab",
    shortcut: { key: "w", mod: true },
    when: (ctx) => ctx.activeTabId !== null,
    execute: (ctx) => {
      if (ctx.activeTabId) {
        ctx.tabActions.closeTab(ctx.activeTabId);
      }
    },
  },
  {
    id: "tab.closeAll",
    label: "Close All Tabs",
    description: "Close all open tabs",
    category: "tab",
    when: (ctx) => ctx.tabs.length > 0,
    execute: (ctx) => {
      ctx.tabActions.closeAllTabs();
    },
  },
  {
    id: "tab.closeOthers",
    label: "Close Other Tabs",
    description: "Close all tabs except the current one",
    category: "tab",
    when: (ctx) => ctx.tabs.length > 1 && ctx.activeTabId !== null,
    execute: (ctx) => {
      if (ctx.activeTabId) {
        ctx.tabActions.closeOtherTabs(ctx.activeTabId);
      }
    },
  },
  {
    id: "tab.next",
    label: "Next Tab",
    description: "Switch to the next tab",
    category: "tab",
    shortcut: { key: "]", mod: true, shift: true },
    when: (ctx) => ctx.tabs.length > 1,
    execute: (ctx) => {
      const currentIndex = ctx.tabs.findIndex((t) => t.id === ctx.activeTabId);
      if (currentIndex !== -1) {
        const nextIndex = (currentIndex + 1) % ctx.tabs.length;
        ctx.tabActions.setActiveTab(ctx.tabs[nextIndex].id);
      }
    },
  },
  {
    id: "tab.previous",
    label: "Previous Tab",
    description: "Switch to the previous tab",
    category: "tab",
    shortcut: { key: "[", mod: true, shift: true },
    when: (ctx) => ctx.tabs.length > 1,
    execute: (ctx) => {
      const currentIndex = ctx.tabs.findIndex((t) => t.id === ctx.activeTabId);
      if (currentIndex !== -1) {
        const prevIndex =
          currentIndex === 0 ? ctx.tabs.length - 1 : currentIndex - 1;
        ctx.tabActions.setActiveTab(ctx.tabs[prevIndex].id);
      }
    },
  },
  // Go to tab 1-9
  ...Array.from({ length: 9 }, (_, i): Command => ({
    id: `tab.goTo${i + 1}`,
    label: `Go to Tab ${i + 1}`,
    description: `Switch to tab ${i + 1}`,
    category: "tab",
    shortcut: { key: String(i + 1), mod: true },
    when: (ctx: ExecutionContext) => ctx.tabs.length > i,
    execute: (ctx: ExecutionContext) => {
      if (ctx.tabs[i]) {
        ctx.tabActions.setActiveTab(ctx.tabs[i].id);
      }
    },
  })),
];
