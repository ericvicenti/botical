import { z } from "zod";
import { definePage } from "../registry";
import FileViewPage from "./FileViewPage";
import FolderViewPage from "./FolderViewPage";

/**
 * File search params schema
 */
const fileSearchParams = z.object({
  commit: z.string().optional(),
});

/**
 * Page: File View
 *
 * Shows a code editor for viewing/editing files.
 * Note: This page uses a splat route (/files/$) so it can't be directly
 * matched by the registry. The route file parses the splat and passes params.
 */
export const fileViewPage = definePage({
  id: "file.view",
  icon: "file-code",
  category: "file",
  description: "View and edit a file",

  getLabel: (params) => {
    // Show just the filename
    const parts = params.path.split("/");
    return parts[parts.length - 1] || "File";
  },

  getTitle: (params) => {
    const parts = params.path.split("/");
    return parts[parts.length - 1] || "File";
  },

  params: z.object({
    projectId: z.string(),
    path: z.string(),
  }),

  // Note: This route pattern won't be matched by the registry for splat routes
  // The route file handles splat parsing and passes params directly
  route: "/projects/$projectId/files/$path",

  parseParams: (routeParams) => ({
    projectId: routeParams.projectId || "",
    path: routeParams.path || "",
  }),

  getRouteParams: (params) => ({
    projectId: params.projectId,
    path: params.path,
  }),

  searchParams: fileSearchParams,

  parseSearchParams: (search) => ({
    commit: typeof search.commit === "string" ? search.commit : undefined,
  }),

  getSearchParams: (search) => {
    const searchTyped = search as z.infer<typeof fileSearchParams>;
    const result: Record<string, string> = {};
    if (searchTyped.commit) result.commit = searchTyped.commit;
    return result;
  },

  component: FileViewPage,
});

/**
 * Page: Folder View
 *
 * Shows a folder browser for navigating directories.
 * Note: This page uses a splat route (/folders/$) so it can't be directly
 * matched by the registry. The route file parses the splat and passes params.
 */
export const folderViewPage = definePage({
  id: "folder.view",
  icon: "folder",
  category: "file",
  description: "Browse a folder",

  getLabel: (params) => {
    if (!params.path) return "Root";
    const parts = params.path.split("/");
    return parts[parts.length - 1] || "Folder";
  },

  getTitle: (params) => {
    if (!params.path) return "Root";
    const parts = params.path.split("/");
    return parts[parts.length - 1] || "Folder";
  },

  params: z.object({
    projectId: z.string(),
    path: z.string(),
  }),

  // Note: This route pattern won't be matched by the registry for splat routes
  route: "/projects/$projectId/folders/$path",

  parseParams: (routeParams) => ({
    projectId: routeParams.projectId || "",
    path: routeParams.path || "",
  }),

  getRouteParams: (params) => ({
    projectId: params.projectId,
    path: params.path,
  }),

  searchParams: fileSearchParams,

  parseSearchParams: (search) => ({
    commit: typeof search.commit === "string" ? search.commit : undefined,
  }),

  getSearchParams: (search) => {
    const searchTyped = search as z.infer<typeof fileSearchParams>;
    const result: Record<string, string> = {};
    if (searchTyped.commit) result.commit = searchTyped.commit;
    return result;
  },

  component: FolderViewPage,
});
