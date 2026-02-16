/**
 * Files Folder Creation Integration Tests
 *
 * Tests the folder creation API endpoint.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createApp } from "@/server/app.ts";
import { DatabaseManager } from "@/database/manager.ts";
import { Config } from "@/config/index.ts";
import { ProjectService } from "@/services/projects.ts";
import { createAuthSession, createAuthHeaders } from "./helpers/auth";
import fs from "fs";
import path from "path";

interface FolderCreateResponse {
  data: {
    path: string;
  };
}

interface ErrorResponse {
  error: {
    code: string;
    message: string;
  };
}

describe("Files Folder Creation API", () => {
  const testDataDir = path.join(
    import.meta.dirname,
    "../.test-data/files-folder-create"
  );
  const projectDir = path.join(testDataDir, "project");
  let app: ReturnType<typeof createApp>;
  let projectId: string;
  let testUserId: string;
  let sessionToken: string;

  beforeEach(async () => {
    // Close any existing connections
    DatabaseManager.closeAll();

    // Set config data dir
    Config.load({ dataDir: testDataDir });

    // Clean up and create test directory structure
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
    fs.mkdirSync(projectDir, { recursive: true });

    // Initialize database
    await DatabaseManager.initialize();

    // Create the app
    app = createApp();

    // Create a test user first
    const rootDb = DatabaseManager.getRootDb();
    const now = Date.now();
    testUserId = `usr_test-${now}`;
    rootDb
      .prepare(
        "INSERT INTO users (id, email, username, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
      )
      .run(testUserId, "test@example.com", "testuser", now, now);

    // Create a test project
    const project = ProjectService.create(rootDb, {
      name: "Test Project",
      ownerId: testUserId,
      type: "local",
      path: projectDir,
    });
    projectId = project.id;

    // Create authenticated session
    sessionToken = await createAuthSession(app, "test@example.com");
  });

  afterEach(() => {
    DatabaseManager.closeAll();
    // Clean up test directory
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  it("should create a folder at the root level", async () => {
    const response = await app.request(
      `/api/projects/${projectId}/folders/my-new-folder`,
      {
        method: "POST",
        headers: createAuthHeaders(sessionToken),
      }
    );

    expect(response.status).toBe(201);
    const data = (await response.json()) as FolderCreateResponse;
    expect(data.data.path).toBe("my-new-folder");

    // Verify the folder was actually created on disk
    const folderPath = path.join(projectDir, "my-new-folder");
    expect(fs.existsSync(folderPath)).toBe(true);
    expect(fs.statSync(folderPath).isDirectory()).toBe(true);
  });

  it("should create a nested folder", async () => {
    const response = await app.request(
      `/api/projects/${projectId}/folders/parent/child/grandchild`,
      {
        method: "POST",
        headers: createAuthHeaders(sessionToken),
      }
    );

    expect(response.status).toBe(201);
    const data = (await response.json()) as FolderCreateResponse;
    expect(data.data.path).toBe("parent/child/grandchild");

    // Verify the folder was actually created on disk
    const folderPath = path.join(projectDir, "parent/child/grandchild");
    expect(fs.existsSync(folderPath)).toBe(true);
    expect(fs.statSync(folderPath).isDirectory()).toBe(true);
  });

  it("should handle URL-encoded folder names", async () => {
    // Encode a folder name with special characters
    const folderName = "my folder with spaces";
    const encodedName = encodeURIComponent(folderName);

    const response = await app.request(
      `/api/projects/${projectId}/folders/${encodedName}`,
      {
        method: "POST",
        headers: createAuthHeaders(sessionToken),
      }
    );

    expect(response.status).toBe(201);
    const data = (await response.json()) as FolderCreateResponse;
    expect(data.data.path).toBe(folderName);

    // Verify the folder was actually created on disk
    const folderPath = path.join(projectDir, folderName);
    expect(fs.existsSync(folderPath)).toBe(true);
    expect(fs.statSync(folderPath).isDirectory()).toBe(true);
  });

  it("should handle URL-encoded nested paths", async () => {
    // Encode a path with slashes
    const nestedPath = "src/components";
    const encodedPath = encodeURIComponent(nestedPath);

    const response = await app.request(
      `/api/projects/${projectId}/folders/${encodedPath}`,
      {
        method: "POST",
        headers: createAuthHeaders(sessionToken),
      }
    );

    expect(response.status).toBe(201);
    const data = (await response.json()) as FolderCreateResponse;
    expect(data.data.path).toBe(nestedPath);

    // Verify the folder was actually created on disk
    const folderPath = path.join(projectDir, nestedPath);
    expect(fs.existsSync(folderPath)).toBe(true);
    expect(fs.statSync(folderPath).isDirectory()).toBe(true);
  });

  it("should return 400 when folder path is empty", async () => {
    const response = await app.request(
      `/api/projects/${projectId}/folders/`,
      {
        method: "POST",
        headers: createAuthHeaders(sessionToken),
      }
    );

    // Route matches but validation fails - returns 400
    expect(response.status).toBe(400);
    const data = (await response.json()) as ErrorResponse;
    expect(data.error.message).toBe("Folder path is required");
  });

  it("should return 404 when project does not exist", async () => {
    const response = await app.request(
      `/api/projects/nonexistent-project/folders/test-folder`,
      {
        method: "POST",
        headers: createAuthHeaders(sessionToken),
      }
    );

    expect(response.status).toBe(404);
  });

  it("should handle folder names with special characters", async () => {
    const folderName = "test-folder_with.special-chars";

    const response = await app.request(
      `/api/projects/${projectId}/folders/${folderName}`,
      {
        method: "POST",
        headers: createAuthHeaders(sessionToken),
      }
    );

    expect(response.status).toBe(201);
    const data = (await response.json()) as FolderCreateResponse;
    expect(data.data.path).toBe(folderName);

    // Verify the folder was actually created on disk
    const folderPath = path.join(projectDir, folderName);
    expect(fs.existsSync(folderPath)).toBe(true);
  });

  it("should be idempotent - creating same folder twice should succeed", async () => {
    const folderName = "idempotent-folder";

    // Create the folder first time
    const response1 = await app.request(
      `/api/projects/${projectId}/folders/${folderName}`,
      {
        method: "POST",
        headers: createAuthHeaders(sessionToken),
      }
    );
    expect(response1.status).toBe(201);

    // Create the same folder again
    const response2 = await app.request(
      `/api/projects/${projectId}/folders/${folderName}`,
      {
        method: "POST",
        headers: createAuthHeaders(sessionToken),
      }
    );
    expect(response2.status).toBe(201);

    // Verify the folder exists
    const folderPath = path.join(projectDir, folderName);
    expect(fs.existsSync(folderPath)).toBe(true);
  });
});
