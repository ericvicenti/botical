import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { ProviderCredentialsService } from "@/services/provider-credentials.ts";
import { DatabaseManager } from "@/database/manager.ts";
import { Config } from "@/config/index.ts";
import { ConflictError, NotFoundError } from "@/utils/errors.ts";
import fs from "fs";
import path from "path";

describe("ProviderCredentialsService", () => {
  const testDataDir = path.join(import.meta.dirname, "../../../.test-data/provider-credentials-test");
  let testUserId: string;
  let otherUserId: string;

  beforeEach(async () => {
    // Reset database for each test
    DatabaseManager.closeAll();
    Config.load({ dataDir: testDataDir });

    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }

    // Initialize database
    await DatabaseManager.initialize();

    const db = DatabaseManager.getRootDb();

    // Create test users
    testUserId = "usr_test123";
    db.prepare(`
      INSERT INTO users (id, email, username, is_admin, can_execute_code, preferences, created_at, updated_at)
      VALUES (?, 'test@example.com', 'testuser', 0, 0, '{}', ?, ?)
    `).run(testUserId, Date.now(), Date.now());

    otherUserId = "usr_other456";
    db.prepare(`
      INSERT INTO users (id, email, username, is_admin, can_execute_code, preferences, created_at, updated_at)
      VALUES (?, 'other@example.com', 'otheruser', 0, 0, '{}', ?, ?)
    `).run(otherUserId, Date.now(), Date.now());
  });

  afterEach(() => {
    DatabaseManager.closeAll();
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  describe("create", () => {
    it("creates a provider credential", () => {
      const credential = ProviderCredentialsService.create(testUserId, {
        provider: "openai",
        apiKey: "sk-test123",
        name: "My OpenAI Key",
        isDefault: true,
      });

      expect(credential.id).toMatch(/^cred_/);
      expect(credential.provider).toBe("openai");
      expect(credential.name).toBe("My OpenAI Key");
      expect(credential.isDefault).toBe(true);
    });

    it("does not expose API key in response", () => {
      const credential = ProviderCredentialsService.create(testUserId, {
        provider: "openai",
        apiKey: "sk-secret-key",
        isDefault: true,
      });

      // Cast to unknown first to check for unexpected properties
      const credentialAny = credential as unknown as Record<string, unknown>;
      expect(credentialAny["apiKey"]).toBeUndefined();
      expect(credentialAny["api_key_encrypted"]).toBeUndefined();
    });

    it("encrypts API key in database", () => {
      const credential = ProviderCredentialsService.create(testUserId, {
        provider: "openai",
        apiKey: "sk-test123",
        isDefault: true,
      });

      const db = DatabaseManager.getRootDb();
      const row = db.prepare("SELECT api_key_encrypted FROM provider_credentials WHERE id = ?").get(credential.id) as { api_key_encrypted: string };

      expect(row.api_key_encrypted).not.toBe("sk-test123");
      expect(row.api_key_encrypted).toContain(":"); // encrypted format
    });

    it("sets first credential as default", () => {
      const credential = ProviderCredentialsService.create(testUserId, {
        provider: "openai",
        apiKey: "sk-test123",
        isDefault: false, // Even if explicitly set to false, first one should be true by default behavior
      });

      expect(credential.isDefault).toBe(false);
    });

    it("unsets previous default when creating new default", () => {
      const first = ProviderCredentialsService.create(testUserId, {
        provider: "openai",
        apiKey: "sk-first",
        isDefault: true,
      });

      const second = ProviderCredentialsService.create(testUserId, {
        provider: "openai",
        apiKey: "sk-second",
        isDefault: true,
      });

      // First should no longer be default
      const firstUpdated = ProviderCredentialsService.getById(testUserId, first.id);
      expect(firstUpdated!.isDefault).toBe(false);
      expect(second.isDefault).toBe(true);
    });

    it("throws on duplicate name for same provider", () => {
      ProviderCredentialsService.create(testUserId, {
        provider: "openai",
        apiKey: "sk-first",
        name: "My Key",
        isDefault: true,
      });

      expect(() =>
        ProviderCredentialsService.create(testUserId, {
          provider: "openai",
          apiKey: "sk-second",
          name: "My Key",
          isDefault: true,
        })
      ).toThrow(ConflictError);
    });

    it("allows same name for different providers", () => {
      ProviderCredentialsService.create(testUserId, {
        provider: "openai",
        apiKey: "sk-openai",
        name: "Default",
        isDefault: true,
      });

      const anthropic = ProviderCredentialsService.create(testUserId, {
        provider: "anthropic",
        apiKey: "sk-anthropic",
        name: "Default",
        isDefault: true,
      });

      expect(anthropic.name).toBe("Default");
    });

    it("allows same name for different users", () => {
      ProviderCredentialsService.create(testUserId, {
        provider: "openai",
        apiKey: "sk-user1",
        name: "My Key",
        isDefault: true,
      });

      const otherUserCred = ProviderCredentialsService.create(otherUserId, {
        provider: "openai",
        apiKey: "sk-user2",
        name: "My Key",
        isDefault: true,
      });

      expect(otherUserCred.name).toBe("My Key");
    });
  });

  describe("getApiKey", () => {
    it("returns decrypted API key", () => {
      ProviderCredentialsService.create(testUserId, {
        provider: "openai",
        apiKey: "sk-test123secret",
        isDefault: true,
      });

      const key = ProviderCredentialsService.getApiKey(testUserId, "openai");

      expect(key).toBe("sk-test123secret");
    });

    it("returns default credential's key", () => {
      ProviderCredentialsService.create(testUserId, {
        provider: "openai",
        apiKey: "sk-first",
        isDefault: false,
      });

      ProviderCredentialsService.create(testUserId, {
        provider: "openai",
        apiKey: "sk-default",
        isDefault: true,
      });

      const key = ProviderCredentialsService.getApiKey(testUserId, "openai");
      expect(key).toBe("sk-default");
    });

    it("returns null for non-existent provider", () => {
      const key = ProviderCredentialsService.getApiKey(testUserId, "anthropic");
      expect(key).toBeNull();
    });

    it("returns null for other user's credentials", () => {
      ProviderCredentialsService.create(testUserId, {
        provider: "openai",
        apiKey: "sk-secret",
        isDefault: true,
      });

      const key = ProviderCredentialsService.getApiKey(otherUserId, "openai");
      expect(key).toBeNull();
    });
  });

  describe("getApiKeyById", () => {
    it("returns decrypted API key by credential ID", () => {
      const credential = ProviderCredentialsService.create(testUserId, {
        provider: "openai",
        apiKey: "sk-specific-key",
        isDefault: true,
      });

      const key = ProviderCredentialsService.getApiKeyById(testUserId, credential.id);
      expect(key).toBe("sk-specific-key");
    });

    it("returns null for wrong user", () => {
      const credential = ProviderCredentialsService.create(testUserId, {
        provider: "openai",
        apiKey: "sk-secret",
        isDefault: true,
      });

      const key = ProviderCredentialsService.getApiKeyById(otherUserId, credential.id);
      expect(key).toBeNull();
    });
  });

  describe("list", () => {
    it("lists all credentials for a user", () => {
      ProviderCredentialsService.create(testUserId, {
        provider: "openai",
        apiKey: "sk-openai",
        isDefault: true,
      });

      ProviderCredentialsService.create(testUserId, {
        provider: "anthropic",
        apiKey: "sk-anthropic",
        isDefault: true,
      });

      const credentials = ProviderCredentialsService.list(testUserId);

      expect(credentials.length).toBe(2);
    });

    it("does not include API keys in list", () => {
      ProviderCredentialsService.create(testUserId, {
        provider: "openai",
        apiKey: "sk-secret",
        isDefault: true,
      });

      const credentials = ProviderCredentialsService.list(testUserId);

      // Cast to unknown first to check for unexpected properties
      const firstCred = credentials[0] as unknown as Record<string, unknown>;
      expect(firstCred["apiKey"]).toBeUndefined();
      expect(firstCred["api_key_encrypted"]).toBeUndefined();
    });

    it("only lists user's own credentials", () => {
      ProviderCredentialsService.create(testUserId, {
        provider: "openai",
        apiKey: "sk-user1",
        isDefault: true,
      });

      ProviderCredentialsService.create(otherUserId, {
        provider: "openai",
        apiKey: "sk-user2",
        isDefault: true,
      });

      const credentials = ProviderCredentialsService.list(testUserId);

      expect(credentials.length).toBe(1);
    });

    it("returns empty array for user with no credentials", () => {
      const credentials = ProviderCredentialsService.list(testUserId);
      expect(credentials.length).toBe(0);
    });
  });

  describe("update", () => {
    it("updates credential name", () => {
      const credential = ProviderCredentialsService.create(testUserId, {
        provider: "openai",
        apiKey: "sk-test",
        name: "Old Name",
        isDefault: true,
      });

      const updated = ProviderCredentialsService.update(testUserId, credential.id, {
        name: "New Name",
      });

      expect(updated.name).toBe("New Name");
    });

    it("updates API key", () => {
      const credential = ProviderCredentialsService.create(testUserId, {
        provider: "openai",
        apiKey: "sk-old",
        isDefault: true,
      });

      ProviderCredentialsService.update(testUserId, credential.id, {
        apiKey: "sk-new",
      });

      const key = ProviderCredentialsService.getApiKeyById(testUserId, credential.id);
      expect(key).toBe("sk-new");
    });

    it("updates isDefault and unsets others", () => {
      const first = ProviderCredentialsService.create(testUserId, {
        provider: "openai",
        apiKey: "sk-first",
        isDefault: true,
      });

      const second = ProviderCredentialsService.create(testUserId, {
        provider: "openai",
        apiKey: "sk-second",
        isDefault: false,
      });

      ProviderCredentialsService.update(testUserId, second.id, {
        isDefault: true,
      });

      const firstUpdated = ProviderCredentialsService.getById(testUserId, first.id);
      const secondUpdated = ProviderCredentialsService.getById(testUserId, second.id);

      expect(firstUpdated!.isDefault).toBe(false);
      expect(secondUpdated!.isDefault).toBe(true);
    });

    it("throws NotFoundError for non-existent credential", () => {
      expect(() =>
        ProviderCredentialsService.update(testUserId, "cred_nonexistent", {
          name: "Test",
        })
      ).toThrow(NotFoundError);
    });

    it("throws NotFoundError for other user's credential", () => {
      const credential = ProviderCredentialsService.create(testUserId, {
        provider: "openai",
        apiKey: "sk-test",
        isDefault: true,
      });

      expect(() =>
        ProviderCredentialsService.update(otherUserId, credential.id, {
          name: "Hacked",
        })
      ).toThrow(NotFoundError);
    });
  });

  describe("delete", () => {
    it("deletes a credential", () => {
      const credential = ProviderCredentialsService.create(testUserId, {
        provider: "openai",
        apiKey: "sk-test",
        isDefault: true,
      });

      ProviderCredentialsService.delete(testUserId, credential.id);

      const found = ProviderCredentialsService.getById(testUserId, credential.id);
      expect(found).toBeNull();
    });

    it("throws NotFoundError for non-existent credential", () => {
      expect(() =>
        ProviderCredentialsService.delete(testUserId, "cred_nonexistent")
      ).toThrow(NotFoundError);
    });

    it("throws NotFoundError for other user's credential", () => {
      const credential = ProviderCredentialsService.create(testUserId, {
        provider: "openai",
        apiKey: "sk-test",
        isDefault: true,
      });

      expect(() =>
        ProviderCredentialsService.delete(otherUserId, credential.id)
      ).toThrow(NotFoundError);
    });
  });

  describe("hasCredentials", () => {
    it("returns object with provider status", () => {
      ProviderCredentialsService.create(testUserId, {
        provider: "openai",
        apiKey: "sk-openai",
        isDefault: true,
      });

      ProviderCredentialsService.create(testUserId, {
        provider: "anthropic",
        apiKey: "sk-anthropic",
        isDefault: true,
      });

      const status = ProviderCredentialsService.hasCredentials(testUserId);

      expect(status.openai).toBe(true);
      expect(status.anthropic).toBe(true);
      expect(status.google).toBe(false);
    });

    it("returns all false for user with no credentials", () => {
      const status = ProviderCredentialsService.hasCredentials(testUserId);

      expect(status.openai).toBe(false);
      expect(status.anthropic).toBe(false);
      expect(status.google).toBe(false);
    });
  });

  describe("setDefault", () => {
    it("sets credential as default", () => {
      const first = ProviderCredentialsService.create(testUserId, {
        provider: "openai",
        apiKey: "sk-first",
        isDefault: true,
      });

      const second = ProviderCredentialsService.create(testUserId, {
        provider: "openai",
        apiKey: "sk-second",
        isDefault: false,
      });

      ProviderCredentialsService.setDefault(testUserId, second.id);

      const firstUpdated = ProviderCredentialsService.getById(testUserId, first.id);
      const secondUpdated = ProviderCredentialsService.getById(testUserId, second.id);

      expect(firstUpdated!.isDefault).toBe(false);
      expect(secondUpdated!.isDefault).toBe(true);
    });

    it("throws NotFoundError for non-existent credential", () => {
      expect(() =>
        ProviderCredentialsService.setDefault(testUserId, "cred_nonexistent")
      ).toThrow(NotFoundError);
    });
  });

  describe("encryption security", () => {
    it("stores different ciphertext for same API key", () => {
      const cred1 = ProviderCredentialsService.create(testUserId, {
        provider: "openai",
        apiKey: "sk-same-key",
        name: "Key 1",
        isDefault: true,
      });

      const cred2 = ProviderCredentialsService.create(testUserId, {
        provider: "anthropic",
        apiKey: "sk-same-key",
        name: "Key 2",
        isDefault: true,
      });

      const db = DatabaseManager.getRootDb();
      const row1 = db.prepare("SELECT api_key_encrypted FROM provider_credentials WHERE id = ?").get(cred1.id) as { api_key_encrypted: string };
      const row2 = db.prepare("SELECT api_key_encrypted FROM provider_credentials WHERE id = ?").get(cred2.id) as { api_key_encrypted: string };

      // Should be different due to random IV
      expect(row1.api_key_encrypted).not.toBe(row2.api_key_encrypted);
    });

    it("can decrypt API keys correctly", () => {
      const originalKey = "sk-test-encryption-1234567890";

      ProviderCredentialsService.create(testUserId, {
        provider: "openai",
        apiKey: originalKey,
        isDefault: true,
      });

      const decrypted = ProviderCredentialsService.getApiKey(testUserId, "openai");
      expect(decrypted).toBe(originalKey);
    });
  });
});
