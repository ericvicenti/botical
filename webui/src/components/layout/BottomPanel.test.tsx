import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@/test/utils";
import { BottomPanel } from "./BottomPanel";

describe("BottomPanel", () => {
  it("renders in minimized state by default", () => {
    render(<BottomPanel />, { withRouter: false });

    // Should show the tab labels in minimized bar
    expect(screen.getByText("Output")).toBeInTheDocument();
    expect(screen.getByText("Problems")).toBeInTheDocument();
    expect(screen.getByText("Services")).toBeInTheDocument();
  });

  it("expands when a tab is clicked in minimized state", () => {
    render(<BottomPanel />, { withRouter: false });

    // Click Output tab
    fireEvent.click(screen.getByText("Output"));

    // Should now show the expanded content
    expect(screen.getByText("Output will appear here...")).toBeInTheDocument();
  });

  it("switches tabs when clicked in expanded state", () => {
    render(<BottomPanel />, { withRouter: false });

    // First expand by clicking a tab
    fireEvent.click(screen.getByText("Output"));
    expect(screen.getByText("Output will appear here...")).toBeInTheDocument();

    // Switch to Problems tab
    fireEvent.click(screen.getByText("Problems"));
    expect(screen.getByText("No problems detected")).toBeInTheDocument();

    // Switch to Services tab
    fireEvent.click(screen.getByText("Services"));
    expect(screen.getByText("No services running")).toBeInTheDocument();
  });

  it("collapses when chevron down is clicked", () => {
    render(<BottomPanel />, { withRouter: false });

    // Expand first
    fireEvent.click(screen.getByText("Output"));
    expect(screen.getByText("Output will appear here...")).toBeInTheDocument();

    // Find and click the collapse button (ChevronDown)
    const collapseButton = screen.getByRole("button", { name: "" });
    // The collapse button is in the header, find by SVG
    const buttons = screen.getAllByRole("button");
    const chevronButton = buttons.find((btn) =>
      btn.querySelector("svg.lucide-chevron-down")
    );

    if (chevronButton) {
      fireEvent.click(chevronButton);
    }

    // After collapse, should not see the content
    expect(
      screen.queryByText("Output will appear here...")
    ).not.toBeInTheDocument();
  });

  it("expands when chevron up is clicked in minimized state", () => {
    render(<BottomPanel />, { withRouter: false });

    // Find the expand button (ChevronUp in minimized state)
    const buttons = screen.getAllByRole("button");
    const expandButton = buttons.find((btn) =>
      btn.querySelector("svg.lucide-chevron-up")
    );

    if (expandButton) {
      fireEvent.click(expandButton);
    }

    // Should now be expanded
    expect(screen.getByText("Output will appear here...")).toBeInTheDocument();
  });
});
