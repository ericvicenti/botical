import { useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTabs } from "@/contexts/tabs";
import { getPage, getPageUrl, executeAction } from "./registry";
import type { ActionContext, ActionResult } from "./types";

/**
 * Hook to open pages using the primitives system
 *
 * Pages open as preview (italic) by default.
 * Use preview: false to open as permanent tab.
 */
export function usePageOpener() {
  const { openPreviewTab, openTab } = useTabs();
  const navigate = useNavigate();

  const openPage = useCallback(
    <TParams extends Record<string, unknown>>(
      pageId: string,
      params: TParams,
      options: { preview?: boolean } = { preview: true }
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
      const label = page.getLabel(parsed.data);

      // Open tab
      if (options.preview !== false) {
        openPreviewTab({
          type: "page" as const,
          pageId,
          params: parsed.data,
          label,
          icon: page.icon,
        });
      } else {
        openTab({
          type: "page" as const,
          pageId,
          params: parsed.data,
          label,
          icon: page.icon,
        });
      }

      // Navigate
      navigate({ to: url });
    },
    [openPreviewTab, openTab, navigate]
  );

  return { openPage };
}

/**
 * Hook to execute actions from GUI
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

      // Handle navigation results
      if (result.type === "navigate") {
        openPage(result.pageId, result.params, { preview: false });
      }

      return result;
    },
    [openPage]
  );

  return { execute };
}
