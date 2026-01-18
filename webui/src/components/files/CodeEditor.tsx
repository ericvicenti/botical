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
import { oneDark } from "@codemirror/theme-one-dark";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { useFileContent, useSaveFile, useProject } from "@/lib/api/queries";
import { useTabs } from "@/contexts/tabs";
import { cn } from "@/lib/utils/cn";
import { ContentHeader } from "@/components/layout/ContentHeader";
import { FileText } from "lucide-react";

interface CodeEditorProps {
  projectId: string;
  path: string;
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

export function CodeEditor({ projectId, path }: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [content, setContent] = useState<string>("");
  const initialContentRef = useRef<string>("");

  const { data: fileData, isLoading, error } = useFileContent(projectId, path);
  const { data: project } = useProject(projectId);
  const saveFile = useSaveFile();
  const { markDirty, getDirtyContent, setDirtyContent } = useTabs();

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

    const state = EditorState.create({
      doc: initialContent,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        getLanguageExtension(path),
        oneDark,
        updateListener,
        EditorView.theme({
          "&": {
            height: "100%",
            fontSize: "13px",
          },
          ".cm-scroller": {
            fontFamily:
              'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
          },
          ".cm-gutters": {
            backgroundColor: "var(--bg-secondary)",
            borderRight: "1px solid var(--border)",
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
  }, [fileData, path, tabId]);

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

  return (
    <div className="h-full flex flex-col bg-bg-primary">
      {/* Header */}
      <ContentHeader
        project={project ? { id: project.id, name: project.name } : null}
        title={path}
        subtitle={
          <span className="flex items-center gap-1">
            <FileText className="w-3.5 h-3.5" />
            {extension} file
            {isDirty && <span className="text-accent-warning ml-1">· Modified</span>}
          </span>
        }
      >
        {isDirty && (
          <button
            onClick={handleSave}
            disabled={saveFile.isPending}
            className="px-3 py-1.5 text-sm rounded-lg bg-accent-primary text-white hover:bg-accent-primary/90 disabled:opacity-50"
          >
            {saveFile.isPending ? "Saving..." : "Save"}
          </button>
        )}
      </ContentHeader>

      {/* Editor */}
      <div ref={containerRef} className="flex-1 overflow-hidden" />

      {/* Status bar */}
      <div className="h-6 px-2 flex items-center justify-between bg-bg-secondary border-t border-border text-xs text-text-secondary">
        <span className={cn(isDirty && "text-accent-warning")}>
          {isDirty ? "Modified" : "Saved"}
          {saveFile.isPending && " (Saving...)"}
        </span>
        <span>{extension}</span>
      </div>
    </div>
  );
}

