/**
 * Git Query Definitions (Frontend)
 *
 * Queries for git operations.
 */

import type { Query } from "./types";

/**
 * Git identity information
 */
export interface GitIdentity {
  publicKey: string;
  fingerprint: string;
  keyPath: string;
  instructions: {
    github: string;
    gitlab: string;
  };
}

/**
 * Get git identity (SSH key info)
 */
export const gitIdentityQuery: Query<GitIdentity, void> = {
  name: "git.identity",
  endpoint: "/api/git/identity",
  method: "GET",
  cache: {
    ttl: Infinity, // Identity doesn't change during session
    scope: "global",
    key: () => ["git.identity"],
  },
  description: "Get SSH key identity for git operations",
};
