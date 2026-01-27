import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { File, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { useFilePalette } from "@/contexts/file-palette";
import { useUI } from "@/contexts/ui";
import { useTabs } from "@/contexts/tabs";
import { useFileTree } from "@/lib/api/queries";
import { cn } from "@/lib/utils/cn";

/**
 * Fuzzy match with scoring - returns score (higher is better) or -1 if no match
 */
function fuzzyScore(query: string, text: string): number {
  const lowerQuery = query.toLowerCase();
  const lowerText = text.toLowerCase();

  let score = 0;
  let queryIndex = 0;
  let consecutiveMatches = 0;

  for (let i = 0; i < lowerText.length && queryIndex < lowerQuery.length; i++) {
    if (lowerText[i] === lowerQuery[queryIndex]) {
      score += 1 + consecutiveMatches;
      consecutiveMatches++;
      queryIndex++;

      // Bonus for matching at word boundaries (after / or . or at start)
      if (i === 0 || lowerText[i - 1] === "/" || lowerText[i - 1] === ".") {
        score += 2;
      }
    } else {
      consecutiveMatches = 0;
    }
  }

  return queryIndex === lowerQuery.length ? score : -1;
}

/**
 * Get file name from path
 */
function getFileName(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] || path;
}

/**
 * Get parent directory from path
 */
function getParentDir(path: string): string {
  const lastSlash = path.lastIndexOf("/");
  return lastSlash > 0 ? path.substring(0, lastSlash) : "";
}

export function FilePalette() {
  const { isOpen, close } = useFilePalette();
  const { selectedProjectId } = useUI();
  const { openPreviewTab, openTab } = useTabs();
  const navigate = useNavigate();

  const { data: files, isLoading } = useFileTree(selectedProjectId || "");

  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Filter and sort files based on query
  const filteredFiles = useMemo(() => {
    if (!files) return [];

    if (!query.trim()) {
      // Show first 50 files by default (sorted alphabetically)
      return files.slice(0, 50);
    }

    // Score and sort by relevance
    const scored = files
      .map((path) => ({ path, score: fuzzyScore(query, path) }))
      .filter((item) => item.score >= 0)
      .sort((a, b) => b.score - a.score);

    return scored.slice(0, 100).map((item) => item.path);
  }, [files, query]);

  // Reset state when palette opens/closes
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Reset selected index when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Scroll selected item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;

    const selectedItem = list.children[selectedIndex] as HTMLElement;
    if (selectedItem && selectedItem.scrollIntoView) {
      selectedItem.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  const handleSelect = useCallback(
    (path: string, permanent: boolean) => {
      if (!selectedProjectId) return;

      if (permanent) {
        openTab({ type: "file", projectId: selectedProjectId, path });
      } else {
        openPreviewTab({ type: "file", projectId: selectedProjectId, path });
      }
      navigate({ to: `/files/${selectedProjectId}/${path}` });
      close();
    },
    [selectedProjectId, openTab, openPreviewTab, navigate, close]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((i) =>
            i < filteredFiles.length - 1 ? i + 1 : 0
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((i) =>
            i > 0 ? i - 1 : filteredFiles.length - 1
          );
          break;
        case "Enter":
          e.preventDefault();
          if (filteredFiles[selectedIndex]) {
            // Cmd/Ctrl+Enter opens permanent tab, Enter opens preview
            handleSelect(filteredFiles[selectedIndex], e.metaKey || e.ctrlKey);
          }
          break;
      }
    },
    [filteredFiles, selectedIndex, handleSelect]
  );

  // Don't render if no project selected
  if (!selectedProjectId) {
    return null;
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={close}
      position="top"
      className="w-[500px] max-h-[500px] overflow-hidden"
    >
      <div onKeyDown={handleKeyDown}>
        {/* Search input */}
        <div className="p-2 border-b border-border">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Go to file..."
            className="w-full px-3 py-2 bg-bg-tertiary border border-border rounded text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent-primary"
            autoFocus
          />
        </div>

        {/* File list */}
        <div
          ref={listRef}
          className="max-h-[400px] overflow-y-auto scrollbar-thin"
        >
          {isLoading ? (
            <div className="px-4 py-8 text-center text-text-secondary flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading files...
            </div>
          ) : filteredFiles.length === 0 ? (
            <div className="px-4 py-8 text-center text-text-secondary">
              {query ? `No files matching "${query}"` : "No files found"}
            </div>
          ) : (
            filteredFiles.map((filePath, index) => {
              const fileName = getFileName(filePath);
              const parentDir = getParentDir(filePath);

              return (
                <button
                  key={filePath}
                  onClick={() => handleSelect(filePath, false)}
                  onDoubleClick={() => handleSelect(filePath, true)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={cn(
                    "w-full px-4 py-2 flex items-center gap-3 text-left transition-colors border-l-2",
                    index === selectedIndex
                      ? "bg-accent-primary/10 border-l-accent-primary"
                      : "border-l-transparent hover:bg-bg-tertiary/50"
                  )}
                >
                  <File className="w-4 h-4 text-text-muted shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-text-primary truncate">{fileName}</div>
                    {parentDir && (
                      <div className="text-xs text-text-secondary truncate">
                        {parentDir}
                      </div>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer hint */}
        {filteredFiles.length > 0 && (
          <div className="px-4 py-2 border-t border-border text-xs text-text-muted flex items-center justify-between">
            <span>
              <kbd className="px-1.5 py-0.5 bg-bg-tertiary border border-border rounded text-[10px]">
                Enter
              </kbd>
              {" "}to open
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 bg-bg-tertiary border border-border rounded text-[10px]">
                {navigator.platform.includes("Mac") ? "⌘" : "Ctrl"}+Enter
              </kbd>
              {" "}to open in new tab
            </span>
          </div>
        )}
      </div>
    </Modal>
  );
}
