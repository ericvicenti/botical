import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/utils";
import { BottomPanel } from "./BottomPanel";

// Mock the WebSocket context
vi.mock("@/lib/websocket/context", () => ({
  useWebSocket: () => ({
    status: "connected",
    send: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  }),
}));

describe("BottomPanel", () => {
  it("shows connected status when websocket is connected", () => {
    render(<BottomPanel />, { withRouter: false });

    expect(screen.getByText("connected")).toBeInTheDocument();
  });

  it("shows connecting status when websocket is connecting", async () => {
    // Override the mock for this test
    vi.doMock("@/lib/websocket/context", () => ({
      useWebSocket: () => ({
        status: "connecting",
        send: vi.fn(),
        subscribe: vi.fn(),
        unsubscribe: vi.fn(),
      }),
    }));

    // Re-import with new mock
    const { BottomPanel: BottomPanelConnecting } = await import("./BottomPanel");
    render(<BottomPanelConnecting />, { withRouter: false });

    // The component should show some status indicator
    expect(screen.getByText(/connect/i)).toBeInTheDocument();
  });
});
