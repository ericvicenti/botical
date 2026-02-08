import { useEffect } from "react";
import { useLocation } from "@tanstack/react-router";
import { useTabs } from "@/contexts/tabs";
import { parseUrlToTabData, generateTabId } from "@/lib/tabs";
import type { PageDefinition } from "@/primitives/types";

const APP_NAME = "Botical";

/**
 * Get the document title for a page.
 * Uses page.getTitle if available, otherwise falls back to page.getLabel.
 */
export function getPageDocumentTitle(
  page: PageDefinition,
  params: Record<string, unknown>,
  search?: Record<string, unknown>
): string {
  if (page.getTitle) {
    return page.getTitle(params, search);
  }
  return page.getLabel(params, search);
}

/**
 * Set the document title. Automatically appends " - Botical" suffix.
 */
export function useDocumentTitle(title?: string) {
  useEffect(() => {
    if (title) {
      document.title = `${title} - ${APP_NAME}`;
    } else {
      document.title = APP_NAME;
    }

    return () => {
      document.title = APP_NAME;
    };
  }, [title]);
}

/**
 * Hook that automatically sets document title based on the active tab.
 *
 * This ensures the document title always matches the tab label, even when
 * the tab label is updated dynamically (e.g., after loading workflow data).
 *
 * Should be called once at the app root level.
 */
export function useAutoDocumentTitle() {
  const location = useLocation();
  const { tabs } = useTabs();

  useEffect(() => {
    // Parse the current URL to get tab data
    const currentTabData = parseUrlToTabData(location.pathname, location.search?.toString());

    if (!currentTabData) {
      document.title = APP_NAME;
      return;
    }

    // Generate the tab ID for the current URL
    const currentTabId = generateTabId(currentTabData.data);

    // Find the matching tab in our tabs list (which may have an updated label)
    const matchingTab = tabs.find(t => t.id === currentTabId);

    // Use the tab's label if found, otherwise fall back to the parsed label
    const title = matchingTab?.label || currentTabData.label;

    document.title = `${title} - ${APP_NAME}`;
  }, [location.pathname, location.search, tabs]);
}
