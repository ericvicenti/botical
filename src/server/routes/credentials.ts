/**
 * Provider Credentials Routes
 *
 * Manages user's AI provider API keys.
 * See: docs/knowledge-base/03-api-reference.md
 *
 * Endpoints:
 * - GET    /credentials         - List all credentials
 * - POST   /credentials         - Create new credential
 * - GET    /credentials/:id     - Get credential details
 * - PATCH  /credentials/:id     - Update credential
 * - DELETE /credentials/:id     - Delete credential
 * - POST   /credentials/:id/default - Set as default
 * - GET    /credentials/check   - Check which providers are configured
 */

import { Hono } from "hono";
import { requireAuth } from "../../auth/index.ts";
import {
  ProviderCredentialsService,
  ProviderCredentialCreateSchema,
  ProviderCredentialUpdateSchema,
} from "../../services/provider-credentials.ts";
import { ValidationError } from "../../utils/errors.ts";

const credentials = new Hono();

// All routes require authentication
credentials.use("*", requireAuth());

/**
 * List all credentials for the current user
 *
 * GET /credentials
 */
credentials.get("/", async (c) => {
  const auth = c.get("auth");
  const creds = ProviderCredentialsService.list(auth.userId);

  return c.json({ credentials: creds });
});

/**
 * Check which providers are configured
 *
 * GET /credentials/check
 */
credentials.get("/check", async (c) => {
  const auth = c.get("auth");
  const configured = ProviderCredentialsService.hasCredentials(auth.userId);

  return c.json({ configured });
});

/**
 * Create a new credential
 *
 * POST /credentials
 * Body: { provider, apiKey, name?, isDefault? }
 */
credentials.post("/", async (c) => {
  const auth = c.get("auth");
  const body = await c.req.json();

  const result = ProviderCredentialCreateSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError(
      result.error.errors[0]?.message || "Invalid credential data"
    );
  }

  const credential = ProviderCredentialsService.create(auth.userId, result.data);

  return c.json({ credential }, 201);
});

/**
 * Get credential details
 *
 * GET /credentials/:id
 */
credentials.get("/:id", async (c) => {
  const auth = c.get("auth");
  const credentialId = c.req.param("id");

  const credential = ProviderCredentialsService.getById(auth.userId, credentialId);
  if (!credential) {
    return c.json({ error: "Credential not found" }, 404);
  }

  return c.json({ credential });
});

/**
 * Update a credential
 *
 * PATCH /credentials/:id
 * Body: { apiKey?, name?, isDefault? }
 */
credentials.patch("/:id", async (c) => {
  const auth = c.get("auth");
  const credentialId = c.req.param("id");
  const body = await c.req.json();

  const result = ProviderCredentialUpdateSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError(
      result.error.errors[0]?.message || "Invalid update data"
    );
  }

  const credential = ProviderCredentialsService.update(
    auth.userId,
    credentialId,
    result.data
  );

  return c.json({ credential });
});

/**
 * Delete a credential
 *
 * DELETE /credentials/:id
 */
credentials.delete("/:id", async (c) => {
  const auth = c.get("auth");
  const credentialId = c.req.param("id");

  ProviderCredentialsService.delete(auth.userId, credentialId);

  return c.json({ success: true });
});

/**
 * Set credential as default for its provider
 *
 * POST /credentials/:id/default
 */
credentials.post("/:id/default", async (c) => {
  const auth = c.get("auth");
  const credentialId = c.req.param("id");

  ProviderCredentialsService.setDefault(auth.userId, credentialId);

  return c.json({ success: true });
});

export { credentials };
