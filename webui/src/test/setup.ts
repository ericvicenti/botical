import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeAll, afterAll, vi } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";

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

  constructor(url: string) {
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
];

export const server = setupServer(...handlers);

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});
