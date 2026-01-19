import { useEffect, useRef, useState, useCallback } from "react";
import { EditorState, type Extension } from "@codemirror/state";
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { syntaxHighlighting, HighlightStyle } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { oneDark } from "@codemirror/theme-one-dark";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { useFileContent, useSaveFile, useProject } from "@/lib/api/queries";
import { useTabs } from "@/contexts/tabs";
import { useUI } from "@/contexts/ui";
import { useNavigate } from "@tanstack/react-router";
import { cn } from "@/lib/utils/cn";

// Light theme for CodeMirror
const lightTheme = EditorView.theme(
  {
    "&": {
      backgroundColor: "#eff1f5",
      color: "#4c4f69",
    },
    ".cm-content": {
      caretColor: "#4c4f69",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "#4c4f69",
    },
    "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
      {
        backgroundColor: "#ccd0da",
      },
    ".cm-panels": {
      backgroundColor: "#e6e9ef",
      color: "#4c4f69",
    },
    ".cm-panels.cm-panels-top": {
      borderBottom: "1px solid #ccd0da",
    },
    ".cm-panels.cm-panels-bottom": {
      borderTop: "1px solid #ccd0da",
    },
    ".cm-searchMatch": {
      backgroundColor: "#df8e1d40",
      outline: "1px solid #df8e1d80",
    },
    ".cm-searchMatch.cm-searchMatch-selected": {
      backgroundColor: "#40a02b40",
    },
    ".cm-activeLine": {
      backgroundColor: "#e6e9ef80",
    },
    ".cm-selectionMatch": {
      backgroundColor: "#ccd0da",
    },
    "&.cm-focused .cm-matchingBracket, &.cm-focused .cm-nonmatchingBracket": {
      backgroundColor: "#ccd0da",
    },
    ".cm-gutters": {
      backgroundColor: "#e6e9ef",
      color: "#8c8fa1",
      border: "none",
      borderRight: "1px solid #ccd0da",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "#ccd0da80",
    },
    ".cm-foldPlaceholder": {
      backgroundColor: "transparent",
      border: "none",
      color: "#8c8fa1",
    },
    ".cm-tooltip": {
      border: "1px solid #ccd0da",
      backgroundColor: "#e6e9ef",
    },
    ".cm-tooltip .cm-tooltip-arrow:before": {
      borderTopColor: "transparent",
      borderBottomColor: "transparent",
    },
    ".cm-tooltip .cm-tooltip-arrow:after": {
      borderTopColor: "#e6e9ef",
      borderBottomColor: "#e6e9ef",
    },
    ".cm-tooltip-autocomplete": {
      "& > ul > li[aria-selected]": {
        backgroundColor: "#ccd0da",
        color: "#4c4f69",
      },
    },
  },
  { dark: false }
);

// Light syntax highlighting (Catppuccin Latte)
const lightHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: "#8839ef" },
  { tag: tags.controlKeyword, color: "#8839ef" },
  { tag: tags.operatorKeyword, color: "#8839ef" },
  { tag: tags.definitionKeyword, color: "#8839ef" },
  { tag: tags.moduleKeyword, color: "#8839ef" },
  { tag: tags.comment, color: "#9ca0b0", fontStyle: "italic" },
  { tag: tags.lineComment, color: "#9ca0b0", fontStyle: "italic" },
  { tag: tags.blockComment, color: "#9ca0b0", fontStyle: "italic" },
  { tag: tags.docComment, color: "#9ca0b0", fontStyle: "italic" },
  { tag: tags.string, color: "#40a02b" },
  { tag: tags.special(tags.string), color: "#40a02b" },
  { tag: tags.number, color: "#fe640b" },
  { tag: tags.integer, color: "#fe640b" },
  { tag: tags.float, color: "#fe640b" },
  { tag: tags.bool, color: "#fe640b" },
  { tag: tags.null, color: "#fe640b" },
  { tag: tags.variableName, color: "#4c4f69" },
  { tag: tags.definition(tags.variableName), color: "#1e66f5" },
  { tag: tags.function(tags.variableName), color: "#1e66f5" },
  { tag: tags.typeName, color: "#df8e1d" },
  { tag: tags.className, color: "#df8e1d" },
  { tag: tags.namespace, color: "#df8e1d" },
  { tag: tags.tagName, color: "#8839ef" },
  { tag: tags.attributeName, color: "#179299" },
  { tag: tags.attributeValue, color: "#40a02b" },
  { tag: tags.propertyName, color: "#1e66f5" },
  { tag: tags.definition(tags.propertyName), color: "#1e66f5" },
  { tag: tags.operator, color: "#179299" },
  { tag: tags.punctuation, color: "#5c5f77" },
  { tag: tags.bracket, color: "#5c5f77" },
  { tag: tags.angleBracket, color: "#5c5f77" },
  { tag: tags.squareBracket, color: "#5c5f77" },
  { tag: tags.paren, color: "#5c5f77" },
  { tag: tags.brace, color: "#5c5f77" },
  { tag: tags.separator, color: "#5c5f77" },
  { tag: tags.regexp, color: "#d20f39" },
  { tag: tags.escape, color: "#ea76cb" },
  { tag: tags.self, color: "#d20f39" },
  { tag: tags.atom, color: "#179299" },
  { tag: tags.meta, color: "#e64553" },
  { tag: tags.processingInstruction, color: "#8839ef" },
]);

interface CodeEditorProps {
  projectId: string;
  path: string;
  commit?: string;
}

function getLanguageExtension(filename: string): Extension {
  const ext = filename.split(".").pop()?.toLowerCase();

  switch (ext) {
    case "ts":
    case "tsx":
      return javascript({ typescript: true, jsx: true });
    case "js":
    case "jsx":
      return javascript({ jsx: true });
    case "json":
      return json();
    case "md":
    case "mdx":
      return markdown();
    case "css":
      return css();
    case "html":
    case "htm":
      return html();
    default:
      return [];
  }
}

export function CodeEditor({ projectId, path, commit }: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [content, setContent] = useState<string>("");
  const initialContentRef = useRef<string>("");

  // When viewing at a specific commit, file is read-only
  const isReadOnly = !!commit;

  const { data: fileData, isLoading, error } = useFileContent(projectId, path, commit);
  const { data: project } = useProject(projectId);
  const saveFile = useSaveFile();
  const { markDirty, getDirtyContent, setDirtyContent, openPreviewTab } = useTabs();
  const { resolvedTheme } = useUI();
  const navigate = useNavigate();

  // Generate tab ID for this file
  const tabId = `file:${projectId}:${path}`;

  // Update dirty state in tab context
  useEffect(() => {
    markDirty(tabId, isDirty);
  }, [tabId, isDirty, markDirty]);

  // Save handler
  const handleSave = useCallback(async () => {
    if (!isDirty) return;

    try {
      await saveFile.mutateAsync({ projectId, path, content });
      initialContentRef.current = content;
      setIsDirty(false);
      // Clear dirty content on successful save
      setDirtyContent(tabId, null);
    } catch (err) {
      console.error("Failed to save:", err);
    }
  }, [projectId, path, content, isDirty, saveFile, tabId, setDirtyContent]);

  // Store setDirtyContent in a ref to avoid dependency issues
  const setDirtyContentRef = useRef(setDirtyContent);
  setDirtyContentRef.current = setDirtyContent;

  // Initialize editor when file data loads
  useEffect(() => {
    if (!containerRef.current || fileData === undefined) return;

    const serverContent = fileData?.content || "";
    // Check if we have unsaved changes from a previous session
    const savedDirtyContent = getDirtyContent(tabId);
    const initialContent = savedDirtyContent ?? serverContent;
    const hasDirtyContent = savedDirtyContent !== null;

    initialContentRef.current = serverContent;
    setContent(initialContent);
    setIsDirty(hasDirtyContent);

    // Destroy existing view
    if (viewRef.current) {
      viewRef.current.destroy();
      viewRef.current = null;
    }

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        const newContent = update.state.doc.toString();
        setContent(newContent);
        const newIsDirty = newContent !== initialContentRef.current;
        setIsDirty(newIsDirty);
        // Persist dirty content to survive tab switches and refreshes
        if (newIsDirty) {
          setDirtyContentRef.current(tabId, newContent);
        } else {
          setDirtyContentRef.current(tabId, null);
        }
      }
    });

    // Choose theme based on current UI preference
    const editorTheme = resolvedTheme === "light"
      ? [lightTheme, syntaxHighlighting(lightHighlightStyle)]
      : [oneDark];

    const state = EditorState.create({
      doc: initialContent,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        ...(isReadOnly ? [EditorState.readOnly.of(true)] : [history()]),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        getLanguageExtension(path),
        ...editorTheme,
        ...(isReadOnly ? [] : [updateListener]),
        EditorView.theme({
          "&": {
            height: "100%",
            fontSize: "13px",
          },
          ".cm-scroller": {
            fontFamily:
              'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
          },
        }),
      ],
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Note: getDirtyContent is intentionally read once when fileData changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileData, path, tabId, resolvedTheme, isReadOnly]);

  // Keyboard shortcut for save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleSave]);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center text-text-secondary">
        Loading file...
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center text-accent-error">
        Error loading file: {error instanceof Error ? error.message : "Unknown error"}
      </div>
    );
  }

  const filename = path.split("/").pop() || path;
  const extension = filename.split(".").pop()?.toUpperCase() || "";
  const pathParts = path.split("/");

  const handleNavigateToProject = () => {
    navigate({ to: `/projects/${projectId}` });
  };

  const handleNavigateToFolder = (folderPath: string) => {
    openPreviewTab({
      type: "folder",
      projectId,
      path: folderPath,
    });
    navigate({ to: `/folders/${projectId}/${folderPath}` });
  };

  return (
    <div className="h-full flex flex-col bg-bg-primary">
      {/* Commit indicator banner when viewing at a specific commit */}
      {commit && (
        <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/30 text-amber-600 dark:text-amber-400 text-sm flex items-center gap-2">
          <span className="font-mono">{commit.substring(0, 7)}</span>
          <span className="text-text-muted">|</span>
          <span>Viewing file at this commit (read-only)</span>
        </div>
      )}

      {/* Header with breadcrumb navigation */}
      <div className="border-b border-border px-4 py-3 bg-bg-secondary">
        {/* Project link */}
        <button
          onClick={handleNavigateToProject}
          className="text-xs text-text-muted hover:text-accent-primary mb-1 block"
        >
          {project?.name || "Project"}
        </button>
        {/* File path breadcrumbs */}
        <div className="flex items-center text-sm">
          <button
            onClick={() => handleNavigateToFolder("")}
            className="text-text-muted hover:text-accent-primary"
          >
            Files
          </button>
          {pathParts.slice(0, -1).map((part, i) => (
            <span key={i} className="flex items-center">
              <span className="text-text-muted mx-1">/</span>
              <button
                onClick={() => handleNavigateToFolder(pathParts.slice(0, i + 1).join("/"))}
                className="text-text-muted hover:text-accent-primary"
              >
                {part}
              </button>
            </span>
          ))}
          <span className="text-text-muted mx-1">/</span>
          <span className="text-text-primary font-medium flex items-center gap-2">
            {filename}
            {isDirty && <span className="w-2 h-2 rounded-full bg-accent-warning" />}
          </span>
        </div>
      </div>

      {/* Editor */}
      <div ref={containerRef} className="flex-1 overflow-hidden" />

      {/* Status bar */}
      <div className="h-6 px-2 flex items-center justify-between bg-bg-secondary border-t border-border text-xs text-text-secondary">
        <span className={cn(isDirty && "text-accent-warning")}>
          {isReadOnly ? "Read-only" : isDirty ? "Modified" : "Saved"}
          {saveFile.isPending && " (Saving...)"}
        </span>
        <span>{extension}</span>
      </div>
    </div>
  );
}

