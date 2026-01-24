import { useMemo } from "react";
import { useParams, useSearch, useLocation } from "@tanstack/react-router";
import { getPage, matchPageRoute } from "@/primitives/registry";
import { useDocumentTitle, getPageDocumentTitle } from "@/hooks/useDocumentTitle";

interface PageWrapperProps {
  /** Page ID to render */
  pageId: string;
  /** Optional fallback component for error states */
  fallback?: React.ReactNode;
}

/**
 * PageWrapper - Renders a page from the primitives registry
 *
 * This component:
 * 1. Looks up the page definition from the registry
 * 2. Parses and validates route params and search params
 * 3. Sets the document title
 * 4. Renders the page component with typed params
 *
 * Usage in route files:
 * ```tsx
 * export const Route = createFileRoute("/projects/$projectId/commit")({
 *   component: () => <PageWrapper pageId="git.review-commit" />,
 * });
 * ```
 */
export function PageWrapper({ pageId, fallback }: PageWrapperProps) {
  const page = getPage(pageId);
  const routeParams = useParams({ strict: false });
  const routeSearch = useSearch({ strict: false });

  // Parse params and search from the current route
  const { parsedParams, parsedSearch } = useMemo(() => {
    if (!page) {
      return { parsedParams: null, parsedSearch: null };
    }

    // Parse path params
    const parsedParams = page.parseParams(routeParams as Record<string, string>);

    // Parse search params if supported
    let parsedSearch: Record<string, unknown> | null = null;
    if (page.parseSearchParams && page.searchParams) {
      const searchObj: Record<string, string | string[] | undefined> = {};
      if (typeof routeSearch === "object" && routeSearch !== null) {
        for (const [key, value] of Object.entries(routeSearch as Record<string, unknown>)) {
          if (typeof value === "string") {
            searchObj[key] = value;
          } else if (Array.isArray(value)) {
            searchObj[key] = (value as unknown[]).filter(
              (v): v is string => typeof v === "string"
            );
          }
        }
      }
      parsedSearch = page.parseSearchParams(searchObj);
    }

    return { parsedParams, parsedSearch };
  }, [page, routeParams, routeSearch]);

  // Set document title
  const title = useMemo(() => {
    if (!page || !parsedParams) return undefined;
    return getPageDocumentTitle(page, parsedParams, parsedSearch ?? undefined);
  }, [page, parsedParams, parsedSearch]);

  useDocumentTitle(title);

  // Handle page not found
  if (!page) {
    console.error(`PageWrapper: Page "${pageId}" not found in registry`);
    if (fallback) return <>{fallback}</>;
    return (
      <div className="p-4 text-text-secondary">
        Page not found: {pageId}
      </div>
    );
  }

  // Handle invalid params
  if (!parsedParams) {
    console.error(`PageWrapper: Failed to parse params for page "${pageId}"`, routeParams);
    if (fallback) return <>{fallback}</>;
    return (
      <div className="p-4 text-text-secondary">
        Invalid page parameters
      </div>
    );
  }

  // Render the page component
  const Component = page.component;
  return <Component params={parsedParams} search={parsedSearch ?? undefined} />;
}

/**
 * Hook to get the current page from the URL
 */
export function useCurrentPage() {
  const location = useLocation();

  return useMemo(() => {
    const searchParams = location.search
      ? new URLSearchParams(
          typeof location.search === "string"
            ? location.search
            : Object.entries(location.search as Record<string, string>)
                .map(([k, v]) => `${k}=${v}`)
                .join("&")
        )
      : undefined;

    return matchPageRoute(location.pathname, searchParams);
  }, [location.pathname, location.search]);
}
