import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils/cn";

interface MarkdownProps {
  children: string;
  className?: string;
}

/**
 * Markdown renderer component with styling for chat messages.
 * Handles streaming gracefully - incomplete markdown renders as plain text.
 */
export function Markdown({ children, className }: MarkdownProps) {
  return (
    <div className={cn("prose prose-sm prose-invert max-w-none", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
        // Headings
        h1: ({ children }) => (
          <h1 className="text-lg font-bold mt-4 mb-2 first:mt-0">{children}</h1>
        ),
        h2: ({ children }) => (
          <h2 className="text-base font-bold mt-3 mb-2 first:mt-0">{children}</h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-sm font-bold mt-2 mb-1 first:mt-0">{children}</h3>
        ),
        // Paragraphs
        p: ({ children }) => (
          <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>
        ),
        // Lists
        ul: ({ children }) => (
          <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>
        ),
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        // Code
        code: ({ className, children, ...props }) => {
          const isInline = !className;
          if (isInline) {
            return (
              <code
                className="px-1.5 py-0.5 bg-bg-primary rounded text-sm font-mono text-accent-primary"
                {...props}
              >
                {children}
              </code>
            );
          }
          // Block code - extract language from className
          const language = className?.replace("language-", "") || "";
          return (
            <code
              className="block bg-bg-primary rounded-lg p-3 text-sm font-mono overflow-x-auto"
              data-language={language}
              {...props}
            >
              {children}
            </code>
          );
        },
        pre: ({ children }) => (
          <pre className="mb-2 last:mb-0 overflow-x-auto">{children}</pre>
        ),
        // Links
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent-primary hover:underline"
          >
            {children}
          </a>
        ),
        // Blockquotes
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-border pl-3 italic text-text-muted mb-2">
            {children}
          </blockquote>
        ),
        // Horizontal rule
        hr: () => <hr className="border-border my-4" />,
        // Strong/Bold
        strong: ({ children }) => (
          <strong className="font-semibold">{children}</strong>
        ),
        // Emphasis/Italic
        em: ({ children }) => <em className="italic">{children}</em>,
        // Tables (GFM)
        table: ({ children }) => (
          <div className="overflow-x-auto mb-2">
            <table className="min-w-full border-collapse border border-border text-sm">
              {children}
            </table>
          </div>
        ),
        thead: ({ children }) => (
          <thead className="bg-bg-secondary">{children}</thead>
        ),
        tbody: ({ children }) => <tbody>{children}</tbody>,
        tr: ({ children }) => (
          <tr className="border-b border-border">{children}</tr>
        ),
        th: ({ children }) => (
          <th className="px-3 py-2 text-left font-semibold border border-border">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="px-3 py-2 border border-border">{children}</td>
        ),
      }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
