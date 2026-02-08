/**
 * Search Sidebar Panel
 *
 * Shows a search input and recent/quick results.
 * Allows searching the web via SearXNG.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import {
  Search,
  Globe,
  AlertCircle,
  Loader2,
  ExternalLink,
  Clock,
  Play,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { usePageOpener } from "@/primitives/hooks";
import {
  useSearchAvailable,
  useSearchStatus,
  useSearchMutation,
  useProvisionSearch,
  type SearchResult,
} from "../api";

const MAX_RECENT_SEARCHES = 5;
const MAX_QUICK_RESULTS = 3;

// Store recent searches in localStorage
const RECENT_SEARCHES_KEY = "botical:search:recent";

function getRecentSearches(): string[] {
  try {
    const stored = localStorage.getItem(RECENT_SEARCHES_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function addRecentSearch(query: string): void {
  try {
    const recent = getRecentSearches().filter((q) => q !== query);
    recent.unshift(query);
    localStorage.setItem(
      RECENT_SEARCHES_KEY,
      JSON.stringify(recent.slice(0, MAX_RECENT_SEARCHES))
    );
  } catch {
    // Ignore localStorage errors
  }
}

interface SearchResultItemProps {
  result: SearchResult;
  compact?: boolean;
}

function SearchResultItem({ result, compact = false }: SearchResultItemProps) {
  const handleClick = () => {
    window.open(result.url, "_blank", "noopener,noreferrer");
  };

  return (
    <div
      className={cn(
        "group cursor-pointer rounded px-2 py-1.5",
        "hover:bg-zinc-800/50"
      )}
      onClick={handleClick}
    >
      <div className="flex items-start gap-2">
        <Globe className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-zinc-500" />
        <div className="flex-1 min-w-0">
          <div className="text-sm truncate group-hover:text-blue-400">
            {result.title}
          </div>
          {!compact && result.content && (
            <div className="text-xs text-zinc-500 line-clamp-2 mt-0.5">
              {result.content}
            </div>
          )}
          <div className="text-xs text-zinc-600 truncate mt-0.5">
            {result.url}
          </div>
        </div>
        <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-50 flex-shrink-0 mt-0.5" />
      </div>
    </div>
  );
}

export function SearchSidebarPanel() {
  const [query, setQuery] = useState("");
  const [recentSearches, setRecentSearches] = useState<string[]>(getRecentSearches);
  const [quickResults, setQuickResults] = useState<SearchResult[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: available, isLoading: availableLoading } = useSearchAvailable();
  const { data: status, isLoading: statusLoading } = useSearchStatus();
  const searchMutation = useSearchMutation();
  const provisionMutation = useProvisionSearch();
  const { openPage } = usePageOpener();

  // Update recent searches when component mounts
  useEffect(() => {
    setRecentSearches(getRecentSearches());
  }, []);

  const handleSearch = useCallback(
    async (searchQuery: string) => {
      if (!searchQuery.trim()) return;

      const trimmedQuery = searchQuery.trim();
      addRecentSearch(trimmedQuery);
      setRecentSearches(getRecentSearches());

      // Perform quick search
      try {
        const results = await searchMutation.mutateAsync({
          query: trimmedQuery,
          options: { limit: MAX_QUICK_RESULTS },
        });
        setQuickResults(results.results);
      } catch (err) {
        console.error("Search failed:", err);
      }
    },
    [searchMutation]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && query.trim()) {
      handleSearch(query);
    }
  };

  const handleViewAllResults = () => {
    if (query.trim()) {
      openPage("search.results", { query: query.trim() });
    }
  };

  const handleRecentSearch = (recentQuery: string) => {
    setQuery(recentQuery);
    handleSearch(recentQuery);
  };

  const handleClearRecent = () => {
    localStorage.removeItem(RECENT_SEARCHES_KEY);
    setRecentSearches([]);
  };

  const handleProvision = async () => {
    try {
      await provisionMutation.mutateAsync();
    } catch (err) {
      console.error("Failed to provision SearXNG:", err);
      alert(`Failed to provision SearXNG: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  };

  // Loading state
  if (availableLoading || statusLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
      </div>
    );
  }

  // SearXNG not available - show setup prompt
  if (!available) {
    return (
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800">
          <Search className="w-4 h-4" />
          <span className="text-sm font-medium">Web Search</span>
        </div>

        {/* Setup prompt */}
        <div className="flex-1 flex flex-col items-center justify-center p-4 text-center">
          <AlertCircle className="w-8 h-8 text-zinc-500 mb-2" />
          <div className="text-sm text-zinc-400">SearXNG not running</div>
          <div className="text-xs text-zinc-500 mt-1 mb-4">
            {status?.error || "Start the search engine to enable web search"}
          </div>

          <button
            onClick={handleProvision}
            disabled={provisionMutation.isPending}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded",
              "bg-blue-600 hover:bg-blue-700 text-sm",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            {provisionMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Starting...</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                <span>Start SearXNG</span>
              </>
            )}
          </button>

          {status?.containerExists && !status.containerRunning && (
            <div className="text-xs text-zinc-500 mt-2">
              Container exists but is stopped
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800">
        <Search className="w-4 h-4" />
        <span className="text-sm font-medium">Web Search</span>
        <div className="ml-auto w-2 h-2 rounded-full bg-green-500" title="SearXNG running" />
      </div>

      {/* Search input */}
      <div className="px-3 py-2 border-b border-zinc-800">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search the web..."
            className={cn(
              "w-full pl-8 pr-3 py-1.5 text-sm rounded",
              "bg-zinc-800/50 border border-zinc-700",
              "focus:outline-none focus:border-blue-500",
              "placeholder:text-zinc-500"
            )}
          />
          {searchMutation.isPending && (
            <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-zinc-500" />
          )}
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto">
        {/* Quick results */}
        {quickResults.length > 0 && (
          <div className="py-2">
            <div className="flex items-center justify-between px-3 mb-1">
              <span className="text-xs text-zinc-400">Results</span>
              <button
                onClick={handleViewAllResults}
                className="text-xs text-blue-500 hover:text-blue-400"
              >
                View all
              </button>
            </div>
            <div>
              {quickResults.map((result, index) => (
                <SearchResultItem key={index} result={result} compact />
              ))}
            </div>
          </div>
        )}

        {/* Recent searches */}
        {recentSearches.length > 0 && quickResults.length === 0 && (
          <div className="py-2">
            <div className="flex items-center justify-between px-3 mb-1">
              <span className="text-xs text-zinc-400">Recent</span>
              <button
                onClick={handleClearRecent}
                className="text-xs text-zinc-500 hover:text-zinc-400"
              >
                Clear
              </button>
            </div>
            <div>
              {recentSearches.map((recent, index) => (
                <button
                  key={index}
                  onClick={() => handleRecentSearch(recent)}
                  className={cn(
                    "flex items-center gap-2 w-full px-3 py-1.5 text-left",
                    "hover:bg-zinc-800/50 rounded"
                  )}
                >
                  <Clock className="w-3.5 h-3.5 text-zinc-500" />
                  <span className="text-sm truncate">{recent}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {quickResults.length === 0 && recentSearches.length === 0 && (
          <div className="px-4 py-8 text-center text-zinc-500 text-sm">
            Enter a search query above
          </div>
        )}

        {/* Search error */}
        {searchMutation.isError && (
          <div className="px-3 py-2">
            <div className="flex items-center gap-2 text-red-500 text-xs">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>Search failed. Try again.</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
