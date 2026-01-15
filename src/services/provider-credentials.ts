/**
 * Provider Credentials Service
 *
 * Manages encrypted storage of user's AI provider API keys.
 * See: docs/knowledge-base/04-patterns.md
 *
 * Supported providers:
 * - openai (OpenAI)
 * - anthropic (Anthropic/Claude)
 * - google (Google AI / Gemini)
 */

import { z } from "zod";
import { DatabaseManager } from "../database/manager.ts";
import { generateId, IdPrefixes } from "../utils/id.ts";
import { encrypt, decrypt } from "./crypto.ts";
import { NotFoundError, ConflictError } from "../utils/errors.ts";

/**
 * Supported AI providers
 */
export const SUPPORTED_PROVIDERS = ["openai", "anthropic", "google"] as const;
export type Provider = (typeof SUPPORTED_PROVIDERS)[number];

/**
 * Schema for creating a provider credential
 */
export const ProviderCredentialCreateSchema = z.object({
  provider: z.enum(SUPPORTED_PROVIDERS),
  apiKey: z.string().min(1, "API key is required"),
  name: z.string().max(100).optional(),
  isDefault: z.boolean().default(true),
});

export type ProviderCredentialCreate = z.infer<typeof ProviderCredentialCreateSchema>;

/**
 * Schema for updating a provider credential
 */
export const ProviderCredentialUpdateSchema = z.object({
  apiKey: z.string().min(1).optional(),
  name: z.string().max(100).optional(),
  isDefault: z.boolean().optional(),
});

export type ProviderCredentialUpdate = z.infer<typeof ProviderCredentialUpdateSchema>;

/**
 * Provider credential (without sensitive data)
 */
export interface ProviderCredential {
  id: string;
  provider: Provider;
  name: string | null;
  isDefault: boolean;
  createdAt: number;
  updatedAt: number;
}

/**
 * Database row type
 */
interface ProviderCredentialRow {
  id: string;
  user_id: string;
  provider: string;
  api_key_encrypted: string;
  name: string | null;
  is_default: number;
  created_at: number;
  updated_at: number;
}

/**
 * Convert database row to ProviderCredential
 */
function rowToCredential(row: ProviderCredentialRow): ProviderCredential {
  return {
    id: row.id,
    provider: row.provider as Provider,
    name: row.name,
    isDefault: Boolean(row.is_default),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Provider Credentials Service
 */
export class ProviderCredentialsService {
  /**
   * Store a new provider credential
   *
   * @param userId - The user ID
   * @param input - The credential data
   * @returns The created credential (without API key)
   */
  static create(userId: string, input: ProviderCredentialCreate): ProviderCredential {
    const db = DatabaseManager.getRootDb();
    const validated = ProviderCredentialCreateSchema.parse(input);

    // Check for existing credential with same name for this provider
    if (validated.name) {
      const existing = db
        .prepare(
          "SELECT id FROM provider_credentials WHERE user_id = ? AND provider = ? AND name = ?"
        )
        .get(userId, validated.provider, validated.name);

      if (existing) {
        throw new ConflictError(
          `Credential named '${validated.name}' already exists for ${validated.provider}`
        );
      }
    }

    // If setting as default, unset other defaults for this provider
    if (validated.isDefault) {
      db.prepare(
        "UPDATE provider_credentials SET is_default = 0 WHERE user_id = ? AND provider = ?"
      ).run(userId, validated.provider);
    }

    const id = generateId(IdPrefixes.providerCredential);
    const now = Date.now();

    db.prepare(
      `
      INSERT INTO provider_credentials
      (id, user_id, provider, api_key_encrypted, name, is_default, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      id,
      userId,
      validated.provider,
      encrypt(validated.apiKey),
      validated.name ?? null,
      validated.isDefault ? 1 : 0,
      now,
      now
    );

    return {
      id,
      provider: validated.provider,
      name: validated.name ?? null,
      isDefault: validated.isDefault,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Get decrypted API key for a provider
   *
   * @param userId - The user ID
   * @param provider - The provider name
   * @returns The decrypted API key or null if not found
   */
  static getApiKey(userId: string, provider: Provider): string | null {
    const db = DatabaseManager.getRootDb();

    const row = db
      .prepare(
        `
      SELECT api_key_encrypted FROM provider_credentials
      WHERE user_id = ? AND provider = ? AND is_default = 1
    `
      )
      .get(userId, provider) as { api_key_encrypted: string } | undefined;

    if (!row) return null;

    return decrypt(row.api_key_encrypted);
  }

  /**
   * Get API key by credential ID
   *
   * @param userId - The user ID
   * @param credentialId - The credential ID
   * @returns The decrypted API key or null if not found
   */
  static getApiKeyById(userId: string, credentialId: string): string | null {
    const db = DatabaseManager.getRootDb();

    const row = db
      .prepare(
        "SELECT api_key_encrypted FROM provider_credentials WHERE id = ? AND user_id = ?"
      )
      .get(credentialId, userId) as { api_key_encrypted: string } | undefined;

    if (!row) return null;

    return decrypt(row.api_key_encrypted);
  }

  /**
   * List all credentials for a user (without API keys)
   *
   * @param userId - The user ID
   * @returns List of credentials without sensitive data
   */
  static list(userId: string): ProviderCredential[] {
    const db = DatabaseManager.getRootDb();

    const rows = db
      .prepare(
        `
      SELECT id, user_id, provider, api_key_encrypted, name, is_default, created_at, updated_at
      FROM provider_credentials WHERE user_id = ?
      ORDER BY provider, is_default DESC, created_at DESC
    `
      )
      .all(userId) as ProviderCredentialRow[];

    return rows.map(rowToCredential);
  }

  /**
   * Get credential by ID
   *
   * @param userId - The user ID
   * @param credentialId - The credential ID
   * @returns The credential or null
   */
  static getById(userId: string, credentialId: string): ProviderCredential | null {
    const db = DatabaseManager.getRootDb();

    const row = db
      .prepare(
        "SELECT * FROM provider_credentials WHERE id = ? AND user_id = ?"
      )
      .get(credentialId, userId) as ProviderCredentialRow | undefined;

    if (!row) return null;

    return rowToCredential(row);
  }

  /**
   * Update a credential
   *
   * @param userId - The user ID
   * @param credentialId - The credential ID
   * @param input - The update data
   * @returns The updated credential
   */
  static update(
    userId: string,
    credentialId: string,
    input: ProviderCredentialUpdate
  ): ProviderCredential {
    const db = DatabaseManager.getRootDb();
    const validated = ProviderCredentialUpdateSchema.parse(input);

    // Get existing credential
    const existing = db
      .prepare("SELECT * FROM provider_credentials WHERE id = ? AND user_id = ?")
      .get(credentialId, userId) as ProviderCredentialRow | undefined;

    if (!existing) {
      throw new NotFoundError("Credential", credentialId);
    }

    // If setting as default, unset other defaults for this provider
    if (validated.isDefault === true) {
      db.prepare(
        "UPDATE provider_credentials SET is_default = 0 WHERE user_id = ? AND provider = ? AND id != ?"
      ).run(userId, existing.provider, credentialId);
    }

    // Build update query
    const updates: string[] = ["updated_at = ?"];
    const params: (string | number)[] = [Date.now()];

    if (validated.apiKey !== undefined) {
      updates.push("api_key_encrypted = ?");
      params.push(encrypt(validated.apiKey));
    }

    if (validated.name !== undefined) {
      updates.push("name = ?");
      params.push(validated.name);
    }

    if (validated.isDefault !== undefined) {
      updates.push("is_default = ?");
      params.push(validated.isDefault ? 1 : 0);
    }

    params.push(credentialId, userId);

    db.prepare(
      `UPDATE provider_credentials SET ${updates.join(", ")} WHERE id = ? AND user_id = ?`
    ).run(...params);

    return this.getById(userId, credentialId)!;
  }

  /**
   * Delete a credential
   *
   * @param userId - The user ID
   * @param credentialId - The credential ID
   */
  static delete(userId: string, credentialId: string): void {
    const db = DatabaseManager.getRootDb();

    const result = db
      .prepare("DELETE FROM provider_credentials WHERE id = ? AND user_id = ?")
      .run(credentialId, userId);

    if (result.changes === 0) {
      throw new NotFoundError("Credential", credentialId);
    }
  }

  /**
   * Check if user has credentials for required providers
   *
   * @param userId - The user ID
   * @returns Object with boolean for each supported provider
   */
  static hasCredentials(userId: string): Record<Provider, boolean> {
    const credentials = this.list(userId);
    const result: Record<Provider, boolean> = {
      openai: false,
      anthropic: false,
      google: false,
    };

    for (const cred of credentials) {
      result[cred.provider] = true;
    }

    return result;
  }

  /**
   * Set a credential as default for its provider
   *
   * @param userId - The user ID
   * @param credentialId - The credential ID to set as default
   */
  static setDefault(userId: string, credentialId: string): void {
    const db = DatabaseManager.getRootDb();

    // Get the credential
    const credential = this.getById(userId, credentialId);
    if (!credential) {
      throw new NotFoundError("Credential", credentialId);
    }

    // Unset other defaults for this provider
    db.prepare(
      "UPDATE provider_credentials SET is_default = 0 WHERE user_id = ? AND provider = ?"
    ).run(userId, credential.provider);

    // Set this one as default
    db.prepare(
      "UPDATE provider_credentials SET is_default = 1, updated_at = ? WHERE id = ?"
    ).run(Date.now(), credentialId);
  }
}
