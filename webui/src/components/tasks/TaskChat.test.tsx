import { describe, it, expect } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { render } from "@/test/utils";
import { MessageBubble } from "./MessageBubble";
import type { MessageWithParts } from "@/lib/api/types";

describe("MessageBubble", () => {
  it("renders user message correctly", () => {
    const message: MessageWithParts = {
      id: "msg_1",
      sessionId: "ses_1",
      role: "user",
      parentId: null,
      finishReason: null,
      cost: 0,
      tokensInput: 0,
      tokensOutput: 0,
      tokensReasoning: 0,
      errorType: null,
      errorMessage: null,
      createdAt: Date.now(),
      completedAt: Date.now(),
      parts: [
        {
          id: "part_1",
          messageId: "msg_1",
          sessionId: "ses_1",
          type: "text",
          content: { text: "Hello, this is a test message" },
          toolName: null,
          toolCallId: null,
          toolStatus: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
    };

    render(<MessageBubble message={message} projectId="prj_test" />, { withRouter: false });

    expect(screen.getByText("Hello, this is a test message")).toBeInTheDocument();
    expect(screen.getByTestId("user-message")).toBeInTheDocument();
  });

  it("renders assistant message correctly", () => {
    const message: MessageWithParts = {
      id: "msg_2",
      sessionId: "ses_1",
      role: "assistant",
      parentId: "msg_1",
      finishReason: "end_turn",
      cost: 0.001,
      tokensInput: 10,
      tokensOutput: 20,
      tokensReasoning: 0,
      errorType: null,
      errorMessage: null,
      createdAt: Date.now(),
      completedAt: Date.now(),
      parts: [
        {
          id: "part_2",
          messageId: "msg_2",
          sessionId: "ses_1",
          type: "text",
          content: { text: "Hello! How can I help you today?" },
          toolName: null,
          toolCallId: null,
          toolStatus: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
    };

    render(<MessageBubble message={message} projectId="prj_test" />, { withRouter: false });

    expect(screen.getByText("Hello! How can I help you today?")).toBeInTheDocument();
    expect(screen.getByTestId("assistant-message")).toBeInTheDocument();
  });

  it("shows streaming indicator for incomplete assistant message with no parts", () => {
    const message: MessageWithParts = {
      id: "msg_3",
      sessionId: "ses_1",
      role: "assistant",
      parentId: "msg_1",
      finishReason: null,
      cost: 0,
      tokensInput: 0,
      tokensOutput: 0,
      tokensReasoning: 0,
      errorType: null,
      errorMessage: null,
      createdAt: Date.now(),
      completedAt: null, // Not completed = streaming
      parts: [], // No parts yet
    };

    render(<MessageBubble message={message} projectId="prj_test" />, { withRouter: false });

    expect(screen.getByText("Thinking...")).toBeInTheDocument();
  });

  it("renders tool call part", async () => {
    const message: MessageWithParts = {
      id: "msg_4",
      sessionId: "ses_1",
      role: "assistant",
      parentId: "msg_1",
      finishReason: null,
      cost: 0,
      tokensInput: 0,
      tokensOutput: 0,
      tokensReasoning: 0,
      errorType: null,
      errorMessage: null,
      createdAt: Date.now(),
      completedAt: null,
      parts: [
        {
          id: "part_3",
          messageId: "msg_4",
          sessionId: "ses_1",
          type: "tool-call",
          content: { name: "read_file", args: { path: "/src/index.ts" } },
          toolName: "read_file",
          toolCallId: "tc_1",
          toolStatus: "running",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
    };

    render(<MessageBubble message={message} projectId="prj_test" />);

    await waitFor(() => {
      expect(screen.getByText("read_file")).toBeInTheDocument();
    });
    expect(screen.getByText("running")).toBeInTheDocument();
  });

  it("renders error message", () => {
    const message: MessageWithParts = {
      id: "msg_5",
      sessionId: "ses_1",
      role: "assistant",
      parentId: "msg_1",
      finishReason: "error",
      cost: 0,
      tokensInput: 0,
      tokensOutput: 0,
      tokensReasoning: 0,
      errorType: "rate_limit",
      errorMessage: "Too many requests. Please try again later.",
      createdAt: Date.now(),
      completedAt: Date.now(),
      parts: [],
    };

    render(<MessageBubble message={message} projectId="prj_test" />, { withRouter: false });

    expect(screen.getByText("rate_limit")).toBeInTheDocument();
    expect(screen.getByText("Too many requests. Please try again later.")).toBeInTheDocument();
  });
});
