/**
 * Encryption Service for Provider Credentials
 *
 * Uses AES-256-GCM for encrypting sensitive data like API keys.
 * See: docs/knowledge-base/04-patterns.md
 *
 * Encryption key is derived from IRIS_ENCRYPTION_KEY environment variable.
 * In development mode, uses a deterministic key with a warning.
 */

import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/**
 * Get the encryption key from environment or use dev fallback
 */
function getEncryptionKey(): Buffer {
  const keyEnv = process.env.IRIS_ENCRYPTION_KEY;

  if (!keyEnv) {
    // In dev mode, use a deterministic key (not secure for production!)
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "WARNING: Using insecure dev encryption key. Set IRIS_ENCRYPTION_KEY in production."
      );
      return createHash("sha256").update("iris-dev-key-not-secure").digest();
    }
    throw new Error("IRIS_ENCRYPTION_KEY environment variable is required in production");
  }

  // Derive 32-byte key from the provided key
  return createHash("sha256").update(keyEnv).digest();
}

/**
 * Encrypt a plaintext string using AES-256-GCM
 *
 * @param plaintext - The string to encrypt
 * @returns The encrypted string in format: iv:authTag:encrypted (all base64)
 *
 * @example
 * const encrypted = encrypt("sk-abc123...");
 * // => "dGVzdGl2MTIz:YXV0aHRhZw==:ZW5jcnlwdGVk"
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, "utf8", "base64");
  encrypted += cipher.final("base64");

  const authTag = cipher.getAuthTag();

  // Return: iv:authTag:encrypted
  return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted}`;
}

/**
 * Decrypt a ciphertext string using AES-256-GCM
 *
 * @param ciphertext - The encrypted string in format: iv:authTag:encrypted
 * @returns The decrypted plaintext
 * @throws Error if the format is invalid or decryption fails
 *
 * @example
 * const plaintext = decrypt("dGVzdGl2MTIz:YXV0aHRhZw==:ZW5jcnlwdGVk");
 * // => "sk-abc123..."
 */
export function decrypt(ciphertext: string): string {
  const key = getEncryptionKey();
  const parts = ciphertext.split(":");

  if (parts.length !== 3) {
    throw new Error("Invalid encrypted format: expected iv:authTag:encrypted");
  }

  const [ivB64, authTagB64, encrypted] = parts;

  // Note: encrypted can be empty string for empty plaintext, so we check for undefined
  if (ivB64 === undefined || authTagB64 === undefined || encrypted === undefined) {
    throw new Error("Invalid encrypted format: missing components");
  }

  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");

  if (iv.length !== IV_LENGTH) {
    throw new Error(`Invalid IV length: expected ${IV_LENGTH}, got ${iv.length}`);
  }

  if (authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error(`Invalid auth tag length: expected ${AUTH_TAG_LENGTH}, got ${authTag.length}`);
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, "base64", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

/**
 * Hash a string using SHA-256
 *
 * @param input - The string to hash
 * @returns The hex-encoded hash
 */
export function hashSha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/**
 * Generate a secure random token
 *
 * @param bytes - Number of random bytes (default 32)
 * @returns Base64url-encoded random string
 */
export function generateSecureToken(bytes: number = 32): string {
  return randomBytes(bytes).toString("base64url");
}
