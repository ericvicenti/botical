import { useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTabs } from "@/contexts/tabs";
import { getPage, getPageUrl, executeAction } from "./registry";
import type { ActionContext, ActionResult } from "./types";

/**
 * Options for opening a page
 */
interface OpenPageOptions {
  /** Whether to open as preview tab (default: true) */
  preview?: boolean;
  /** Search/query params to include in URL */
  search?: Record<string, unknown>;
}

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
      options: OpenPageOptions = { preview: true }
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

      // Validate search params if provided
      let validatedSearch: Record<string, unknown> | undefined;
      if (options.search && page.searchParams) {
        const searchParsed = page.searchParams.safeParse(options.search);
        if (searchParsed.success) {
          validatedSearch = searchParsed.data;
        } else {
          console.warn(`Invalid search params for page "${pageId}":`, searchParsed.error);
        }
      }

      // Generate the URL with search params
      const url = getPageUrl(pageId, parsed.data, validatedSearch);
      const label = page.getLabel(parsed.data, validatedSearch);

      // Open tab with search params
      const tabData = {
        type: "page" as const,
        pageId,
        params: parsed.data,
        search: validatedSearch,
        label,
        icon: page.icon,
      };

      if (options.preview !== false) {
        openPreviewTab(tabData);
      } else {
        openTab(tabData);
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
