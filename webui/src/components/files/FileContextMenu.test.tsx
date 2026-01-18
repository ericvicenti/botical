import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@/test/utils";
import { FileContextMenu, CreateInput, type ContextMenuTarget } from "./FileContextMenu";
import { server } from "@/test/setup";

/**
 * Tests for FileContextMenu component
 *
 * The FileContextMenu provides right-click context menu functionality for:
 * - Empty areas (showing New File / New Folder)
 * - Folders (showing New File / New Folder / Rename / Delete)
 * - Files (showing Rename / Delete)
 */
describe("FileContextMenu", () => {
  const mockOnClose = vi.fn();
  const mockOnStartRename = vi.fn();
  const mockOnStartCreate = vi.fn();
  const defaultPosition = { x: 100, y: 100 };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Empty area context menu", () => {
    const emptyTarget: ContextMenuTarget = { type: "empty", parentPath: "" };

    it("shows New File and New Folder options", () => {
      render(
        <FileContextMenu
          projectId="prj_test"
          position={defaultPosition}
          target={emptyTarget}
          onClose={mockOnClose}
          onStartCreate={mockOnStartCreate}
        />,
        { withRouter: false }
      );

      expect(screen.getByText("New File")).toBeInTheDocument();
      expect(screen.getByText("New Folder")).toBeInTheDocument();
    });

    it("does not show Rename or Delete options", () => {
      render(
        <FileContextMenu
          projectId="prj_test"
          position={defaultPosition}
          target={emptyTarget}
          onClose={mockOnClose}
          onStartCreate={mockOnStartCreate}
        />,
        { withRouter: false }
      );

      expect(screen.queryByText("Rename")).not.toBeInTheDocument();
      expect(screen.queryByText("Delete")).not.toBeInTheDocument();
    });

    it("calls onStartCreate with 'file' when New File is clicked", () => {
      render(
        <FileContextMenu
          projectId="prj_test"
          position={defaultPosition}
          target={emptyTarget}
          onClose={mockOnClose}
          onStartCreate={mockOnStartCreate}
        />,
        { withRouter: false }
      );

      fireEvent.click(screen.getByText("New File"));

      expect(mockOnStartCreate).toHaveBeenCalledWith("file", "");
      expect(mockOnClose).toHaveBeenCalled();
    });

    it("calls onStartCreate with 'folder' when New Folder is clicked", () => {
      render(
        <FileContextMenu
          projectId="prj_test"
          position={defaultPosition}
          target={emptyTarget}
          onClose={mockOnClose}
          onStartCreate={mockOnStartCreate}
        />,
        { withRouter: false }
      );

      fireEvent.click(screen.getByText("New Folder"));

      expect(mockOnStartCreate).toHaveBeenCalledWith("folder", "");
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  describe("Folder context menu", () => {
    const folderTarget: ContextMenuTarget = {
      type: "folder",
      path: "src",
      name: "src",
    };

    it("shows all options: New File, New Folder, Rename, Delete", () => {
      render(
        <FileContextMenu
          projectId="prj_test"
          position={defaultPosition}
          target={folderTarget}
          onClose={mockOnClose}
          onStartRename={mockOnStartRename}
          onStartCreate={mockOnStartCreate}
        />,
        { withRouter: false }
      );

      expect(screen.getByText("New File")).toBeInTheDocument();
      expect(screen.getByText("New Folder")).toBeInTheDocument();
      expect(screen.getByText("Rename")).toBeInTheDocument();
      expect(screen.getByText("Delete")).toBeInTheDocument();
    });

    it("calls onStartCreate with folder path when New File is clicked", () => {
      render(
        <FileContextMenu
          projectId="prj_test"
          position={defaultPosition}
          target={folderTarget}
          onClose={mockOnClose}
          onStartCreate={mockOnStartCreate}
        />,
        { withRouter: false }
      );

      fireEvent.click(screen.getByText("New File"));

      expect(mockOnStartCreate).toHaveBeenCalledWith("file", "src");
      expect(mockOnClose).toHaveBeenCalled();
    });

    it("calls onStartRename when Rename is clicked", () => {
      render(
        <FileContextMenu
          projectId="prj_test"
          position={defaultPosition}
          target={folderTarget}
          onClose={mockOnClose}
          onStartRename={mockOnStartRename}
          onStartCreate={mockOnStartCreate}
        />,
        { withRouter: false }
      );

      fireEvent.click(screen.getByText("Rename"));

      expect(mockOnStartRename).toHaveBeenCalled();
      expect(mockOnClose).toHaveBeenCalled();
    });

    it("shows confirmation dialog when Delete is clicked", () => {
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

      render(
        <FileContextMenu
          projectId="prj_test"
          position={defaultPosition}
          target={folderTarget}
          onClose={mockOnClose}
          onStartRename={mockOnStartRename}
          onStartCreate={mockOnStartCreate}
        />,
        { withRouter: false }
      );

      fireEvent.click(screen.getByText("Delete"));

      expect(confirmSpy).toHaveBeenCalledWith('Delete "src"?');
      confirmSpy.mockRestore();
    });
  });

  describe("File context menu", () => {
    const fileTarget: ContextMenuTarget = {
      type: "file",
      path: "package.json",
      name: "package.json",
    };

    it("shows only Rename and Delete options", () => {
      render(
        <FileContextMenu
          projectId="prj_test"
          position={defaultPosition}
          target={fileTarget}
          onClose={mockOnClose}
          onStartRename={mockOnStartRename}
          onStartCreate={mockOnStartCreate}
        />,
        { withRouter: false }
      );

      expect(screen.queryByText("New File")).not.toBeInTheDocument();
      expect(screen.queryByText("New Folder")).not.toBeInTheDocument();
      expect(screen.getByText("Rename")).toBeInTheDocument();
      expect(screen.getByText("Delete")).toBeInTheDocument();
    });
  });

  describe("Click outside behavior", () => {
    it("closes menu when clicking outside", async () => {
      render(
        <div>
          <div data-testid="outside">Outside</div>
          <FileContextMenu
            projectId="prj_test"
            position={defaultPosition}
            target={{ type: "empty", parentPath: "" }}
            onClose={mockOnClose}
            onStartCreate={mockOnStartCreate}
          />
        </div>,
        { withRouter: false }
      );

      // Click outside the menu
      fireEvent.mouseDown(screen.getByTestId("outside"));

      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  describe("Positioning", () => {
    it("positions menu at the specified coordinates", () => {
      const { container } = render(
        <FileContextMenu
          projectId="prj_test"
          position={{ x: 200, y: 150 }}
          target={{ type: "empty", parentPath: "" }}
          onClose={mockOnClose}
          onStartCreate={mockOnStartCreate}
        />,
        { withRouter: false }
      );

      const menu = container.querySelector(".fixed");
      expect(menu).toHaveStyle({ left: "200px", top: "150px" });
    });
  });
});

/**
 * Tests for CreateInput component
 *
 * CreateInput provides inline file/folder creation functionality with:
 * - Auto-focus on mount
 * - Enter to submit
 * - Escape to cancel
 * - Blur to submit
 *
 * Note: CreateInput requires QueryClientProvider as it uses useCreateFile mutation.
 * The render function from test/utils provides this automatically.
 */
describe("CreateInput", () => {
  const mockOnComplete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    server.resetHandlers();
  });

  describe("File creation", () => {
    it("renders with file placeholder", () => {
      render(
        <CreateInput
          type="file"
          parentPath=""
          projectId="prj_test"
          onComplete={mockOnComplete}
        />,
        { withRouter: false }
      );

      expect(screen.getByPlaceholderText("filename.ts")).toBeInTheDocument();
    });

    it("auto-focuses input on mount", () => {
      render(
        <CreateInput
          type="file"
          parentPath=""
          projectId="prj_test"
          onComplete={mockOnComplete}
        />,
        { withRouter: false }
      );

      expect(screen.getByPlaceholderText("filename.ts")).toHaveFocus();
    });

    it("creates file on Enter with valid name", async () => {
      render(
        <CreateInput
          type="file"
          parentPath=""
          projectId="prj_test"
          onComplete={mockOnComplete}
        />,
        { withRouter: false }
      );

      const input = screen.getByPlaceholderText("filename.ts");
      fireEvent.change(input, { target: { value: "newfile.ts" } });
      fireEvent.keyDown(input, { key: "Enter" });

      await waitFor(() => {
        expect(mockOnComplete).toHaveBeenCalled();
      });
    });

    it("accepts input and calls onComplete when name is provided", async () => {
      render(
        <CreateInput
          type="file"
          parentPath="src/components"
          projectId="prj_test"
          onComplete={mockOnComplete}
        />,
        { withRouter: false }
      );

      const input = screen.getByPlaceholderText("filename.ts");
      fireEvent.change(input, { target: { value: "Button.tsx" } });
      expect(input).toHaveValue("Button.tsx");

      fireEvent.keyDown(input, { key: "Enter" });

      // Wait for the mutation to complete (or cancel)
      await waitFor(() => {
        expect(mockOnComplete).toHaveBeenCalled();
      });
    });

    it("cancels on Escape", () => {
      render(
        <CreateInput
          type="file"
          parentPath=""
          projectId="prj_test"
          onComplete={mockOnComplete}
        />,
        { withRouter: false }
      );

      const input = screen.getByPlaceholderText("filename.ts");
      fireEvent.keyDown(input, { key: "Escape" });

      expect(mockOnComplete).toHaveBeenCalled();
    });

    it("cancels when empty name is submitted", () => {
      render(
        <CreateInput
          type="file"
          parentPath=""
          projectId="prj_test"
          onComplete={mockOnComplete}
        />,
        { withRouter: false }
      );

      const input = screen.getByPlaceholderText("filename.ts");
      fireEvent.keyDown(input, { key: "Enter" });

      expect(mockOnComplete).toHaveBeenCalled();
    });
  });

  describe("Folder creation", () => {
    it("renders with folder placeholder", () => {
      render(
        <CreateInput
          type="folder"
          parentPath=""
          projectId="prj_test"
          onComplete={mockOnComplete}
        />,
        { withRouter: false }
      );

      expect(screen.getByPlaceholderText("folder-name")).toBeInTheDocument();
    });

    it("accepts folder name and calls onComplete", async () => {
      render(
        <CreateInput
          type="folder"
          parentPath=""
          projectId="prj_test"
          onComplete={mockOnComplete}
        />,
        { withRouter: false }
      );

      const input = screen.getByPlaceholderText("folder-name");
      fireEvent.change(input, { target: { value: "newfolder" } });
      expect(input).toHaveValue("newfolder");

      fireEvent.keyDown(input, { key: "Enter" });

      // Wait for the mutation to complete (or cancel)
      await waitFor(() => {
        expect(mockOnComplete).toHaveBeenCalled();
      });
    });
  });

  describe("Indentation", () => {
    it("applies correct indentation based on depth", () => {
      render(
        <CreateInput
          type="file"
          parentPath="src"
          projectId="prj_test"
          onComplete={mockOnComplete}
          depth={2}
        />,
        { withRouter: false }
      );

      // depth * 12 + 8 = 2 * 12 + 8 = 32px
      // Find the container div with the flex class
      const input = screen.getByPlaceholderText("filename.ts");
      const inputRow = input.closest(".flex");
      expect(inputRow).toHaveStyle({ paddingLeft: "32px" });
    });
  });
});
