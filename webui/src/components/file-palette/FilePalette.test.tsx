import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@/test/utils";
import { FilePalette } from "./FilePalette";
import { useFilePalette } from "@/contexts/file-palette";
import { useUI } from "@/contexts/ui";

// Mock the router
vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual("@tanstack/react-router");
  return {
    ...actual,
    useLocation: () => ({ pathname: "/" }),
    useNavigate: () => vi.fn(),
  };
});

// Mock the file tree API
vi.mock("@/lib/api/queries", async () => {
  const actual = await vi.importActual("@/lib/api/queries");
  return {
    ...actual,
    useFileTree: vi.fn(() => ({
      data: ["src/index.ts", "src/utils/helper.ts", "package.json", "README.md"],
      isLoading: false,
      error: null,
    })),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});

// Test component that can control the file palette
function FilePaletteTest() {
  const { open, isOpen } = useFilePalette();
  const { setSelectedProject } = useUI();

  return (
    <div>
      <button
        onClick={() => {
          setSelectedProject("prj_test");
          open();
        }}
        data-testid="open-palette"
      >
        Open Palette
      </button>
      <div data-testid="palette-state">{isOpen ? "open" : "closed"}</div>
      <FilePalette />
    </div>
  );
}

// Use withRouter: false for these tests since we don't need routing
const renderOptions = { withRouter: false };

describe("FilePalette", () => {
  it("does not render when no project is selected", async () => {
    render(<FilePalette />, renderOptions);

    // FilePalette should return null when no project is selected
    expect(screen.queryByPlaceholderText("Go to file...")).not.toBeInTheDocument();
  });

  it("opens when triggered and project is selected", async () => {
    render(<FilePaletteTest />, renderOptions);

    // Initially closed
    expect(screen.getByTestId("palette-state")).toHaveTextContent("closed");

    // Open palette
    fireEvent.click(screen.getByTestId("open-palette"));

    await waitFor(() => {
      expect(screen.getByTestId("palette-state")).toHaveTextContent("open");
    });
  });

  it("shows file list when opened", async () => {
    render(<FilePaletteTest />, renderOptions);

    fireEvent.click(screen.getByTestId("open-palette"));

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Go to file...")).toBeInTheDocument();
    });

    // Should show files from the mocked data
    await waitFor(() => {
      expect(screen.getByText("index.ts")).toBeInTheDocument();
      expect(screen.getByText("helper.ts")).toBeInTheDocument();
      expect(screen.getByText("package.json")).toBeInTheDocument();
    });
  });

  it("filters files based on search query", async () => {
    render(<FilePaletteTest />, renderOptions);

    fireEvent.click(screen.getByTestId("open-palette"));

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Go to file...")).toBeInTheDocument();
    });

    // Type a search query
    const input = screen.getByPlaceholderText("Go to file...");
    fireEvent.change(input, { target: { value: "index" } });

    await waitFor(() => {
      expect(screen.getByText("index.ts")).toBeInTheDocument();
      // Other files should not match
      expect(screen.queryByText("package.json")).not.toBeInTheDocument();
    });
  });

  it("shows no results message when no files match", async () => {
    render(<FilePaletteTest />, renderOptions);

    fireEvent.click(screen.getByTestId("open-palette"));

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Go to file...")).toBeInTheDocument();
    });

    // Type a query that won't match anything
    const input = screen.getByPlaceholderText("Go to file...");
    fireEvent.change(input, { target: { value: "zzzznonexistent" } });

    await waitFor(() => {
      expect(screen.getByText(/No files matching/)).toBeInTheDocument();
    });
  });

  it("navigates with keyboard", async () => {
    render(<FilePaletteTest />, renderOptions);

    fireEvent.click(screen.getByTestId("open-palette"));

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Go to file...")).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText("Go to file...");

    // Press ArrowDown to select second item
    fireEvent.keyDown(input, { key: "ArrowDown" });

    // The second item should now be selected (visual indication via class)
    await waitFor(() => {
      const secondItem = screen.getByText("helper.ts").closest("button");
      expect(secondItem).toHaveClass("bg-accent-primary/10");
    });
  });

  it("closes on Escape key", async () => {
    render(<FilePaletteTest />, renderOptions);

    fireEvent.click(screen.getByTestId("open-palette"));

    await waitFor(() => {
      expect(screen.getByTestId("palette-state")).toHaveTextContent("open");
    });

    // Press Escape
    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => {
      expect(screen.getByTestId("palette-state")).toHaveTextContent("closed");
    });
  });
});
