/**
 * Botical SSH Identity Service
 *
 * Manages Botical's SSH keypair for git authentication.
 * Generates an ED25519 keypair on first run and stores it in ~/.botical/
 *
 * Users can add the public key to GitHub/GitLab to authenticate git operations.
 * See: docs/knowledge-base/04-patterns.md#ssh-identity
 */

import { generateKeyPairSync, createPublicKey, createHash } from "crypto";
import { existsSync, mkdirSync, writeFileSync, readFileSync, chmodSync } from "fs";
import { join } from "path";
import { homedir } from "os";

// Botical data directory
const BOTICAL_DIR = join(homedir(), ".botical");
const PRIVATE_KEY_PATH = join(BOTICAL_DIR, "id_ed25519");
const PUBLIC_KEY_PATH = join(BOTICAL_DIR, "id_ed25519.pub");

/**
 * Ensure the Botical directory exists with proper permissions
 */
function ensureBoticalDir(): void {
  if (!existsSync(BOTICAL_DIR)) {
    mkdirSync(BOTICAL_DIR, { recursive: true, mode: 0o700 });
  }
}

/**
 * Convert a PEM public key to OpenSSH format
 * ED25519 keys in OpenSSH format: "ssh-ed25519 <base64-key> <comment>"
 */
function pemToOpenSSH(pemPublicKey: string): string {
  // Parse the PEM to get the raw key
  const keyObject = createPublicKey(pemPublicKey);
  const exported = keyObject.export({ type: "spki", format: "der" });

  // ED25519 SPKI format has a 12-byte header, the actual key is 32 bytes at the end
  const rawKey = exported.slice(-32);

  // OpenSSH format for ED25519:
  // 4 bytes: length of "ssh-ed25519" (11)
  // 11 bytes: "ssh-ed25519"
  // 4 bytes: length of key (32)
  // 32 bytes: raw key
  const keyType = "ssh-ed25519";
  const keyTypeBuffer = Buffer.from(keyType);
  const keyTypeLengthBuffer = Buffer.alloc(4);
  keyTypeLengthBuffer.writeUInt32BE(keyTypeBuffer.length);

  const keyLengthBuffer = Buffer.alloc(4);
  keyLengthBuffer.writeUInt32BE(rawKey.length);

  const sshKey = Buffer.concat([
    keyTypeLengthBuffer,
    keyTypeBuffer,
    keyLengthBuffer,
    rawKey,
  ]);

  return `ssh-ed25519 ${sshKey.toString("base64")} botical@local`;
}

/**
 * Calculate the fingerprint of an SSH public key
 * Returns SHA256 fingerprint in the format: SHA256:xxxxx
 */
function calculateFingerprint(publicKeyOpenSSH: string): string {
  // Extract the base64 part (second field)
  const parts = publicKeyOpenSSH.split(" ");
  const keyBase64 = parts[1];
  if (!keyBase64) {
    throw new Error("Invalid OpenSSH public key format");
  }

  const keyData = Buffer.from(keyBase64, "base64");
  const hash = createHash("sha256").update(keyData).digest("base64");

  // Remove trailing '=' padding and format
  return `SHA256:${hash.replace(/=+$/, "")}`;
}

/**
 * Generate a new ED25519 keypair for Botical
 * Called automatically if no keypair exists
 */
function generateKeypair(): void {
  ensureBoticalDir();

  const { privateKey, publicKey } = generateKeyPairSync("ed25519", {
    privateKeyEncoding: {
      type: "pkcs8",
      format: "pem",
    },
    publicKeyEncoding: {
      type: "spki",
      format: "pem",
    },
  });

  // Convert public key to OpenSSH format
  const sshPublicKey = pemToOpenSSH(publicKey);

  // Write private key with restricted permissions (owner read/write only)
  writeFileSync(PRIVATE_KEY_PATH, privateKey, { mode: 0o600 });

  // Write public key (can be world-readable)
  writeFileSync(PUBLIC_KEY_PATH, sshPublicKey + "\n", { mode: 0o644 });

  // Ensure permissions are correct (in case file existed)
  chmodSync(PRIVATE_KEY_PATH, 0o600);
  chmodSync(PUBLIC_KEY_PATH, 0o644);
}

/**
 * Ensure Botical has a valid SSH identity
 * Generates a keypair if one doesn't exist
 */
export function ensureIdentity(): void {
  if (!existsSync(PRIVATE_KEY_PATH) || !existsSync(PUBLIC_KEY_PATH)) {
    generateKeypair();
  }
}

/**
 * Get the path to the private key file
 * For use in SSH commands
 */
export function getPrivateKeyPath(): string {
  ensureIdentity();
  return PRIVATE_KEY_PATH;
}

/**
 * Get the public key in OpenSSH format
 * This is the key users should add to GitHub/GitLab
 */
export function getPublicKey(): string {
  ensureIdentity();
  return readFileSync(PUBLIC_KEY_PATH, "utf-8").trim();
}

/**
 * Get the fingerprint of the public key
 * Useful for verifying the key matches what's on GitHub
 */
export function getFingerprint(): string {
  const publicKey = getPublicKey();
  return calculateFingerprint(publicKey);
}

/**
 * Get the SSH command to use for git operations
 * Configures git to use the Botical SSH identity
 */
export function getSshCommand(): string {
  const keyPath = getPrivateKeyPath();
  // -o StrictHostKeyChecking=accept-new: Auto-accept new host keys (first connection)
  // -o BatchMode=yes: Don't prompt for passwords (fail if key auth doesn't work)
  return `ssh -i "${keyPath}" -o StrictHostKeyChecking=accept-new -o BatchMode=yes`;
}

/**
 * Get full identity info for API response
 */
export function getIdentityInfo(): {
  publicKey: string;
  fingerprint: string;
  keyPath: string;
} {
  return {
    publicKey: getPublicKey(),
    fingerprint: getFingerprint(),
    keyPath: PUBLIC_KEY_PATH,
  };
}

// Export paths for testing
export const IDENTITY_PATHS = {
  BOTICAL_DIR,
  PRIVATE_KEY_PATH,
  PUBLIC_KEY_PATH,
};
