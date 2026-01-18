import { useEffect, useRef, useState, useCallback } from "react";
import { EditorState, type Extension } from "@codemirror/state";
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { oneDark } from "@codemirror/theme-one-dark";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { useFileContent, useSaveFile } from "@/lib/api/queries";
import { cn } from "@/lib/utils/cn";

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
  const saveFile = useSaveFile();

  // Save handler
  const handleSave = useCallback(async () => {
    if (!isDirty) return;

    try {
      await saveFile.mutateAsync({ projectId, path, content });
      initialContentRef.current = content;
      setIsDirty(false);
    } catch (err) {
      console.error("Failed to save:", err);
    }
  }, [projectId, path, content, isDirty, saveFile]);

  // Initialize editor when file data loads
  useEffect(() => {
    if (!containerRef.current || fileData === undefined) return;

    const initialContent = fileData?.content || "";
    initialContentRef.current = initialContent;
    setContent(initialContent);
    setIsDirty(false);

    // Destroy existing view
    if (viewRef.current) {
      viewRef.current.destroy();
      viewRef.current = null;
    }

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        const newContent = update.state.doc.toString();
        setContent(newContent);
        setIsDirty(newContent !== initialContentRef.current);
      }
    });

    const state = EditorState.create({
      doc: initialContent,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
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
  }, [fileData, path]);

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

  return (
    <div className="h-full flex flex-col bg-bg-primary">
      {/* Breadcrumb */}
      <Breadcrumb path={path} isDirty={isDirty} onSave={handleSave} />

      {/* Editor */}
      <div ref={containerRef} className="flex-1 overflow-hidden" />

      {/* Status bar */}
      <div className="h-6 px-2 flex items-center justify-between bg-bg-secondary border-t border-border text-xs text-text-secondary">
        <span className={cn(isDirty && "text-accent-warning")}>
          {isDirty ? "Modified" : "Saved"}
          {saveFile.isPending && " (Saving...)"}
        </span>
        <span>{filename.split(".").pop()?.toUpperCase()}</span>
      </div>
    </div>
  );
}

function Breadcrumb({
  path,
  isDirty,
  onSave,
}: {
  path: string;
  isDirty: boolean;
  onSave: () => void;
}) {
  const parts = path.split("/").filter(Boolean);

  return (
    <div className="h-8 px-2 flex items-center justify-between bg-bg-secondary border-b border-border text-sm">
      <div className="flex items-center gap-1">
        {parts.map((part, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <span className="text-text-muted">/</span>}
            <span
              className={
                i === parts.length - 1 ? "text-text-primary" : "text-text-secondary"
              }
            >
              {part}
            </span>
          </span>
        ))}
        {isDirty && <span className="text-accent-warning ml-1">*</span>}
      </div>
      {isDirty && (
        <button
          onClick={onSave}
          className="text-xs px-2 py-0.5 rounded bg-accent-primary text-white hover:bg-accent-primary/90"
        >
          Save
        </button>
      )}
    </div>
  );
}
