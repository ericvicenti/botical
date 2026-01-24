/**
 * Git Query Definitions
 *
 * Queries for git operations.
 */

import { defineQuery } from "./define.ts";
import type { QueryContext } from "./types.ts";
import { getIdentityInfo } from "../services/identity.ts";

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
 *
 * Returns the SSH public key and instructions for adding it to git hosts.
 */
export const gitIdentityQuery = defineQuery<GitIdentity, void>({
  name: "git.identity",

  fetch: async (_params, _context: QueryContext) => {
    const identity = getIdentityInfo();

    return {
      ...identity,
      instructions: {
        github: `Add to GitHub: Settings → SSH and GPG keys → New SSH key\n\nKey:\n${identity.publicKey}`,
        gitlab: `Add to GitLab: Preferences → SSH Keys → Add new key\n\nKey:\n${identity.publicKey}`,
      },
    };
  },

  cache: {
    ttl: Infinity, // Identity doesn't change during session
    scope: "global",
    key: () => ["git.identity"],
  },

  description: "Get SSH key identity for git operations",
});
