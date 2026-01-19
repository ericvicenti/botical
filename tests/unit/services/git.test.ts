/**
 * Git Service Tests
 *
 * Tests for git operations: status, branches, commits, diff, etc.
 * Uses real git repositories in temp directories.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { execSync } from "child_process";
import { GitService } from "@/services/git";

// Helper to create a temp directory
function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "git-test-"));
}

// Helper to remove a temp directory
function removeTempDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

// Helper to run git commands
function git(cwd: string, ...args: string[]): string {
  // Quote arguments that contain spaces
  const quotedArgs = args.map(arg =>
    arg.includes(" ") ? `"${arg}"` : arg
  );
  return execSync(`git ${quotedArgs.join(" ")}`, {
    cwd,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}

// Helper to get the default branch name
function getDefaultBranch(dir: string): string {
  try {
    return git(dir, "branch", "--show-current");
  } catch {
    return "main"; // fallback
  }
}

// Helper to initialize a git repo with initial commit
function initRepo(dir: string): string {
  git(dir, "init", "-b", "main"); // Explicitly use main branch
  git(dir, "config", "user.email", "test@example.com");
  git(dir, "config", "user.name", "Test User");
  fs.writeFileSync(path.join(dir, "README.md"), "# Test Repo\n");
  git(dir, "add", "README.md");
  git(dir, "commit", "-m", "Initial commit");
  return "main";
}

describe("GitService", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    removeTempDir(tempDir);
  });

  describe("isRepo", () => {
    it("returns false for non-existent path", async () => {
      const result = await GitService.isRepo("/nonexistent/path");
      expect(result).toBe(false);
    });

    it("returns false for non-git directory", async () => {
      const result = await GitService.isRepo(tempDir);
      expect(result).toBe(false);
    });

    it("returns true for git repository", async () => {
      initRepo(tempDir);
      const result = await GitService.isRepo(tempDir);
      expect(result).toBe(true);
    });
  });

  describe("status", () => {
    it("returns isRepo: false for non-git directory", async () => {
      const status = await GitService.status(tempDir);
      expect(status.isRepo).toBe(false);
      expect(status.files).toEqual([]);
    });

    it("returns clean status for repo with no changes", async () => {
      initRepo(tempDir);
      const status = await GitService.status(tempDir);
      expect(status.isRepo).toBe(true);
      expect(status.branch).toBe("main");
      expect(status.files).toEqual([]);
      expect(status.ahead).toBe(0);
      expect(status.behind).toBe(0);
    });

    it("detects modified files", async () => {
      initRepo(tempDir);
      fs.writeFileSync(path.join(tempDir, "README.md"), "# Modified\n");

      const status = await GitService.status(tempDir);
      expect(status.files).toHaveLength(1);
      expect(status.files[0]).toMatchObject({
        path: "README.md",
        status: "M",
      });
    });

    it("detects untracked files", async () => {
      initRepo(tempDir);
      fs.writeFileSync(path.join(tempDir, "newfile.txt"), "new content\n");

      const status = await GitService.status(tempDir);
      expect(status.files).toHaveLength(1);
      expect(status.files[0]).toMatchObject({
        path: "newfile.txt",
        status: "?",
      });
    });

    it("detects deleted files", async () => {
      initRepo(tempDir);
      fs.unlinkSync(path.join(tempDir, "README.md"));

      const status = await GitService.status(tempDir);
      expect(status.files).toHaveLength(1);
      expect(status.files[0]).toMatchObject({
        path: "README.md",
        status: "D",
      });
    });

    it("detects multiple changes", async () => {
      initRepo(tempDir);
      fs.writeFileSync(path.join(tempDir, "README.md"), "# Modified\n");
      fs.writeFileSync(path.join(tempDir, "newfile.txt"), "new content\n");
      fs.writeFileSync(path.join(tempDir, "another.txt"), "another\n");

      const status = await GitService.status(tempDir);
      expect(status.files).toHaveLength(3);
    });
  });

  describe("branches", () => {
    it("lists branches", async () => {
      initRepo(tempDir);

      const branches = await GitService.branches(tempDir);
      expect(branches).toHaveLength(1);
      expect(branches[0]).toMatchObject({
        name: "main",
        current: true,
      });
    });

    it("shows current branch first", async () => {
      initRepo(tempDir);
      git(tempDir, "checkout", "-b", "feature");
      git(tempDir, "checkout", "-b", "another");

      const branches = await GitService.branches(tempDir);
      expect(branches[0].current).toBe(true);
      expect(branches[0].name).toBe("another");
    });
  });

  describe("currentBranch", () => {
    it("returns current branch name", async () => {
      initRepo(tempDir);
      const branch = await GitService.currentBranch(tempDir);
      expect(branch).toBe("main");
    });

    it("returns correct branch after checkout", async () => {
      initRepo(tempDir);
      git(tempDir, "checkout", "-b", "feature");

      const branch = await GitService.currentBranch(tempDir);
      expect(branch).toBe("feature");
    });
  });

  describe("checkout", () => {
    it("switches to existing branch", async () => {
      initRepo(tempDir);
      git(tempDir, "checkout", "-b", "feature");
      git(tempDir, "checkout", "main");

      await GitService.checkout(tempDir, "feature");
      const branch = await GitService.currentBranch(tempDir);
      expect(branch).toBe("feature");
    });
  });

  describe("createBranch", () => {
    it("creates a new branch", async () => {
      initRepo(tempDir);

      const branch = await GitService.createBranch(tempDir, "feature");
      expect(branch.name).toBe("feature");
      expect(branch.current).toBe(true);
    });

    it("creates branch from specific commit", async () => {
      initRepo(tempDir);
      fs.writeFileSync(path.join(tempDir, "file2.txt"), "content\n");
      git(tempDir, "add", "file2.txt");
      git(tempDir, "commit", "-m", "Second commit");

      const branch = await GitService.createBranch(tempDir, "feature", "HEAD~1");
      expect(branch.name).toBe("feature");

      // Should not have file2.txt since we branched from HEAD~1
      const hasFile = fs.existsSync(path.join(tempDir, "file2.txt"));
      expect(hasFile).toBe(false);
    });
  });

  describe("deleteBranch", () => {
    it("deletes a branch", async () => {
      initRepo(tempDir);
      git(tempDir, "checkout", "-b", "feature");
      git(tempDir, "checkout", "main");

      await GitService.deleteBranch(tempDir, "feature");

      const branches = await GitService.branches(tempDir);
      expect(branches.find((b) => b.name === "feature")).toBeUndefined();
    });
  });

  describe("log", () => {
    it("returns commit history", async () => {
      initRepo(tempDir);

      const commits = await GitService.log(tempDir);
      expect(commits).toHaveLength(1);
      expect(commits[0]).toMatchObject({
        message: "Initial commit",
        author: "Test User",
        email: "test@example.com",
      });
      expect(commits[0].hash).toBeDefined();
      expect(commits[0].hashShort).toHaveLength(7);
      expect(commits[0].date).toBeGreaterThan(0);
    });

    it("returns multiple commits", async () => {
      initRepo(tempDir);
      fs.writeFileSync(path.join(tempDir, "file2.txt"), "content\n");
      git(tempDir, "add", "file2.txt");
      git(tempDir, "commit", "-m", "Second commit");
      fs.writeFileSync(path.join(tempDir, "file3.txt"), "content\n");
      git(tempDir, "add", "file3.txt");
      git(tempDir, "commit", "-m", "Third commit");

      const commits = await GitService.log(tempDir);
      expect(commits).toHaveLength(3);
      expect(commits[0].message).toBe("Third commit");
      expect(commits[1].message).toBe("Second commit");
      expect(commits[2].message).toBe("Initial commit");
    });

    it("respects limit option", async () => {
      initRepo(tempDir);
      for (let i = 0; i < 5; i++) {
        fs.writeFileSync(path.join(tempDir, `file${i}.txt`), `content ${i}\n`);
        git(tempDir, "add", `file${i}.txt`);
        git(tempDir, "commit", "-m", `Commit ${i}`);
      }

      const commits = await GitService.log(tempDir, { limit: 3 });
      expect(commits).toHaveLength(3);
    });
  });

  describe("getCommit", () => {
    it("returns commit details", async () => {
      initRepo(tempDir);

      const commits = await GitService.log(tempDir);
      const commit = await GitService.getCommit(tempDir, commits[0].hash);

      expect(commit).not.toBeNull();
      expect(commit!.hash).toBe(commits[0].hash);
      expect(commit!.message).toBe("Initial commit");
      expect(commit!.files).toBeDefined();
    });

    it("returns null for non-existent commit", async () => {
      initRepo(tempDir);
      const commit = await GitService.getCommit(tempDir, "deadbeef");
      expect(commit).toBeNull();
    });
  });

  describe("commit", () => {
    it("creates a commit with all changes", async () => {
      initRepo(tempDir);
      fs.writeFileSync(path.join(tempDir, "newfile.txt"), "new content\n");
      fs.writeFileSync(path.join(tempDir, "README.md"), "# Modified\n");

      const result = await GitService.commit(tempDir, "Test commit");

      expect(result.hash).toBeDefined();
      expect(result.message).toBe("Test commit");
      expect(result.summary.changes).toBeGreaterThan(0);

      // Verify changes are committed
      const status = await GitService.status(tempDir);
      expect(status.files).toHaveLength(0);
    });

    it("includes untracked files", async () => {
      initRepo(tempDir);
      fs.writeFileSync(path.join(tempDir, "untracked.txt"), "untracked\n");

      await GitService.commit(tempDir, "Add untracked");

      const status = await GitService.status(tempDir);
      expect(status.files).toHaveLength(0);

      const commits = await GitService.log(tempDir);
      expect(commits[0].message).toBe("Add untracked");
    });
  });

  describe("diff", () => {
    it("returns empty diff for clean repo", async () => {
      initRepo(tempDir);
      const diff = await GitService.diff(tempDir);
      expect(diff).toBe("");
    });

    it("returns diff for modified file", async () => {
      initRepo(tempDir);
      fs.writeFileSync(path.join(tempDir, "README.md"), "# Modified Content\n");

      const diff = await GitService.diff(tempDir);
      expect(diff).toContain("-# Test Repo");
      expect(diff).toContain("+# Modified Content");
    });

    it("returns diff for specific file", async () => {
      initRepo(tempDir);
      fs.writeFileSync(path.join(tempDir, "README.md"), "# Modified\n");
      fs.writeFileSync(path.join(tempDir, "other.txt"), "other\n");
      git(tempDir, "add", "other.txt");

      const diff = await GitService.diff(tempDir, { file: "README.md" });
      expect(diff).toContain("README.md");
      expect(diff).not.toContain("other.txt");
    });
  });

  describe("commitDiff", () => {
    it("returns diff for a commit", async () => {
      initRepo(tempDir);
      fs.writeFileSync(path.join(tempDir, "newfile.txt"), "new content\n");
      git(tempDir, "add", "newfile.txt");
      git(tempDir, "commit", "-m", "Add newfile");

      const commits = await GitService.log(tempDir);
      const diff = await GitService.commitDiff(tempDir, commits[0].hash);

      expect(diff).toContain("newfile.txt");
      expect(diff).toContain("+new content");
    });
  });

  describe("discardChanges", () => {
    it("discards changes to a file", async () => {
      initRepo(tempDir);
      fs.writeFileSync(path.join(tempDir, "README.md"), "# Modified\n");

      await GitService.discardChanges(tempDir, "README.md");

      const content = fs.readFileSync(path.join(tempDir, "README.md"), "utf-8");
      expect(content).toBe("# Test Repo\n");
    });
  });

  describe("discardAllChanges", () => {
    it("discards all changes", async () => {
      initRepo(tempDir);
      fs.writeFileSync(path.join(tempDir, "README.md"), "# Modified\n");
      fs.writeFileSync(path.join(tempDir, "untracked.txt"), "untracked\n");

      await GitService.discardAllChanges(tempDir);

      const status = await GitService.status(tempDir);
      expect(status.files).toHaveLength(0);
    });
  });

  describe("clone", () => {
    it("clones a repository", async () => {
      // Create a "remote" repo
      const remoteDir = createTempDir();
      initRepo(remoteDir);

      try {
        const targetDir = path.join(tempDir, "cloned");
        const result = await GitService.clone({
          url: remoteDir,
          path: targetDir,
        });

        expect(result.path).toBe(targetDir);
        expect(fs.existsSync(path.join(targetDir, ".git"))).toBe(true);
        expect(fs.existsSync(path.join(targetDir, "README.md"))).toBe(true);
      } finally {
        removeTempDir(remoteDir);
      }
    });

    it("extracts repo name from URL", async () => {
      const remoteDir = createTempDir();
      initRepo(remoteDir);

      // Use unique name with timestamp to avoid conflicts
      const timestamp = Date.now();
      const repoName = `my-repo-${timestamp}`;
      const namedRemote = path.join(path.dirname(remoteDir), `${repoName}.git`);

      try {
        // Rename to simulate a URL-like path
        fs.renameSync(remoteDir, namedRemote);

        const result = await GitService.clone({
          url: namedRemote,
          path: path.join(tempDir, "cloned"),
        });

        expect(result.name).toBe(repoName);
      } finally {
        // Cleanup the renamed directory
        if (fs.existsSync(namedRemote)) {
          removeTempDir(namedRemote);
        }
      }
    });
  });

  describe("init", () => {
    it("initializes a new repository", async () => {
      const newDir = path.join(tempDir, "new-repo");
      await GitService.init(newDir);

      const isRepo = await GitService.isRepo(newDir);
      expect(isRepo).toBe(true);
    });
  });

  describe("remotes", () => {
    it("returns empty array for repo without remotes", async () => {
      initRepo(tempDir);
      const remotes = await GitService.remotes(tempDir);
      expect(remotes).toEqual([]);
    });

    it("returns remotes after adding", async () => {
      initRepo(tempDir);
      await GitService.addRemote(tempDir, "origin", "https://github.com/test/repo.git");

      const remotes = await GitService.remotes(tempDir);
      expect(remotes).toHaveLength(1);
      expect(remotes[0]).toMatchObject({
        name: "origin",
        url: "https://github.com/test/repo.git",
      });
    });
  });
});
