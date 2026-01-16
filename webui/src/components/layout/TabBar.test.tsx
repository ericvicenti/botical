import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, waitFor } from "@/test/utils";
import { TabBar } from "./TabBar";
import { useTabs } from "@/contexts/tabs";

// Test component that opens tabs
function TabBarWithTabs() {
  const { openTab, tabs } = useTabs();

  return (
    <div>
      <button
        onClick={() =>
          openTab({ type: "project", projectId: "prj_test", projectName: "Test Project" })
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
  it("shows empty state when no tabs", async () => {
    render(<TabBar />);

    await waitFor(() => {
      expect(screen.getByText("No open tabs")).toBeInTheDocument();
    });
  });

  it("displays opened tabs with project name", async () => {
    render(<TabBarWithTabs />);

    await waitFor(() => {
      expect(screen.getByTestId("open-project-tab")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("open-project-tab"));

    await waitFor(() => {
      expect(screen.getByText("Test Project")).toBeInTheDocument();
    });
  });

  it("opens multiple tabs", async () => {
    render(<TabBarWithTabs />);

    await waitFor(() => {
      expect(screen.getByTestId("open-project-tab")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("open-project-tab"));
    fireEvent.click(screen.getByTestId("open-file-tab"));

    await waitFor(() => {
      expect(screen.getByText("Test Project")).toBeInTheDocument();
      expect(screen.getByText("index.ts")).toBeInTheDocument();
      expect(screen.getByTestId("tab-count")).toHaveTextContent("2");
    });
  });

  it("does not duplicate tabs with same ID", async () => {
    render(<TabBarWithTabs />);

    await waitFor(() => {
      expect(screen.getByTestId("open-project-tab")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("open-project-tab"));
    fireEvent.click(screen.getByTestId("open-project-tab"));

    await waitFor(() => {
      expect(screen.getByTestId("tab-count")).toHaveTextContent("1");
    });
  });

  it("closes tabs when close button is clicked", async () => {
    render(<TabBarWithTabs />);

    await waitFor(() => {
      expect(screen.getByTestId("open-project-tab")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("open-project-tab"));

    await waitFor(() => {
      expect(screen.getByTestId("tab-count")).toHaveTextContent("1");
    });

    // Find and click close button (the X icon button)
    const tabElement = screen.getByText("Test Project").closest("div");
    const closeButton = tabElement?.querySelector("button");
    if (closeButton) {
      fireEvent.click(closeButton);
    }

    await waitFor(() => {
      expect(screen.getByTestId("tab-count")).toHaveTextContent("0");
      expect(screen.getByText("No open tabs")).toBeInTheDocument();
    });
  });

  it("switches active tab when clicked", async () => {
    render(<TabBarWithTabs />);

    await waitFor(() => {
      expect(screen.getByTestId("open-project-tab")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("open-project-tab"));
    fireEvent.click(screen.getByTestId("open-file-tab"));

    await waitFor(() => {
      // File tab should be active (last opened)
      const fileTab = screen.getByText("index.ts").closest("div");
      expect(fileTab).toHaveClass("bg-bg-primary");
    });

    // Click project tab
    fireEvent.click(screen.getByText("Test Project"));

    await waitFor(() => {
      // Project tab should now be active
      const projectTab = screen.getByText("Test Project").closest("div");
      expect(projectTab).toHaveClass("bg-bg-primary");
    });
  });
});
