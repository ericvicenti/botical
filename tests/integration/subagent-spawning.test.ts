import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createApp } from "@/server/app";
import { Database } from "@/database/connection";
import { createAuthSession, createAuthHeaders } from "./helpers/auth";

describe("Sub-Agent Spawning Integration", () => {
  let app: ReturnType<typeof createApp>;
  let db: Database;
  let authHeaders: Record<string, string>;
  let projectId: string;

  beforeEach(async () => {
    // Create app instance
    app = createApp();
    
    // Set test environment
    process.env.NODE_ENV = "test";
    process.env.BOTICAL_SINGLE_USER = "true";
    
    // Reset email service for test mode
    const { EmailService } = await import("@/services/email");
    EmailService.resetConfig();

    // Register all actions (including agent.task)
    const { registerAllActions } = await import("@/actions/index");
    registerAllActions();

    // Create auth session
    const authData = await createAuthSession(app);
    authHeaders = createAuthHeaders(authData.sessionToken);

    // Create test project
    const projectRes = await app.request("/api/projects", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
      },
      body: JSON.stringify({
        name: "Sub-Agent Test Project",
        path: "/tmp/subagent-test",
      }),
    });

    expect(projectRes.status).toBe(201);
    const projectData = await projectRes.json();
    projectId = projectData.data.id;
  });

  afterEach(async () => {
    // Clean up test project if it exists
    if (projectId) {
      await app.request(`/api/projects/${projectId}`, {
        method: "DELETE",
        headers: authHeaders,
      });
    }
    
    // Clean up environment variable
    delete process.env.BOTICAL_SINGLE_USER;
  });

  describe("task tool sub-agent spawning", () => {
    it("should spawn sub-agent via task tool", async () => {
      // Create a parent session
      const parentSessionRes = await app.request("/api/sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify({
          projectId,
          agentName: "parent-agent",
          content: "Parent session for sub-agent testing",
        }),
      });

      expect(parentSessionRes.status).toBe(201);
      const parentSessionData = await parentSessionRes.json();
      const parentSessionId = parentSessionData.data.id;

      // Execute task tool to spawn sub-agent
      const taskRes = await app.request("/api/tools/actions/execute", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify({
          actionId: "agent.task",
          projectId,
          sessionId: parentSessionId,
          args: {
            description: "Test sub-agent task",
            prompt: "You are a test sub-agent. Respond with 'Sub-agent task completed successfully' and nothing else.",
            subagent_type: "default",
            max_turns: 5,
          },
        }),
      });

      expect(taskRes.status).toBe(200);
      const taskData = await taskRes.json();
      
      // Should have spawned a sub-agent session
      expect(taskData.success).toBe(true);
      expect(taskData.data).toBeDefined();
      expect(taskData.data.sessionId).toBeDefined();
      expect(taskData.data.sessionId).not.toBe(parentSessionId);
    });

    it("should handle different sub-agent types", async () => {
      const parentSessionRes = await app.request("/api/sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify({
          projectId,
          agentName: "parent-agent",
          content: "Testing different sub-agent types",
        }),
      });

      expect(parentSessionRes.status).toBe(201);
      const parentSessionData = await parentSessionRes.json();
      const parentSessionId = parentSessionData.data.id;

      // Test explore sub-agent type
      const exploreRes = await app.request("/api/tools/actions/execute", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify({
          actionId: "agent.task",
          projectId,
          sessionId: parentSessionId,
          args: {
            description: "Explore sub-agent",
            prompt: "You are an explore sub-agent. List the available tools and respond with 'Exploration complete'.",
            subagent_type: "explore",
            max_turns: 3,
          },
        }),
      });

      expect(exploreRes.status).toBe(200);
      const exploreData = await exploreRes.json();
      expect(exploreData.success).toBe(true);
      expect(exploreData.data.sessionId).toBeDefined();

      // Test plan sub-agent type
      const planRes = await app.request("/api/tools/actions/execute", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify({
          actionId: "agent.task",
          projectId,
          sessionId: parentSessionId,
          args: {
            description: "Plan sub-agent",
            prompt: "You are a planning sub-agent. Create a simple plan and respond with 'Planning complete'.",
            subagent_type: "plan",
            max_turns: 3,
          },
        }),
      });

      expect(planRes.status).toBe(200);
      const planData = await planRes.json();
      expect(planData.success).toBe(true);
      expect(planData.data.sessionId).toBeDefined();
    });

    it("should validate task parameters", async () => {
      const parentSessionRes = await app.request("/api/sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify({
          projectId,
          agentName: "parent-agent",
          content: "Testing parameter validation",
        }),
      });

      expect(parentSessionRes.status).toBe(201);
      const parentSessionData = await parentSessionRes.json();
      const parentSessionId = parentSessionData.data.id;

      // Missing description
      const noDescRes = await app.request("/api/tools/actions/execute", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify({
          actionId: "agent.task",
          projectId,
          sessionId: parentSessionId,
          args: {
            prompt: "Test prompt without description",
          },
        }),
      });

      expect(noDescRes.status).toBe(400);

      // Missing prompt
      const noPromptRes = await app.request("/api/tools/actions/execute", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify({
          actionId: "agent.task",
          projectId,
          sessionId: parentSessionId,
          args: {
            description: "Test description without prompt",
          },
        }),
      });

      expect(noPromptRes.status).toBe(400);

      // Invalid max_turns
      const invalidTurnsRes = await app.request("/api/tools/actions/execute", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify({
          actionId: "agent.task",
          projectId,
          sessionId: parentSessionId,
          args: {
            description: "Test description",
            prompt: "Test prompt",
            max_turns: 0, // Invalid: must be > 0
          },
        }),
      });

      expect(invalidTurnsRes.status).toBe(400);
    });

    it("should handle sub-agent execution limits", async () => {
      const parentSessionRes = await app.request("/api/sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify({
          projectId,
          agentName: "parent-agent",
          content: "Testing execution limits",
        }),
      });

      expect(parentSessionRes.status).toBe(201);
      const parentSessionData = await parentSessionRes.json();
      const parentSessionId = parentSessionData.data.id;

      // Test with very low max_turns
      const limitedRes = await app.request("/api/tools/actions/execute", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify({
          actionId: "agent.task",
          projectId,
          sessionId: parentSessionId,
          args: {
            description: "Limited turns test",
            prompt: "You have very limited turns. Respond immediately with 'Limited response'.",
            max_turns: 1,
          },
        }),
      });

      expect(limitedRes.status).toBe(200);
      const limitedData = await limitedRes.json();
      expect(limitedData.success).toBe(true);
      expect(limitedData.data.sessionId).toBeDefined();
    });
  });

  describe("workflow session steps", () => {
    it("should create workflow with session step", async () => {
      // Create a workflow with a session step
      const workflowRes = await app.request("/api/workflows", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify({
          projectId,
          label: "Sub-Agent Workflow Test",
          description: "Testing workflow with session step",
          input: {},
          steps: [
            {
              id: "session-step-1",
              type: "session",
              agentType: "default",
              systemPrompt: "You are a sub-agent in a workflow. Respond with 'Workflow sub-agent active'.",
              message: "Execute workflow sub-agent task",
              maxSteps: 3,
            },
          ],
        }),
      });

      expect(workflowRes.status).toBe(201);
      const workflowData = await workflowRes.json();
      expect(workflowData.data.id).toBeDefined();
      
      const workflowId = workflowData.data.id;

      // Execute the workflow
      const executeRes = await app.request(`/api/workflows/${workflowId}/execute`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify({
          input: {},
        }),
      });

      expect(executeRes.status).toBe(201);
      const executeData = await executeRes.json();
      expect(executeData.data.executionId).toBeDefined();
    });

    it("should handle session step with custom agent configuration", async () => {
      const workflowRes = await app.request("/api/workflows", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify({
          projectId,
          label: "Custom Agent Workflow",
          description: "Testing workflow with custom agent config",
          input: {},
          steps: [
            {
              id: "custom-session-step",
              type: "session",
              agentType: "default",
              systemPrompt: "You are a custom configured sub-agent. Your task is to analyze and respond.",
              message: "Analyze this workflow execution",
              maxSteps: 5,
              providerId: "anthropic", // This will fail without API key, but should create the workflow
              modelId: "claude-3-haiku-20240307",
            },
          ],
        }),
      });

      expect(workflowRes.status).toBe(201);
      const workflowData = await workflowRes.json();
      expect(workflowData.data.steps[0].providerId).toBe("anthropic");
      expect(workflowData.data.steps[0].modelId).toBe("claude-3-haiku-20240307");
    });

    it("should validate session step configuration", async () => {
      // Missing required fields
      const invalidRes = await app.request("/api/workflows", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify({
          projectId,
          label: "Invalid Session Step Workflow",
          description: "Testing invalid session step",
          input: {},
          steps: [
            {
              id: "invalid-session-step",
              type: "session",
              // Missing required fields: agentType, message
            },
          ],
        }),
      });

      expect(invalidRes.status).toBe(400);
    });
  });

  describe("sub-agent session hierarchy", () => {
    it("should maintain parent-child session relationships", async () => {
      // Create parent session
      const parentRes = await app.request("/api/sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify({
          projectId,
          agentName: "parent-agent",
          content: "Parent session for hierarchy testing",
        }),
      });

      expect(parentRes.status).toBe(201);
      const parentData = await parentRes.json();
      const parentSessionId = parentData.data.id;

      // Spawn sub-agent
      const taskRes = await app.request("/api/tools/actions/execute", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify({
          actionId: "agent.task",
          projectId,
          sessionId: parentSessionId,
          args: {
            description: "Child session test",
            prompt: "You are a child sub-agent. Respond with your session hierarchy status.",
            max_turns: 2,
          },
        }),
      });

      expect(taskRes.status).toBe(200);
      const taskData = await taskRes.json();
      const childSessionId = taskData.data.sessionId;

      // Verify parent session exists
      const parentCheckRes = await app.request(`/api/sessions/${parentSessionId}`, {
        headers: authHeaders,
      });
      expect(parentCheckRes.status).toBe(200);

      // Verify child session exists
      const childCheckRes = await app.request(`/api/sessions/${childSessionId}`, {
        headers: authHeaders,
      });
      expect(childCheckRes.status).toBe(200);
      const childCheckData = await childCheckRes.json();
      
      // Child should have parent reference
      expect(childCheckData.data.parentId).toBe(parentSessionId);
    });

    it("should list child sessions from parent", async () => {
      // Create parent session
      const parentRes = await app.request("/api/sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify({
          projectId,
          agentName: "parent-agent",
          content: "Parent for multiple children",
        }),
      });

      expect(parentRes.status).toBe(201);
      const parentData = await parentRes.json();
      const parentSessionId = parentData.data.id;

      // Spawn multiple sub-agents
      const childPromises = Array.from({ length: 2 }, (_, i) =>
        app.request("/api/tools/actions/execute", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...authHeaders,
          },
          body: JSON.stringify({
            actionId: "agent.task",
            projectId,
            sessionId: parentSessionId,
            args: {
              description: `Child ${i + 1}`,
              prompt: `You are child sub-agent ${i + 1}. Respond with 'Child ${i + 1} active'.`,
              max_turns: 1,
            },
          }),
        })
      );

      const childResponses = await Promise.all(childPromises);
      childResponses.forEach(res => {
        expect(res.status).toBe(200);
      });

      // Get all sessions for the project
      const sessionsRes = await app.request(`/api/sessions?projectId=${projectId}`, {
        headers: authHeaders,
      });

      expect(sessionsRes.status).toBe(200);
      const sessionsData = await sessionsRes.json();
      
      // Should have parent + children
      expect(sessionsData.data.length).toBeGreaterThanOrEqual(3);
      
      // Find child sessions
      const childSessions = sessionsData.data.filter((s: any) => s.parentId === parentSessionId);
      expect(childSessions.length).toBe(2);
    });
  });

  describe("sub-agent error handling", () => {
    it("should handle sub-agent creation failures gracefully", async () => {
      const parentRes = await app.request("/api/sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify({
          projectId,
          agentName: "parent-agent",
          content: "Testing error handling",
        }),
      });

      expect(parentRes.status).toBe(201);
      const parentData = await parentRes.json();
      const parentSessionId = parentData.data.id;

      // Try to spawn sub-agent with invalid configuration
      const invalidRes = await app.request("/api/tools/actions/execute", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify({
          actionId: "agent.task",
          projectId,
          sessionId: parentSessionId,
          args: {
            description: "Invalid config test",
            prompt: "Test prompt",
            max_turns: 100, // Exceeds maximum allowed
          },
        }),
      });

      // Should handle the error gracefully
      expect(invalidRes.status).toBe(400);
    });

    it("should handle non-existent parent session", async () => {
      const taskRes = await app.request("/api/tools/actions/execute", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify({
          actionId: "agent.task",
          projectId,
          sessionId: "sess_nonexistent",
          args: {
            description: "Orphan sub-agent test",
            prompt: "This should fail due to non-existent parent",
            max_turns: 1,
          },
        }),
      });

      expect(taskRes.status).toBe(404);
    });
  });

  describe("background sub-agent execution", () => {
    it("should support background sub-agent execution", async () => {
      const parentRes = await app.request("/api/sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify({
          projectId,
          agentName: "parent-agent",
          content: "Testing background execution",
        }),
      });

      expect(parentRes.status).toBe(201);
      const parentData = await parentRes.json();
      const parentSessionId = parentData.data.id;

      // Spawn background sub-agent
      const backgroundRes = await app.request("/api/tools/actions/execute", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify({
          actionId: "agent.task",
          projectId,
          sessionId: parentSessionId,
          args: {
            description: "Background task",
            prompt: "You are running in the background. Complete your task and respond with 'Background task complete'.",
            run_in_background: true,
            max_turns: 3,
          },
        }),
      });

      expect(backgroundRes.status).toBe(200);
      const backgroundData = await backgroundRes.json();
      expect(backgroundData.success).toBe(true);
      expect(backgroundData.data.sessionId).toBeDefined();
      
      // Background execution should return immediately
      expect(backgroundData.data.background).toBe(true);
    });
  });
});