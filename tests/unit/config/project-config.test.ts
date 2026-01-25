/**
 * Project Config Service Tests
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { ProjectConfigService } from "@/config/project.ts";
import fs from "fs";
import path from "path";

describe("ProjectConfigService", () => {
  const testDir = path.join(
    import.meta.dirname,
    "../../.test-data/project-config-test"
  );
  const testProjectPath = path.join(testDir, "test-project");

  beforeEach(() => {
    // Clean up and create test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    fs.mkdirSync(path.join(testProjectPath, ".iris"), { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("exists", () => {
    it("returns false when config doesn't exist", () => {
      expect(ProjectConfigService.exists(testProjectPath)).toBe(false);
    });

    it("returns true when config exists", () => {
      ProjectConfigService.save(testProjectPath, { name: "Test" });
      expect(ProjectConfigService.exists(testProjectPath)).toBe(true);
    });
  });

  describe("load", () => {
    it("returns empty config when file doesn't exist", () => {
      const config = ProjectConfigService.load(testProjectPath);
      expect(config).toEqual({});
    });

    it("loads saved config", () => {
      ProjectConfigService.save(testProjectPath, {
        name: "Test Project",
        description: "A test project",
      });

      const config = ProjectConfigService.load(testProjectPath);
      expect(config.name).toBe("Test Project");
      expect(config.description).toBe("A test project");
    });
  });

  describe("save", () => {
    it("saves config to YAML file", () => {
      ProjectConfigService.save(testProjectPath, {
        name: "My Project",
        model: {
          providerId: "openai",
          modelId: "gpt-4",
        },
      });

      const configPath = ProjectConfigService.getPath(testProjectPath);
      expect(fs.existsSync(configPath)).toBe(true);

      const content = fs.readFileSync(configPath, "utf-8");
      expect(content).toContain("name: My Project");
      expect(content).toContain("providerId: openai");
    });

    it("cleans empty values from config", () => {
      ProjectConfigService.save(testProjectPath, {
        name: "Test",
        description: undefined,
        settings: {},
      });

      const config = ProjectConfigService.load(testProjectPath);
      expect(config.name).toBe("Test");
      expect(config.description).toBeUndefined();
      expect(config.settings).toBeUndefined();
    });
  });

  describe("update", () => {
    it("merges updates with existing config", () => {
      ProjectConfigService.save(testProjectPath, {
        name: "Original",
        model: { providerId: "openai" },
      });

      const updated = ProjectConfigService.update(testProjectPath, {
        description: "Added description",
        model: { modelId: "gpt-4" },
      });

      expect(updated.name).toBe("Original");
      expect(updated.description).toBe("Added description");
      expect(updated.model?.providerId).toBe("openai");
      expect(updated.model?.modelId).toBe("gpt-4");
    });
  });

  describe("settings management", () => {
    it("gets and sets individual settings", () => {
      ProjectConfigService.setSetting(testProjectPath, "theme", "dark");
      ProjectConfigService.setSetting(testProjectPath, "fontSize", 14);

      expect(ProjectConfigService.getSetting<string>(testProjectPath, "theme")).toBe("dark");
      expect(ProjectConfigService.getSetting<number>(testProjectPath, "fontSize")).toBe(14);
    });

    it("deletes settings", () => {
      ProjectConfigService.setSetting(testProjectPath, "toDelete", "value");
      expect(ProjectConfigService.getSetting<string>(testProjectPath, "toDelete")).toBe("value");

      ProjectConfigService.deleteSetting(testProjectPath, "toDelete");
      expect(ProjectConfigService.getSetting(testProjectPath, "toDelete")).toBeUndefined();
    });
  });

  describe("environment variables", () => {
    it("gets and sets environment variables", () => {
      ProjectConfigService.setEnv(testProjectPath, {
        NODE_ENV: "development",
        DEBUG: "true",
      });

      const env = ProjectConfigService.getEnv(testProjectPath);
      expect(env.NODE_ENV).toBe("development");
      expect(env.DEBUG).toBe("true");
    });

    it("merges environment variables", () => {
      ProjectConfigService.setEnv(testProjectPath, { VAR1: "value1" });
      ProjectConfigService.setEnv(testProjectPath, { VAR2: "value2" });

      const env = ProjectConfigService.getEnv(testProjectPath);
      expect(env.VAR1).toBe("value1");
      expect(env.VAR2).toBe("value2");
    });
  });

  describe("model configuration", () => {
    it("gets model config", () => {
      ProjectConfigService.save(testProjectPath, {
        model: {
          providerId: "anthropic",
          modelId: "claude-3",
          temperature: 0.7,
        },
      });

      const modelConfig = ProjectConfigService.getModelConfig(testProjectPath);
      expect(modelConfig?.providerId).toBe("anthropic");
      expect(modelConfig?.modelId).toBe("claude-3");
      expect(modelConfig?.temperature).toBe(0.7);
    });
  });

  describe("default agent configuration", () => {
    it("gets default agent config", () => {
      ProjectConfigService.save(testProjectPath, {
        defaultAgent: {
          name: "custom-agent",
          model: { temperature: 0.5 },
          tools: ["read", "glob", "grep"],
        },
      });

      const agentConfig = ProjectConfigService.getDefaultAgentConfig(testProjectPath);
      expect(agentConfig?.name).toBe("custom-agent");
      expect(agentConfig?.model?.temperature).toBe(0.5);
      expect(agentConfig?.tools).toContain("glob");
    });
  });

  describe("git configuration", () => {
    it("gets git config", () => {
      ProjectConfigService.save(testProjectPath, {
        git: {
          remote: "origin",
          branch: "main",
          autoCommit: true,
        },
      });

      const gitConfig = ProjectConfigService.getGitConfig(testProjectPath);
      expect(gitConfig?.remote).toBe("origin");
      expect(gitConfig?.branch).toBe("main");
      expect(gitConfig?.autoCommit).toBe(true);
    });
  });

  describe("tools configuration", () => {
    it("gets tools config", () => {
      ProjectConfigService.save(testProjectPath, {
        tools: {
          enabled: ["read", "write", "edit"],
          disabled: ["bash"],
        },
      });

      const toolsConfig = ProjectConfigService.getToolsConfig(testProjectPath);
      expect(toolsConfig?.enabled).toContain("read");
      expect(toolsConfig?.disabled).toContain("bash");
    });
  });
});
