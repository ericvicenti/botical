import type { Command, ExecutionContext } from "../types";
import type { Tab } from "@/types/tabs";
import { getTabRoute } from "@/lib/tabs";

function navigateToTab(ctx: ExecutionContext, tab: Tab) {
  ctx.tabActions.setActiveTab(tab.id);
  const route = getTabRoute(tab);
  ctx.navigate({ to: route.to, params: route.params });
}

export const tabCommands: Command[] = [
  {
    id: "tab.close",
    label: "Close Tab",
    description: "Close the current tab",
    category: "tab",
    shortcut: { key: "w", ctrl: true },
    when: (ctx) => ctx.activeTabId !== null,
    execute: (ctx) => {
      if (ctx.activeTabId) {
        const currentIndex = ctx.tabs.findIndex((t) => t.id === ctx.activeTabId);
        ctx.tabActions.closeTab(ctx.activeTabId);

        // Navigate to the next tab or home if no tabs left
        const remainingTabs = ctx.tabs.filter((t) => t.id !== ctx.activeTabId);
        if (remainingTabs.length > 0) {
          const newIndex = Math.min(currentIndex, remainingTabs.length - 1);
          const newTab = remainingTabs[newIndex];
          navigateToTab(ctx, newTab);
        } else {
          ctx.navigate({ to: "/" });
        }
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
    shortcut: { key: "]", alt: true },
    when: (ctx) => ctx.tabs.length > 1,
    execute: (ctx) => {
      const currentIndex = ctx.tabs.findIndex((t) => t.id === ctx.activeTabId);
      if (currentIndex !== -1) {
        const nextIndex = (currentIndex + 1) % ctx.tabs.length;
        navigateToTab(ctx, ctx.tabs[nextIndex]);
      }
    },
  },
  {
    id: "tab.previous",
    label: "Previous Tab",
    description: "Switch to the previous tab",
    category: "tab",
    shortcut: { key: "[", alt: true },
    when: (ctx) => ctx.tabs.length > 1,
    execute: (ctx) => {
      const currentIndex = ctx.tabs.findIndex((t) => t.id === ctx.activeTabId);
      if (currentIndex !== -1) {
        const prevIndex =
          currentIndex === 0 ? ctx.tabs.length - 1 : currentIndex - 1;
        navigateToTab(ctx, ctx.tabs[prevIndex]);
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
        navigateToTab(ctx, ctx.tabs[i]);
      }
    },
  })),
];
