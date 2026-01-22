import { z } from "zod";
import { definePage } from "../registry";

// Import the page components (we'll refactor these)
import ReviewCommitPageComponent from "./ReviewCommitPage";
import CommitViewPageComponent from "./CommitViewPage";

/**
 * Page: Review Commit
 *
 * Shows uncommitted changes and allows creating a commit.
 */
export const reviewCommitPage = definePage({
  id: "git.review-commit",
  icon: "git-commit",
  label: (_params) => "Review Commit",
  description: "Review changes and create a commit",

  params: z.object({
    projectId: z.string(),
  }),

  route: "/projects/$projectId/commit",

  getRouteParams: (params) => ({
    projectId: params.projectId,
  }),

  parseRouteParams: (routeParams) => ({
    projectId: routeParams.projectId,
  }),

  actions: ["git.createCommit"],

  component: ReviewCommitPageComponent,
});

/**
 * Page: Commit View
 *
 * Shows details of a specific commit including files changed and diffs.
 */
export const commitViewPage = definePage({
  id: "git.commit-view",
  icon: "git-commit",
  label: (params) => params.hash.substring(0, 7),
  description: "View commit details and changes",

  params: z.object({
    projectId: z.string(),
    hash: z.string(),
  }),

  route: "/projects/$projectId/commits/$hash",

  getRouteParams: (params) => ({
    projectId: params.projectId,
    hash: params.hash,
  }),

  parseRouteParams: (routeParams) => ({
    projectId: routeParams.projectId,
    hash: routeParams.hash,
  }),

  component: CommitViewPageComponent,
});
