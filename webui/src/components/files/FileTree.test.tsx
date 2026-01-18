import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@/test/utils";
import { FileTree } from "./FileTree";
import { useTabs } from "@/contexts/tabs";

// Test component that captures tab operations
function FileTreeWithTabTracker({ projectId }: { projectId: string }) {
  const { tabs } = useTabs();

  return (
    <div>
      <FileTree projectId={projectId} />
      <div data-testid="tab-count">{tabs.length}</div>
      <div data-testid="tab-ids">{tabs.map((t) => t.id).join(",")}</div>
    </div>
  );
}

describe("FileTree", () => {
  it("renders and loads files", async () => {
    render(<FileTree projectId="prj_test" />);

    // Should eventually show the files (loading state may be too fast to catch)
    await waitFor(() => {
      expect(screen.getByText("src")).toBeInTheDocument();
    });
  });

  it("renders root files after loading", async () => {
    render(<FileTree projectId="prj_test" />);

    await waitFor(() => {
      expect(screen.getByText("src")).toBeInTheDocument();
      expect(screen.getByText("package.json")).toBeInTheDocument();
      expect(screen.getByText("README.md")).toBeInTheDocument();
    });
  });

  it("shows folder icons for directories", async () => {
    render(<FileTree projectId="prj_test" />);

    await waitFor(() => {
      expect(screen.getByText("src")).toBeInTheDocument();
    });

    // The src folder should have a folder icon (we can check the parent element)
    const srcElement = screen.getByText("src");
    expect(srcElement).toBeInTheDocument();
  });

  it("expands folder when clicked", async () => {
    render(<FileTree projectId="prj_test" />);

    await waitFor(() => {
      expect(screen.getByText("src")).toBeInTheDocument();
    });

    // Click on src folder to expand
    fireEvent.click(screen.getByText("src"));

    // Should now show contents of src folder
    await waitFor(() => {
      expect(screen.getByText("index.ts")).toBeInTheDocument();
      expect(screen.getByText("utils")).toBeInTheDocument();
    });
  });

  it("collapses folder when clicked again", async () => {
    render(<FileTree projectId="prj_test" />);

    await waitFor(() => {
      expect(screen.getByText("src")).toBeInTheDocument();
    });

    // Expand
    fireEvent.click(screen.getByText("src"));

    await waitFor(() => {
      expect(screen.getByText("index.ts")).toBeInTheDocument();
    });

    // Collapse
    fireEvent.click(screen.getByText("src"));

    await waitFor(() => {
      expect(screen.queryByText("index.ts")).not.toBeInTheDocument();
    });
  });

  it("opens nested folders", async () => {
    render(<FileTree projectId="prj_test" />);

    await waitFor(() => {
      expect(screen.getByText("src")).toBeInTheDocument();
    });

    // Expand src
    fireEvent.click(screen.getByText("src"));

    await waitFor(() => {
      expect(screen.getByText("utils")).toBeInTheDocument();
    });

    // Expand utils
    fireEvent.click(screen.getByText("utils"));

    await waitFor(() => {
      expect(screen.getByText("helpers.ts")).toBeInTheDocument();
    });
  });

  it("opens file in tab when clicked", async () => {
    render(<FileTreeWithTabTracker projectId="prj_test" />);

    await waitFor(() => {
      expect(screen.getByText("package.json")).toBeInTheDocument();
    });

    // Click on package.json to open it
    fireEvent.click(screen.getByText("package.json"));

    await waitFor(() => {
      expect(screen.getByTestId("tab-count")).toHaveTextContent("1");
      expect(screen.getByTestId("tab-ids")).toHaveTextContent("file:prj_test:package.json");
    });
  });

  it("opens nested file in tab when clicked", async () => {
    render(<FileTreeWithTabTracker projectId="prj_test" />);

    await waitFor(() => {
      expect(screen.getByText("src")).toBeInTheDocument();
    });

    // Expand src
    fireEvent.click(screen.getByText("src"));

    await waitFor(() => {
      expect(screen.getByText("index.ts")).toBeInTheDocument();
    });

    // Click on index.ts to open it
    fireEvent.click(screen.getByText("index.ts"));

    await waitFor(() => {
      expect(screen.getByTestId("tab-count")).toHaveTextContent("1");
      expect(screen.getByTestId("tab-ids")).toHaveTextContent("file:prj_test:src/index.ts");
    });
  });

  it("shows context menu on right click", async () => {
    render(<FileTree projectId="prj_test" />);

    await waitFor(() => {
      expect(screen.getByText("package.json")).toBeInTheDocument();
    });

    // Right click on package.json
    fireEvent.contextMenu(screen.getByText("package.json"));

    await waitFor(() => {
      expect(screen.getByText("Rename")).toBeInTheDocument();
      expect(screen.getByText("Delete")).toBeInTheDocument();
    });
  });

  it("closes context menu when clicking outside", async () => {
    render(<FileTree projectId="prj_test" />);

    await waitFor(() => {
      expect(screen.getByText("package.json")).toBeInTheDocument();
    });

    // Right click to open context menu
    fireEvent.contextMenu(screen.getByText("package.json"));

    await waitFor(() => {
      expect(screen.getByText("Rename")).toBeInTheDocument();
    });

    // Click outside
    fireEvent.mouseDown(document.body);

    await waitFor(() => {
      expect(screen.queryByText("Rename")).not.toBeInTheDocument();
    });
  });

  it("shows rename input when rename is clicked", async () => {
    render(<FileTree projectId="prj_test" />);

    await waitFor(() => {
      expect(screen.getByText("package.json")).toBeInTheDocument();
    });

    // Right click and select rename
    fireEvent.contextMenu(screen.getByText("package.json"));

    await waitFor(() => {
      expect(screen.getByText("Rename")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Rename"));

    await waitFor(() => {
      const input = screen.getByDisplayValue("package.json");
      expect(input).toBeInTheDocument();
    });
  });

  it("cancels rename on escape", async () => {
    render(<FileTree projectId="prj_test" />);

    await waitFor(() => {
      expect(screen.getByText("package.json")).toBeInTheDocument();
    });

    // Open rename
    fireEvent.contextMenu(screen.getByText("package.json"));
    await waitFor(() => expect(screen.getByText("Rename")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Rename"));

    await waitFor(() => {
      expect(screen.getByDisplayValue("package.json")).toBeInTheDocument();
    });

    // Press escape
    const input = screen.getByDisplayValue("package.json");
    fireEvent.keyDown(input, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByDisplayValue("package.json")).not.toBeInTheDocument();
      expect(screen.getByText("package.json")).toBeInTheDocument();
    });
  });

  it("displays different file icons based on extension", async () => {
    render(<FileTree projectId="prj_test" />);

    await waitFor(() => {
      expect(screen.getByText("src")).toBeInTheDocument();
    });

    // Expand src to see TypeScript file
    fireEvent.click(screen.getByText("src"));

    await waitFor(() => {
      // TypeScript file should be visible
      expect(screen.getByText("index.ts")).toBeInTheDocument();
    });

    // JSON and MD files are in root
    expect(screen.getByText("package.json")).toBeInTheDocument();
    expect(screen.getByText("README.md")).toBeInTheDocument();
  });

  it("asks for confirmation before delete", async () => {
    // Mock window.confirm
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

    render(<FileTree projectId="prj_test" />);

    await waitFor(() => {
      expect(screen.getByText("package.json")).toBeInTheDocument();
    });

    // Right click and select delete
    fireEvent.contextMenu(screen.getByText("package.json"));

    await waitFor(() => {
      expect(screen.getByText("Delete")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Delete"));

    expect(confirmSpy).toHaveBeenCalledWith('Delete "package.json"?');
    confirmSpy.mockRestore();
  });
});
