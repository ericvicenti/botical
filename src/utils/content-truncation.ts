/**
 * Content Truncation Utilities
 * 
 * Handles truncation and summarization of large content to prevent context bloat
 * in agent conversations while preserving essential information.
 */

export interface TruncationOptions {
  /** Maximum length in characters before truncation */
  maxLength: number;
  /** Whether to preserve the beginning, end, or both */
  preserveStrategy: "start" | "end" | "both";
  /** Number of lines to preserve from start/end when using "both" strategy */
  preserveLines?: number;
  /** Whether to add a summary of what was truncated */
  addSummary: boolean;
}

export interface TruncationResult {
  /** The truncated content */
  content: string;
  /** Whether truncation occurred */
  wasTruncated: boolean;
  /** Original length in characters */
  originalLength: number;
  /** Summary of what was truncated (if requested) */
  summary?: string;
}

/**
 * Default truncation options for different content types
 */
export const DEFAULT_TRUNCATION_OPTIONS: Record<string, TruncationOptions> = {
  // Tool outputs (file reads, command outputs, etc.)
  toolOutput: {
    maxLength: 2000,
    preserveStrategy: "both",
    preserveLines: 10,
    addSummary: true,
  },
  
  // Test outputs (can be very long with stack traces)
  testOutput: {
    maxLength: 1500,
    preserveStrategy: "both", 
    preserveLines: 8,
    addSummary: true,
  },
  
  // File contents
  fileContent: {
    maxLength: 3000,
    preserveStrategy: "both",
    preserveLines: 15,
    addSummary: true,
  },
  
  // Error messages and stack traces
  errorOutput: {
    maxLength: 1000,
    preserveStrategy: "start",
    addSummary: true,
  },
  
  // General content
  general: {
    maxLength: 1500,
    preserveStrategy: "start",
    addSummary: true,
  },
};

/**
 * Truncate content based on the specified options
 */
export function truncateContent(
  content: string,
  options: TruncationOptions
): TruncationResult {
  const originalLength = content.length;
  
  if (originalLength <= options.maxLength) {
    return {
      content,
      wasTruncated: false,
      originalLength,
    };
  }
  
  let truncatedContent: string;
  let summary: string | undefined;
  
  switch (options.preserveStrategy) {
    case "start":
      truncatedContent = content.substring(0, options.maxLength);
      if (options.addSummary) {
        const truncatedChars = originalLength - options.maxLength;
        summary = `[Truncated ${truncatedChars} characters from end]`;
      }
      break;
      
    case "end":
      truncatedContent = content.substring(originalLength - options.maxLength);
      if (options.addSummary) {
        const truncatedChars = originalLength - options.maxLength;
        summary = `[Truncated ${truncatedChars} characters from start]`;
      }
      break;
      
    case "both":
      truncatedContent = truncateBoth(content, options);
      if (options.addSummary) {
        const lines = content.split('\n');
        const preserveLines = options.preserveLines || 10;
        const truncatedLines = Math.max(0, lines.length - (preserveLines * 2));
        const truncatedChars = originalLength - truncatedContent.length;
        summary = `[Truncated ${truncatedLines} lines (${truncatedChars} characters) from middle]`;
      }
      break;
  }
  
  // Add summary if requested
  if (summary) {
    truncatedContent = `${truncatedContent}\n\n${summary}`;
  }
  
  return {
    content: truncatedContent,
    wasTruncated: true,
    originalLength,
    summary,
  };
}

/**
 * Truncate content preserving both start and end
 */
function truncateBoth(content: string, options: TruncationOptions): string {
  const lines = content.split('\n');
  const preserveLines = options.preserveLines || 10;
  
  // If we have fewer lines than we want to preserve, just truncate by characters
  if (lines.length <= preserveLines * 2) {
    const halfLength = Math.floor(options.maxLength / 2);
    const start = content.substring(0, halfLength);
    const end = content.substring(content.length - halfLength);
    return `${start}\n\n[... content truncated ...]\n\n${end}`;
  }
  
  // Preserve first and last N lines
  const startLines = lines.slice(0, preserveLines);
  const endLines = lines.slice(-preserveLines);
  
  const result = [
    ...startLines,
    '',
    `[... ${lines.length - (preserveLines * 2)} lines truncated ...]`,
    '',
    ...endLines
  ].join('\n');
  
  // If still too long, fall back to character truncation
  if (result.length > options.maxLength) {
    const halfLength = Math.floor(options.maxLength / 2);
    const start = content.substring(0, halfLength);
    const end = content.substring(content.length - halfLength);
    return `${start}\n\n[... content truncated ...]\n\n${end}`;
  }
  
  return result;
}

/**
 * Truncate tool output based on tool name and content type
 */
export function truncateToolOutput(
  toolName: string,
  output: unknown
): TruncationResult {
  const content = typeof output === 'string' ? output : JSON.stringify(output, null, 2);
  
  // Choose truncation strategy based on tool type
  let options: TruncationOptions;
  
  if (toolName.includes('read') || toolName.includes('file')) {
    options = DEFAULT_TRUNCATION_OPTIONS.fileContent;
  } else if (toolName.includes('test') || toolName.includes('run')) {
    options = DEFAULT_TRUNCATION_OPTIONS.testOutput;
  } else if (toolName.includes('error') || content.includes('Error:') || content.includes('Exception:')) {
    options = DEFAULT_TRUNCATION_OPTIONS.errorOutput;
  } else {
    options = DEFAULT_TRUNCATION_OPTIONS.toolOutput;
  }
  
  return truncateContent(content, options);
}

/**
 * Check if content should be truncated based on heuristics
 */
export function shouldTruncateContent(content: string, threshold: number = 1000): boolean {
  return content.length > threshold;
}

/**
 * Get a summary of the content type and size
 */
export function getContentSummary(content: string): string {
  const lines = content.split('\n').length;
  const chars = content.length;
  const words = content.split(/\s+/).length;
  
  if (lines > 1) {
    return `${lines} lines, ${chars} characters`;
  } else {
    return `${words} words, ${chars} characters`;
  }
}