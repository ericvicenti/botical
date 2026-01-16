import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@/test/utils";
import { TabBar } from "./TabBar";
import { useTabs } from "@/contexts/tabs";

// Test component that opens tabs
function TabBarWithTabs() {
  const { openTab, tabs } = useTabs();

  return (
    <div>
      <button
        onClick={() =>
          openTab({ type: "project", projectId: "prj_test" })
        }
        data-testid="open-project-tab"
      >
        Open Project Tab
      </button>
      <button
        onClick={() =>
          openTab({ type: "file", projectId: "prj_test", path: "/src/index.ts" })
        }
        data-testid="open-file-tab"
      >
        Open File Tab
      </button>
      <TabBar />
      <div data-testid="tab-count">{tabs.length}</div>
    </div>
  );
}

describe("TabBar", () => {
  it("shows empty state when no tabs", () => {
    render(<TabBar />, { withRouter: false });

    expect(screen.getByText("No open tabs")).toBeInTheDocument();
  });

  it("displays opened tabs", () => {
    render(<TabBarWithTabs />, { withRouter: false });

    fireEvent.click(screen.getByTestId("open-project-tab"));

    expect(screen.getByText("Project")).toBeInTheDocument();
  });

  it("opens multiple tabs", () => {
    render(<TabBarWithTabs />, { withRouter: false });

    fireEvent.click(screen.getByTestId("open-project-tab"));
    fireEvent.click(screen.getByTestId("open-file-tab"));

    expect(screen.getByText("Project")).toBeInTheDocument();
    expect(screen.getByText("index.ts")).toBeInTheDocument();
    expect(screen.getByTestId("tab-count")).toHaveTextContent("2");
  });

  it("does not duplicate tabs with same ID", () => {
    render(<TabBarWithTabs />, { withRouter: false });

    fireEvent.click(screen.getByTestId("open-project-tab"));
    fireEvent.click(screen.getByTestId("open-project-tab"));

    expect(screen.getByTestId("tab-count")).toHaveTextContent("1");
  });

  it("closes tabs when close button is clicked", () => {
    render(<TabBarWithTabs />, { withRouter: false });

    fireEvent.click(screen.getByTestId("open-project-tab"));
    expect(screen.getByTestId("tab-count")).toHaveTextContent("1");

    // Find and click close button (the X icon button)
    const tabElement = screen.getByText("Project").closest("div");
    const closeButton = tabElement?.querySelector("button");
    if (closeButton) {
      fireEvent.click(closeButton);
    }

    expect(screen.getByTestId("tab-count")).toHaveTextContent("0");
    expect(screen.getByText("No open tabs")).toBeInTheDocument();
  });

  it("switches active tab when clicked", () => {
    render(<TabBarWithTabs />, { withRouter: false });

    fireEvent.click(screen.getByTestId("open-project-tab"));
    fireEvent.click(screen.getByTestId("open-file-tab"));

    // File tab should be active (last opened)
    const fileTab = screen.getByText("index.ts").closest("div");
    expect(fileTab).toHaveClass("bg-bg-primary");

    // Click project tab
    fireEvent.click(screen.getByText("Project"));

    // Project tab should now be active
    const projectTab = screen.getByText("Project").closest("div");
    expect(projectTab).toHaveClass("bg-bg-primary");
  });
});
