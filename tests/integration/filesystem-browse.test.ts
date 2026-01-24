/**
 * Filesystem Browse Integration Tests
 *
 * Tests the filesystem browsing API used for opening existing projects.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Hono } from "hono";
import { filesystem } from "@/server/routes/filesystem.ts";
import { ValidationError } from "@/utils/errors.ts";
import fs from "fs";
import path from "path";
import os from "os";

interface DirectoryEntry {
  name: string;
  path: string;
  type: "file" | "directory";
  isHidden: boolean;
  isGitRepo?: boolean;
  hasPackageJson?: boolean;
}

interface BrowseResponse {
  data: {
    path: string;
    parent: string | null;
    entries: DirectoryEntry[];
    isGitRepo: boolean;
    hasPackageJson: boolean;
  };
}

interface ValidateResponse {
  data: {
    valid: boolean;
    path: string;
    suggestedName?: string;
    isGitRepo?: boolean;
    hasPackageJson?: boolean;
    error?: string;
  };
}

describe("Filesystem Browse API", () => {
  const testDataDir = path.join(
    import.meta.dirname,
    "../.test-data/filesystem-browse"
  );
  let app: Hono;

  beforeEach(async () => {
    // Clean up and create test directory structure
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
    fs.mkdirSync(testDataDir, { recursive: true });

    // Create test directory structure
    // Regular folders
    fs.mkdirSync(path.join(testDataDir, "regular-folder"));
    fs.mkdirSync(path.join(testDataDir, "another-folder"));

    // Git repo folder
    const gitRepoPath = path.join(testDataDir, "my-git-project");
    fs.mkdirSync(gitRepoPath);
    fs.mkdirSync(path.join(gitRepoPath, ".git"));

    // Node project folder (has package.json but no git)
    const nodeProjectPath = path.join(testDataDir, "node-project");
    fs.mkdirSync(nodeProjectPath);
    fs.writeFileSync(path.join(nodeProjectPath, "package.json"), "{}");

    // Full project folder (git + package.json)
    const fullProjectPath = path.join(testDataDir, "full-project");
    fs.mkdirSync(fullProjectPath);
    fs.mkdirSync(path.join(fullProjectPath, ".git"));
    fs.writeFileSync(path.join(fullProjectPath, "package.json"), "{}");

    // Hidden folder
    fs.mkdirSync(path.join(testDataDir, ".hidden-folder"));

    // Regular file
    fs.writeFileSync(path.join(testDataDir, "test-file.txt"), "test content");

    // Create app with filesystem routes
    app = new Hono();
    app.onError((err, c) => {
      if (err instanceof ValidationError) {
        return c.json({ error: err.message }, 400);
      }
      return c.json({ error: err.message }, 500);
    });
    app.route("/api/filesystem", filesystem);
  });

  afterEach(() => {
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  describe("GET /api/filesystem/browse", () => {
    it("returns home directory when no path specified", async () => {
      const res = await app.request("/api/filesystem/browse");

      expect(res.status).toBe(200);
      const data = (await res.json()) as BrowseResponse;
      expect(data.data.path).toBe(os.homedir());
      expect(data.data.entries).toBeDefined();
      expect(Array.isArray(data.data.entries)).toBe(true);
    });

    it("browses specified directory", async () => {
      const res = await app.request(
        `/api/filesystem/browse?path=${encodeURIComponent(testDataDir)}`
      );

      expect(res.status).toBe(200);
      const data = (await res.json()) as BrowseResponse;
      expect(data.data.path).toBe(testDataDir);
      expect(data.data.entries.length).toBeGreaterThan(0);
    });

    it("returns parent directory path", async () => {
      const res = await app.request(
        `/api/filesystem/browse?path=${encodeURIComponent(testDataDir)}`
      );

      expect(res.status).toBe(200);
      const data = (await res.json()) as BrowseResponse;
      expect(data.data.parent).toBe(path.dirname(testDataDir));
    });

    it("returns null parent for root directory", async () => {
      const res = await app.request("/api/filesystem/browse?path=/");

      expect(res.status).toBe(200);
      const data = (await res.json()) as BrowseResponse;
      expect(data.data.parent).toBeNull();
    });

    it("lists directories with correct types", async () => {
      const res = await app.request(
        `/api/filesystem/browse?path=${encodeURIComponent(testDataDir)}`
      );

      expect(res.status).toBe(200);
      const data = (await res.json()) as BrowseResponse;

      const regularFolder = data.data.entries.find(
        (e) => e.name === "regular-folder"
      );
      expect(regularFolder).toBeDefined();
      expect(regularFolder!.type).toBe("directory");

      const testFile = data.data.entries.find((e) => e.name === "test-file.txt");
      expect(testFile).toBeDefined();
      expect(testFile!.type).toBe("file");
    });

    it("identifies git repositories", async () => {
      const res = await app.request(
        `/api/filesystem/browse?path=${encodeURIComponent(testDataDir)}`
      );

      expect(res.status).toBe(200);
      const data = (await res.json()) as BrowseResponse;

      const gitProject = data.data.entries.find(
        (e) => e.name === "my-git-project"
      );
      expect(gitProject).toBeDefined();
      expect(gitProject!.isGitRepo).toBe(true);

      const regularFolder = data.data.entries.find(
        (e) => e.name === "regular-folder"
      );
      expect(regularFolder).toBeDefined();
      expect(regularFolder!.isGitRepo).toBeFalsy();
    });

    it("identifies folders with package.json", async () => {
      const res = await app.request(
        `/api/filesystem/browse?path=${encodeURIComponent(testDataDir)}`
      );

      expect(res.status).toBe(200);
      const data = (await res.json()) as BrowseResponse;

      const nodeProject = data.data.entries.find(
        (e) => e.name === "node-project"
      );
      expect(nodeProject).toBeDefined();
      expect(nodeProject!.hasPackageJson).toBe(true);

      const regularFolder = data.data.entries.find(
        (e) => e.name === "regular-folder"
      );
      expect(regularFolder).toBeDefined();
      expect(regularFolder!.hasPackageJson).toBeFalsy();
    });

    it("identifies full projects (git + package.json)", async () => {
      const res = await app.request(
        `/api/filesystem/browse?path=${encodeURIComponent(testDataDir)}`
      );

      expect(res.status).toBe(200);
      const data = (await res.json()) as BrowseResponse;

      const fullProject = data.data.entries.find(
        (e) => e.name === "full-project"
      );
      expect(fullProject).toBeDefined();
      expect(fullProject!.isGitRepo).toBe(true);
      expect(fullProject!.hasPackageJson).toBe(true);
    });

    it("marks hidden folders correctly", async () => {
      const res = await app.request(
        `/api/filesystem/browse?path=${encodeURIComponent(testDataDir)}`
      );

      expect(res.status).toBe(200);
      const data = (await res.json()) as BrowseResponse;

      const hiddenFolder = data.data.entries.find(
        (e) => e.name === ".hidden-folder"
      );
      expect(hiddenFolder).toBeDefined();
      expect(hiddenFolder!.isHidden).toBe(true);

      const regularFolder = data.data.entries.find(
        (e) => e.name === "regular-folder"
      );
      expect(regularFolder).toBeDefined();
      expect(regularFolder!.isHidden).toBe(false);
    });

    it("detects if current directory is a git repo", async () => {
      const gitRepoPath = path.join(testDataDir, "my-git-project");
      const res = await app.request(
        `/api/filesystem/browse?path=${encodeURIComponent(gitRepoPath)}`
      );

      expect(res.status).toBe(200);
      const data = (await res.json()) as BrowseResponse;
      expect(data.data.isGitRepo).toBe(true);
    });

    it("expands ~ to home directory", async () => {
      const res = await app.request("/api/filesystem/browse?path=~");

      expect(res.status).toBe(200);
      const data = (await res.json()) as BrowseResponse;
      expect(data.data.path).toBe(os.homedir());
    });

    it("returns 400 for non-existent path", async () => {
      const res = await app.request(
        "/api/filesystem/browse?path=/nonexistent/path/that/does/not/exist"
      );

      expect(res.status).toBe(400);
    });

    it("returns 400 for file path (not directory)", async () => {
      const filePath = path.join(testDataDir, "test-file.txt");
      const res = await app.request(
        `/api/filesystem/browse?path=${encodeURIComponent(filePath)}`
      );

      expect(res.status).toBe(400);
    });
  });

  describe("POST /api/filesystem/validate", () => {
    it("validates existing directory", async () => {
      const res = await app.request("/api/filesystem/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: testDataDir }),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as ValidateResponse;
      expect(data.data.valid).toBe(true);
      expect(data.data.path).toBe(testDataDir);
    });

    it("suggests name from directory name", async () => {
      const projectPath = path.join(testDataDir, "my-git-project");
      const res = await app.request("/api/filesystem/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: projectPath }),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as ValidateResponse;
      expect(data.data.suggestedName).toBe("my-git-project");
    });

    it("detects git repo", async () => {
      const projectPath = path.join(testDataDir, "my-git-project");
      const res = await app.request("/api/filesystem/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: projectPath }),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as ValidateResponse;
      expect(data.data.isGitRepo).toBe(true);
    });

    it("detects package.json", async () => {
      const projectPath = path.join(testDataDir, "node-project");
      const res = await app.request("/api/filesystem/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: projectPath }),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as ValidateResponse;
      expect(data.data.hasPackageJson).toBe(true);
    });

    it("returns invalid for non-existent path", async () => {
      const res = await app.request("/api/filesystem/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: "/nonexistent/path" }),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as ValidateResponse;
      expect(data.data.valid).toBe(false);
      expect(data.data.error).toBe("Directory not found");
    });

    it("returns invalid for file path", async () => {
      const filePath = path.join(testDataDir, "test-file.txt");
      const res = await app.request("/api/filesystem/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: filePath }),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as ValidateResponse;
      expect(data.data.valid).toBe(false);
      expect(data.data.error).toBe("Path is not a directory");
    });

    it("expands ~ to home directory", async () => {
      const res = await app.request("/api/filesystem/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: "~" }),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as ValidateResponse;
      expect(data.data.valid).toBe(true);
      expect(data.data.path).toBe(os.homedir());
    });

    it("returns 400 for missing path", async () => {
      const res = await app.request("/api/filesystem/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
    });
  });
});
