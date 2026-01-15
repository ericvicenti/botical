import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { encrypt, decrypt, hashSha256, generateSecureToken } from "@/services/crypto.ts";

describe("Crypto Service", () => {
  describe("encrypt/decrypt", () => {
    it("encrypts and decrypts a string correctly", () => {
      const plaintext = "sk-abc123-my-secret-api-key";
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it("produces different ciphertext for same plaintext (random IV)", () => {
      const plaintext = "test-secret";
      const encrypted1 = encrypt(plaintext);
      const encrypted2 = encrypt(plaintext);

      expect(encrypted1).not.toBe(encrypted2);
    });

    it("handles empty string", () => {
      const plaintext = "";
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it("handles long strings", () => {
      const plaintext = "x".repeat(10000);
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it("handles unicode characters", () => {
      const plaintext = "Hello 世界 🌍 مرحبا";
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it("produces format iv:authTag:encrypted", () => {
      const encrypted = encrypt("test");
      const parts = encrypted.split(":");

      expect(parts.length).toBe(3);
      // All parts should be base64
      expect(() => Buffer.from(parts[0]!, "base64")).not.toThrow();
      expect(() => Buffer.from(parts[1]!, "base64")).not.toThrow();
      expect(() => Buffer.from(parts[2]!, "base64")).not.toThrow();
    });

    it("throws on invalid ciphertext format", () => {
      expect(() => decrypt("invalid")).toThrow("Invalid encrypted format");
      expect(() => decrypt("only:two")).toThrow("Invalid encrypted format");
      expect(() => decrypt("")).toThrow("Invalid encrypted format");
    });

    it("throws on tampered ciphertext", () => {
      const encrypted = encrypt("secret");
      const parts = encrypted.split(":");
      // Tamper with the encrypted data
      parts[2] = Buffer.from("tampered").toString("base64");
      const tampered = parts.join(":");

      expect(() => decrypt(tampered)).toThrow();
    });
  });

  describe("hashSha256", () => {
    it("produces consistent hash for same input", () => {
      const input = "test-input";
      const hash1 = hashSha256(input);
      const hash2 = hashSha256(input);

      expect(hash1).toBe(hash2);
    });

    it("produces different hash for different input", () => {
      const hash1 = hashSha256("input1");
      const hash2 = hashSha256("input2");

      expect(hash1).not.toBe(hash2);
    });

    it("produces 64-character hex string", () => {
      const hash = hashSha256("test");

      expect(hash.length).toBe(64);
      expect(hash).toMatch(/^[a-f0-9]+$/);
    });

    it("handles empty string", () => {
      const hash = hashSha256("");

      expect(hash.length).toBe(64);
    });
  });

  describe("generateSecureToken", () => {
    it("generates base64url encoded token", () => {
      const token = generateSecureToken();

      // Base64url uses alphanumeric plus - and _
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it("generates tokens of expected length", () => {
      const token32 = generateSecureToken(32);
      const token16 = generateSecureToken(16);

      // Base64url encoding: 4 chars per 3 bytes
      // 32 bytes -> ~43 chars, 16 bytes -> ~22 chars
      expect(token32.length).toBeGreaterThan(40);
      expect(token16.length).toBeGreaterThan(20);
    });

    it("generates unique tokens", () => {
      const tokens = new Set<string>();
      for (let i = 0; i < 100; i++) {
        tokens.add(generateSecureToken());
      }

      expect(tokens.size).toBe(100);
    });

    it("default is 32 bytes", () => {
      const token = generateSecureToken();
      // 32 bytes in base64url is ~43 characters
      expect(token.length).toBeGreaterThanOrEqual(42);
    });
  });
});
