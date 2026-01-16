/**
 * ID Generation Utilities
 *
 * Generates unique, sortable IDs with type prefixes.
 * See: docs/knowledge-base/04-patterns.md#id-generation-patterns
 * See: docs/knowledge-base/02-data-model.md#id-generation-strategies
 *
 * Two ordering strategies for different use cases:
 * - Descending: Newest first when sorted alphabetically (sessions, projects)
 * - Ascending: Chronological order (messages, parts, file versions)
 *
 * Format: {prefix}_{timestamp_base36}-{random_8chars}
 * Example: "sess_2r1hf9qj3-a1b2c3d4" (descending session ID)
 */

interface GenerateIdOptions {
  /**
   * If true, generates descending IDs (newest first when sorted alphabetically)
   * Uses MAX_SAFE_INTEGER - timestamp for the time component
   */
  descending?: boolean;
}

/**
 * Generates a unique ID with the given prefix
 *
 * @param prefix - The entity type prefix (e.g., 'sess', 'msg', 'usr')
 * @param options - Options for ID generation
 * @returns A unique ID string
 *
 * @example
 * // Ascending (chronological order)
 * generateId('msg') // => "msg_m1abc123-4def5678"
 *
 * // Descending (newest first)
 * generateId('sess', { descending: true }) // => "sess_2r1abc123-4def5678"
 */
export function generateId(
  prefix: string,
  options: GenerateIdOptions = {}
): string {
  const timestamp = options.descending
    ? Number.MAX_SAFE_INTEGER - Date.now()
    : Date.now();

  const random = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  return `${prefix}_${timestamp.toString(36)}-${random}`;
}

/**
 * Validates that an ID has the expected prefix
 *
 * @param id - The ID to validate
 * @param prefix - The expected prefix
 * @returns True if the ID is valid for the given prefix
 */
export function isValidId(id: string, prefix: string): boolean {
  if (!id || typeof id !== "string") {
    return false;
  }

  const regex = new RegExp(`^${prefix}_[a-z0-9]+-[a-z0-9]+$`);
  return regex.test(id);
}

/**
 * Parses an ID into its components
 *
 * @param id - The ID to parse
 * @returns The parsed components or null if invalid
 */
export function parseId(id: string): {
  prefix: string;
  timestamp: string;
  random: string;
} | null {
  const match = id.match(/^([a-z]+)_([a-z0-9]+)-([a-z0-9]+)$/);
  if (!match) {
    return null;
  }

  const [, prefix, timestamp, random] = match;
  if (!prefix || !timestamp || !random) {
    return null;
  }

  return { prefix, timestamp, random };
}

/**
 * Extracts the timestamp from an ID (if it was generated with ascending mode)
 *
 * @param id - The ID to extract timestamp from
 * @returns The timestamp in milliseconds or null if invalid
 */
export function getTimestampFromId(id: string): number | null {
  const parsed = parseId(id);
  if (!parsed) {
    return null;
  }

  const timestamp = parseInt(parsed.timestamp, 36);
  if (isNaN(timestamp)) {
    return null;
  }

  return timestamp;
}

/**
 * Common ID prefixes used throughout the application
 */
export const IdPrefixes = {
  user: "usr",
  project: "prj",
  session: "sess",
  message: "msg",
  part: "part",
  agent: "agt",
  tool: "tool",
  file: "file",
  version: "ver",
  snapshot: "snap",
  apiKey: "key",
  permission: "perm",
  todo: "todo",
  mission: "msn",
  task: "task",
  process: "proc",
  // Auth-related prefixes
  emailToken: "emltkn",
  authSession: "authsess",
  providerCredential: "cred",
} as const;

export type IdPrefix = (typeof IdPrefixes)[keyof typeof IdPrefixes];
