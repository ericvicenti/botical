import { useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTabs } from "@/contexts/tabs";
import type { TabData } from "@/types/tabs";
import { getPage, getPageUrl, executeAction } from "./registry";
import type { ActionContext, ActionResult } from "./types";

/**
 * Hook to open pages using the primitives system
 *
 * Pages open as preview (italic) by default.
 * Use pin: true to open as permanent tab.
 */
export function usePageOpener() {
  const { openPreviewTab, openTab } = useTabs();
  const navigate = useNavigate();

  /**
   * Open a page by its primitive ID
   *
   * @param pageId - The page ID (e.g., "git.commit-view")
   * @param params - Page parameters
   * @param options - Opening options
   */
  const openPage = useCallback(
    (
      pageId: string,
      params: Record<string, unknown>,
      options: { pin?: boolean } = {}
    ) => {
      const page = getPage(pageId);
      if (!page) {
        console.error(`Page "${pageId}" not found`);
        return;
      }

      // Validate params
      const parsed = page.params.safeParse(params);
      if (!parsed.success) {
        console.error(`Invalid page params:`, parsed.error);
        return;
      }

      // Generate the URL
      const url = getPageUrl(pageId, parsed.data);

      // Convert to TabData format
      // For now, we need to bridge to the existing tab system
      const tabData = pageParamsToTabData(pageId, parsed.data);
      if (!tabData) {
        // Fallback: just navigate
        navigate({ to: url });
        return;
      }

      // Open tab (preview by default)
      if (options.pin) {
        openTab(tabData);
      } else {
        openPreviewTab(tabData);
      }

      // Navigate to the page
      navigate({ to: url });
    },
    [openPreviewTab, openTab, navigate]
  );

  return { openPage };
}

/**
 * Convert page primitive params to existing TabData format
 * This is a bridge until we fully migrate the tab system
 */
function pageParamsToTabData(
  pageId: string,
  params: Record<string, unknown>
): TabData | null {
  switch (pageId) {
    case "git.commit-view":
      return {
        type: "commit",
        projectId: params.projectId as string,
        hash: params.hash as string,
      };
    case "git.review-commit":
      return {
        type: "review-commit",
        projectId: params.projectId as string,
      };
    default:
      return null;
  }
}

/**
 * Hook to execute actions from GUI
 *
 * Handles toasts for success/error and page opening.
 */
export function useActionExecutor() {
  const { openPage } = usePageOpener();

  const execute = useCallback(
    async (
      actionId: string,
      params: unknown,
      options: { projectId?: string } = {}
    ): Promise<ActionResult> => {
      const ctx: ActionContext = {
        surface: "gui",
        projectId: options.projectId,
      };

      const result = await executeAction(actionId, params, ctx);

      // Handle result
      switch (result.type) {
        case "success":
          // TODO: Show success toast
          console.log(`Action success: ${result.message}`);
          break;
        case "error":
          // TODO: Show error toast
          console.error(`Action error: ${result.message}`);
          alert(result.message); // Temporary until we have toast system
          break;
        case "page":
          openPage(result.pageId, result.params, { pin: true });
          break;
      }

      return result;
    },
    [openPage]
  );

  return { execute };
}
