/**
 * Git Queries Unit Tests
 *
 * Tests for git query definitions.
 */

import { describe, it, expect, beforeEach, afterEach, spyOn, mock } from "bun:test";
import { gitIdentityQuery, type GitIdentity } from "../../../src/queries/git";
import type { QueryContext } from "../../../src/queries/types";
import * as identityModule from "../../../src/services/identity";

const mockIdentity = {
  publicKey: "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAITestKey iris@local",
  fingerprint: "SHA256:TestFingerprint",
  keyPath: "/home/user/.iris/id_ed25519.pub",
};

describe("gitIdentityQuery", () => {
  const mockContext: QueryContext = {
    db: undefined,
  };

  let getIdentityInfoSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    getIdentityInfoSpy = spyOn(identityModule, "getIdentityInfo").mockReturnValue(mockIdentity);
  });

  afterEach(() => {
    getIdentityInfoSpy.mockRestore();
  });

  it("has correct name", () => {
    expect(gitIdentityQuery.name).toBe("git.identity");
  });

  it("fetches identity info", async () => {
    const result = await gitIdentityQuery.fetch(undefined, mockContext);

    expect(identityModule.getIdentityInfo).toHaveBeenCalled();
    expect(result.publicKey).toBe(mockIdentity.publicKey);
    expect(result.fingerprint).toBe(mockIdentity.fingerprint);
    expect(result.keyPath).toBe(mockIdentity.keyPath);
  });

  it("includes instructions for GitHub and GitLab", async () => {
    const result = await gitIdentityQuery.fetch(undefined, mockContext);

    expect(result.instructions).toBeDefined();
    expect(result.instructions.github).toContain("GitHub");
    expect(result.instructions.github).toContain(mockIdentity.publicKey);
    expect(result.instructions.gitlab).toContain("GitLab");
    expect(result.instructions.gitlab).toContain(mockIdentity.publicKey);
  });

  it("generates correct cache key", () => {
    expect(gitIdentityQuery.cache?.key?.(undefined)).toEqual(["git.identity"]);
  });

  it("has infinite TTL", () => {
    expect(gitIdentityQuery.cache?.ttl).toBe(Infinity);
  });

  it("has global scope", () => {
    expect(gitIdentityQuery.cache?.scope).toBe("global");
  });

  it("returns complete identity structure", async () => {
    const result = await gitIdentityQuery.fetch(undefined, mockContext);

    // Verify the structure matches GitIdentity interface
    expect(result).toHaveProperty("publicKey");
    expect(result).toHaveProperty("fingerprint");
    expect(result).toHaveProperty("keyPath");
    expect(result).toHaveProperty("instructions");
    expect(result.instructions).toHaveProperty("github");
    expect(result.instructions).toHaveProperty("gitlab");
  });
});
