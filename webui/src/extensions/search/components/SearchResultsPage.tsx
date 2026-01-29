/**
 * Search Results Page
 *
 * Full-page view for search results with filtering options.
 */

import { useState, useEffect } from "react";
import {
  Search,
  Globe,
  ExternalLink,
  Loader2,
  AlertCircle,
  Clock,
  Filter,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useSearch, type SearchResult, type SearchOptions } from "../api";

interface SearchResultsPageProps {
  query: string;
}

const TIME_RANGE_OPTIONS = [
  { value: undefined, label: "Any time" },
  { value: "day" as const, label: "Past 24 hours" },
  { value: "week" as const, label: "Past week" },
  { value: "month" as const, label: "Past month" },
  { value: "year" as const, label: "Past year" },
];

const CATEGORY_OPTIONS = [
  { value: "general", label: "General" },
  { value: "images", label: "Images" },
  { value: "videos", label: "Videos" },
  { value: "news", label: "News" },
  { value: "science", label: "Science" },
  { value: "files", label: "Files" },
];

interface SearchResultCardProps {
  result: SearchResult;
}

function SearchResultCard({ result }: SearchResultCardProps) {
  const handleClick = () => {
    window.open(result.url, "_blank", "noopener,noreferrer");
  };

  // Parse URL for display
  let displayUrl = result.url;
  try {
    const url = new URL(result.url);
    displayUrl = url.hostname + url.pathname;
    if (displayUrl.length > 60) {
      displayUrl = displayUrl.slice(0, 60) + "...";
    }
  } catch {
    // Keep original URL
  }

  return (
    <div
      className={cn(
        "group p-4 rounded-lg border border-zinc-800 cursor-pointer",
        "hover:border-zinc-700 hover:bg-zinc-800/30 transition-colors"
      )}
      onClick={handleClick}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          {/* URL */}
          <div className="flex items-center gap-2 text-xs text-zinc-500 mb-1">
            <Globe className="w-3 h-3" />
            <span className="truncate">{displayUrl}</span>
          </div>

          {/* Title */}
          <h3 className="text-base font-medium text-zinc-200 group-hover:text-blue-400 mb-1">
            {result.title}
          </h3>

          {/* Snippet */}
          {result.content && (
            <p className="text-sm text-zinc-400 line-clamp-2">{result.content}</p>
          )}

          {/* Metadata */}
          <div className="flex items-center gap-3 mt-2 text-xs text-zinc-500">
            {result.engine && (
              <span className="px-1.5 py-0.5 rounded bg-zinc-800">{result.engine}</span>
            )}
            {result.publishedDate && (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {result.publishedDate}
              </span>
            )}
          </div>
        </div>

        <ExternalLink className="w-4 h-4 opacity-0 group-hover:opacity-50 flex-shrink-0 mt-1" />
      </div>
    </div>
  );
}

export function SearchResultsPage({ query: initialQuery }: SearchResultsPageProps) {
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [inputValue, setInputValue] = useState(initialQuery);
  const [options, setOptions] = useState<SearchOptions>({ limit: 20 });
  const [showFilters, setShowFilters] = useState(false);

  const { data, isLoading, error, refetch } = useSearch(searchQuery, options);

  // Update search when initial query changes
  useEffect(() => {
    setSearchQuery(initialQuery);
    setInputValue(initialQuery);
  }, [initialQuery]);

  const handleSearch = () => {
    if (inputValue.trim()) {
      setSearchQuery(inputValue.trim());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  const handleTimeRangeChange = (timeRange: "day" | "week" | "month" | "year" | undefined) => {
    setOptions((prev) => ({ ...prev, timeRange }));
  };

  const handleCategoryToggle = (category: string) => {
    setOptions((prev) => {
      const currentCategories = prev.categories || [];
      const newCategories = currentCategories.includes(category)
        ? currentCategories.filter((c) => c !== category)
        : [...currentCategories, category];
      return { ...prev, categories: newCategories.length > 0 ? newCategories : undefined };
    });
  };

  return (
    <div className="h-full flex flex-col bg-zinc-900">
      {/* Search header */}
      <div className="sticky top-0 z-10 bg-zinc-900 border-b border-zinc-800 px-6 py-4">
        <div className="max-w-3xl mx-auto">
          {/* Search input */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search the web..."
                className={cn(
                  "w-full pl-10 pr-4 py-2.5 text-base rounded-lg",
                  "bg-zinc-800 border border-zinc-700",
                  "focus:outline-none focus:border-blue-500",
                  "placeholder:text-zinc-500"
                )}
              />
            </div>
            <button
              onClick={handleSearch}
              disabled={!inputValue.trim() || isLoading}
              className={cn(
                "px-4 py-2.5 rounded-lg font-medium",
                "bg-blue-600 hover:bg-blue-700 text-white",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                "Search"
              )}
            </button>
          </div>

          {/* Filter toggle */}
          <div className="flex items-center justify-between mt-3">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={cn(
                "flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-300",
                showFilters && "text-zinc-300"
              )}
            >
              <Filter className="w-4 h-4" />
              <span>Filters</span>
              <ChevronDown
                className={cn("w-4 h-4 transition-transform", showFilters && "rotate-180")}
              />
            </button>

            {data && (
              <span className="text-sm text-zinc-500">
                {data.results.length} results
                {data.number_of_results && data.number_of_results > data.results.length && (
                  <span> of ~{data.number_of_results.toLocaleString()}</span>
                )}
              </span>
            )}
          </div>

          {/* Filters */}
          {showFilters && (
            <div className="mt-3 p-3 rounded-lg bg-zinc-800/50 border border-zinc-700">
              <div className="flex flex-wrap gap-4">
                {/* Time range */}
                <div>
                  <label className="block text-xs text-zinc-400 mb-1.5">Time</label>
                  <div className="flex flex-wrap gap-1">
                    {TIME_RANGE_OPTIONS.map((opt) => (
                      <button
                        key={opt.label}
                        onClick={() => handleTimeRangeChange(opt.value)}
                        className={cn(
                          "px-2 py-1 text-xs rounded",
                          options.timeRange === opt.value
                            ? "bg-blue-600 text-white"
                            : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Categories */}
                <div>
                  <label className="block text-xs text-zinc-400 mb-1.5">Categories</label>
                  <div className="flex flex-wrap gap-1">
                    {CATEGORY_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => handleCategoryToggle(opt.value)}
                        className={cn(
                          "px-2 py-1 text-xs rounded",
                          options.categories?.includes(opt.value)
                            ? "bg-blue-600 text-white"
                            : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="max-w-3xl mx-auto space-y-3">
          {/* Loading */}
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-zinc-500" />
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AlertCircle className="w-8 h-8 text-red-500 mb-2" />
              <div className="text-sm text-zinc-400">Search failed</div>
              <div className="text-xs text-zinc-500 mt-1">{error.message}</div>
              <button
                onClick={() => refetch()}
                className="mt-4 px-3 py-1.5 text-sm rounded bg-zinc-800 hover:bg-zinc-700"
              >
                Try again
              </button>
            </div>
          )}

          {/* Results list */}
          {data && !isLoading && (
            <>
              {data.results.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Search className="w-8 h-8 text-zinc-500 mb-2" />
                  <div className="text-sm text-zinc-400">No results found</div>
                  <div className="text-xs text-zinc-500 mt-1">
                    Try different keywords or remove filters
                  </div>
                </div>
              ) : (
                <>
                  {data.results.map((result, index) => (
                    <SearchResultCard key={`${result.url}-${index}`} result={result} />
                  ))}
                </>
              )}

              {/* Suggestions */}
              {data.suggestions && data.suggestions.length > 0 && (
                <div className="mt-6 p-4 rounded-lg bg-zinc-800/30 border border-zinc-800">
                  <div className="text-xs text-zinc-400 mb-2">Related searches</div>
                  <div className="flex flex-wrap gap-2">
                    {data.suggestions.map((suggestion, index) => (
                      <button
                        key={index}
                        onClick={() => {
                          setInputValue(suggestion);
                          setSearchQuery(suggestion);
                        }}
                        className={cn(
                          "px-3 py-1.5 text-sm rounded-full",
                          "bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                        )}
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
