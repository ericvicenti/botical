import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { LocalUserService, LOCAL_USER_ID } from "@/auth/local-user.ts";
import { DatabaseManager } from "@/database/manager.ts";
import { Config } from "@/config/index.ts";
import fs from "fs";
import path from "path";

describe("LocalUserService", () => {
  const testDataDir = path.join(
    import.meta.dirname,
    "../../../.test-data/local-user-test"
  );

  beforeEach(async () => {
    // Reset database for each test
    DatabaseManager.closeAll();
    Config.load({ dataDir: testDataDir });

    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }

    // Initialize database
    await DatabaseManager.initialize();
  });

  afterEach(() => {
    DatabaseManager.closeAll();
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  describe("LOCAL_USER_ID", () => {
    it("has the expected value", () => {
      expect(LOCAL_USER_ID).toBe("usr_local");
    });
  });

  describe("getLocalUserId", () => {
    it("returns the local user ID", () => {
      expect(LocalUserService.getLocalUserId()).toBe("usr_local");
    });
  });

  describe("isLocalUser", () => {
    it("returns true for local user ID", () => {
      expect(LocalUserService.isLocalUser("usr_local")).toBe(true);
    });

    it("returns false for other user IDs", () => {
      expect(LocalUserService.isLocalUser("usr_other")).toBe(false);
      expect(LocalUserService.isLocalUser("usr_123")).toBe(false);
      expect(LocalUserService.isLocalUser("")).toBe(false);
    });
  });

  describe("ensureLocalUser", () => {
    it("creates local user on first call", () => {
      const db = DatabaseManager.getRootDb();

      // Verify user doesn't exist
      const beforeUser = db
        .prepare("SELECT * FROM users WHERE id = ?")
        .get(LOCAL_USER_ID);
      expect(beforeUser).toBeNull();

      // Create local user
      const authContext = LocalUserService.ensureLocalUser();

      // Verify user was created
      const afterUser = db
        .prepare("SELECT * FROM users WHERE id = ?")
        .get(LOCAL_USER_ID) as {
        id: string;
        email: string;
        username: string;
        is_admin: number;
        can_execute_code: number;
      };
      expect(afterUser).toBeDefined();
      expect(afterUser.id).toBe(LOCAL_USER_ID);
      expect(afterUser.email).toBe("local@botical.local");
      expect(afterUser.username).toBe("Local User");
      expect(afterUser.is_admin).toBe(1);
      expect(afterUser.can_execute_code).toBe(1);

      // Verify auth context
      expect(authContext.userId).toBe(LOCAL_USER_ID);
      expect(authContext.email).toBe("local@botical.local");
      expect(authContext.isAdmin).toBe(true);
      expect(authContext.canExecuteCode).toBe(true);
    });

    it("returns existing user on subsequent calls", () => {
      const db = DatabaseManager.getRootDb();

      // Create user first time
      const first = LocalUserService.ensureLocalUser();
      expect(first.userId).toBe(LOCAL_USER_ID);

      // Get user count
      const count1 = db
        .prepare("SELECT COUNT(*) as count FROM users WHERE id = ?")
        .get(LOCAL_USER_ID) as { count: number };
      expect(count1.count).toBe(1);

      // Create user second time
      const second = LocalUserService.ensureLocalUser();
      expect(second.userId).toBe(LOCAL_USER_ID);

      // Verify no duplicate users
      const count2 = db
        .prepare("SELECT COUNT(*) as count FROM users WHERE id = ?")
        .get(LOCAL_USER_ID) as { count: number };
      expect(count2.count).toBe(1);
    });

    it("returns auth context with admin privileges", () => {
      const authContext = LocalUserService.ensureLocalUser();

      expect(authContext.isAdmin).toBe(true);
      expect(authContext.canExecuteCode).toBe(true);
    });

    it("returns consistent auth context on multiple calls", () => {
      const first = LocalUserService.ensureLocalUser();
      const second = LocalUserService.ensureLocalUser();

      expect(first).toEqual(second);
    });
  });
});
