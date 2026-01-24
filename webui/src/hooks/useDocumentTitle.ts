import { useEffect } from "react";
import { useLocation } from "@tanstack/react-router";
import { matchPageRoute } from "@/primitives/registry";
import type { PageDefinition } from "@/primitives/types";

const APP_NAME = "Iris";

/**
 * Set the document title. Automatically appends " - Iris" suffix.
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
 * Get the document title for a page with its params.
 * Uses getTitle if defined, otherwise falls back to getLabel.
 */
export function getPageDocumentTitle(
  page: PageDefinition,
  params: unknown,
  search?: unknown
): string {
  if (page.getTitle) {
    return page.getTitle(params, search);
  }
  return page.getLabel(params, search);
}

/**
 * Hook that automatically sets document title based on current page route.
 * Should be called once at the app root level.
 */
export function useAutoDocumentTitle() {
  const location = useLocation();

  useEffect(() => {
    const searchParams = location.search
      ? new URLSearchParams(
          typeof location.search === "string"
            ? location.search
            : Object.entries(location.search)
                .map(([k, v]) => `${k}=${v}`)
                .join("&")
        )
      : undefined;

    const match = matchPageRoute(location.pathname, searchParams);

    if (match && match.parsedParams) {
      const title = getPageDocumentTitle(
        match.page,
        match.parsedParams,
        match.parsedSearch ?? undefined
      );
      document.title = `${title} - ${APP_NAME}`;
    } else {
      // Default title for non-page routes
      document.title = APP_NAME;
    }
  }, [location.pathname, location.search]);
}
