import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeAll, afterAll, vi } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";

// React 19 compatibility fix for @testing-library/react
// The testing library expects React.act to be available, but React 19 doesn't export it by default
// We need to polyfill it for the testing environment
beforeAll(() => {
  // Create a simple act implementation that just runs the callback
  const mockAct = (callback: () => void) => {
    callback();
  };

  // Polyfill React.act for testing-library compatibility
  if (typeof globalThis !== 'undefined') {
    // @ts-expect-error - Polyfill for React 19 compatibility
    globalThis.React = globalThis.React || {};
    // @ts-expect-error - Polyfill for React 19 compatibility
    globalThis.React.act = mockAct;
  }

  // Also patch the react module directly
  const originalRequire = globalThis.require;
  if (originalRequire) {
    const Module = originalRequire('module');
    const originalLoad = Module._load;
    Module._load = function (id: string, ...args: any[]) {
      const result = originalLoad.apply(this, [id, ...args]);
      if (id === 'react' && result && !result.act) {
        result.act = mockAct;
      }
      return result;
    };
  }
});

// Mock window.matchMedia
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: query === "(prefers-color-scheme: dark)",
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.OPEN;
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(_url: string) {
    // Simulate connection after a tick
    setTimeout(() => {
      if (this.onopen) {
        this.onopen(new Event("open"));
      }
    }, 0);
  }

  send = vi.fn();
  close = vi.fn(() => {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose(new CloseEvent("close"));
    }
  });
}

// @ts-expect-error - Mock WebSocket
global.WebSocket = MockWebSocket;

// Default mock handlers
export const handlers = [
  // Projects
  http.get("/api/projects", () => {
    return HttpResponse.json({
      data: [
        {
          id: "prj_test1",
          name: "Test Project 1",
          description: "A test project",
          ownerId: "usr_test",
          type: "local",
          path: "/test/path/project1",
          gitRemote: null,
          iconUrl: null,
          color: null,
          settings: {},
          createdAt: Date.now() - 86400000,
          updatedAt: Date.now() - 86400000,
          archivedAt: null,
        },
        {
          id: "prj_test2",
          name: "Test Project 2",
          description: null,
          ownerId: "usr_test",
          type: "local",
          path: "/test/path/project2",
          gitRemote: null,
          iconUrl: null,
          color: null,
          settings: {},
          createdAt: Date.now(),
          updatedAt: Date.now(),
          archivedAt: null,
        },
      ],
      meta: { total: 2, limit: 50, offset: 0, hasMore: false },
    });
  }),

  http.post("/api/projects", async ({ request }) => {
    const body = (await request.json()) as { name: string; path?: string };
    return HttpResponse.json(
      {
        data: {
          id: "prj_new",
          name: body.name,
          description: null,
          ownerId: "usr_test",
          type: "local",
          path: body.path || `/projects/${body.name.toLowerCase().replace(/\s+/g, "-")}`,
          gitRemote: null,
          iconUrl: null,
          color: null,
          settings: {},
          createdAt: Date.now(),
          updatedAt: Date.now(),
          archivedAt: null,
        },
      },
      { status: 201 }
    );
  }),

  http.get("/api/projects/:id", ({ params }) => {
    return HttpResponse.json({
      data: {
        id: params.id,
        name: "Test Project",
        description: "A test project",
        ownerId: "usr_test",
        type: "local",
        path: "/test/path",
        gitRemote: null,
        iconUrl: null,
        color: null,
        settings: {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
        archivedAt: null,
      },
    });
  }),

  // Sessions
  http.get("/api/projects/:id/sessions", () => {
    return HttpResponse.json({
      data: [],
      meta: { total: 0, limit: 50, offset: 0, hasMore: false },
    });
  }),

  // Missions
  http.get("/api/projects/:id/missions", () => {
    return HttpResponse.json({
      data: [],
      meta: { total: 0, limit: 50, offset: 0, hasMore: false },
    });
  }),

  // Processes
  http.get("/api/projects/:id/processes", () => {
    return HttpResponse.json({
      data: [],
      meta: { total: 0, limit: 50, offset: 0, hasMore: false },
    });
  }),

  // Files - list directory
  http.get("/api/projects/:projectId/files", ({ request }) => {
    const url = new URL(request.url);
    const path = url.searchParams.get("path");

    // Root directory
    if (!path) {
      return HttpResponse.json({
        data: [
          { name: "src", path: "src", type: "directory" },
          { name: "package.json", path: "package.json", type: "file", size: 1024, modified: Date.now() },
          { name: "README.md", path: "README.md", type: "file", size: 512, modified: Date.now() },
        ],
      });
    }

    // src directory
    if (path === "src") {
      return HttpResponse.json({
        data: [
          { name: "index.ts", path: "src/index.ts", type: "file", size: 256, modified: Date.now() },
          { name: "utils", path: "src/utils", type: "directory" },
        ],
      });
    }

    // src/utils directory
    if (path === "src/utils") {
      return HttpResponse.json({
        data: [
          { name: "helpers.ts", path: "src/utils/helpers.ts", type: "file", size: 128, modified: Date.now() },
        ],
      });
    }

    // Empty directory for others
    return HttpResponse.json({ data: [] });
  }),

  // Files - get file content
  http.get("/api/projects/:projectId/files/:path", ({ params }) => {
    const path = decodeURIComponent(params.path as string);

    const fileContents: Record<string, string> = {
      "package.json": '{\n  "name": "test-project",\n  "version": "1.0.0"\n}',
      "README.md": "# Test Project\n\nA test project for testing.",
      "src/index.ts": 'export function main() {\n  console.log("Hello, world!");\n}',
      "src/utils/helpers.ts": "export const add = (a: number, b: number) => a + b;",
    };

    const content = fileContents[path] || "";

    return HttpResponse.json({
      content,
      path,
      size: content.length,
      modified: Date.now(),
    });
  }),

  // Files - save file
  http.put("/api/projects/:projectId/files/:path", async ({ params }) => {
    const path = decodeURIComponent(params.path as string);

    return HttpResponse.json({
      path,
      size: 100,
      modified: Date.now(),
    });
  }),

  // Files - delete file
  http.delete("/api/projects/:projectId/files/:path", () => {
    return HttpResponse.json({ success: true });
  }),

  // Files - rename/move file
  http.post("/api/projects/:projectId/files/:path/move", async ({ request }) => {
    const body = (await request.json()) as { destination: string };
    return HttpResponse.json({ path: body.destination });
  }),

  // Files - create file
  http.post("/api/projects/:projectId/files", async ({ request }) => {
    const body = (await request.json()) as { path: string; content: string };
    return HttpResponse.json({
      path: body.path,
      size: body.content.length,
      modified: Date.now(),
    });
  }),

  // Folders - create folder
  http.post("/api/projects/:projectId/folders/:path", ({ params }) => {
    const path = decodeURIComponent(params.path as string);
    return HttpResponse.json({ path });
  }),
];

export const server = setupServer(...handlers);

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
  // Clear localStorage to ensure test isolation
  localStorage.clear();
});

afterAll(() => {
  server.close();
});
