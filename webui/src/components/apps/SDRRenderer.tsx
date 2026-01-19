/**
 * SDR Renderer
 *
 * Renders Server-Defined Rendering component trees into React components.
 * This is the client-side counterpart to the @iris/ui server-side functions.
 */

import React from "react";
import type { ReactNode } from "react";

// Types from the apps system
interface ComponentNode {
  $: "component";
  type: string;
  props: Record<string, unknown>;
  children?: UIChild[];
  key?: string;
}

type UIChild = string | number | boolean | null | undefined | ComponentNode;

interface ActionDescriptor {
  $action: string;
  args?: unknown;
}

interface SDRRendererProps {
  tree: ComponentNode | null;
  onAction: (action: string, args?: unknown) => void;
  state?: Record<string, unknown>;
}

// ============================================================================
// Component Registry
// ============================================================================

// Map of component type names to React components
const componentRegistry: Record<
  string,
  React.ComponentType<{ children?: ReactNode; [key: string]: unknown }>
> = {};

/**
 * Register a component in the SDR registry
 */
export function registerComponent(
  name: string,
  component: React.ComponentType<{ children?: ReactNode; [key: string]: unknown }>
): void {
  componentRegistry[name] = component;
}

/**
 * Get a component from the registry
 */
export function getComponent(name: string): React.ComponentType<{ children?: ReactNode; [key: string]: unknown }> | undefined {
  return componentRegistry[name];
}

// ============================================================================
// Built-in Components
// ============================================================================

// Layout Components
registerComponent("Stack", ({ children, gap, padding, paddingX, paddingY, align, justify, flex, ...rest }) => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      gap: gap as number,
      padding: padding as number,
      paddingLeft: paddingX as number,
      paddingRight: paddingX as number,
      paddingTop: paddingY as number,
      paddingBottom: paddingY as number,
      alignItems: mapAlign(align as string),
      justifyContent: mapJustify(justify as string),
      flex: flex as number,
    }}
    {...rest}
  >
    {children}
  </div>
));

registerComponent("Row", ({ children, gap, padding, paddingX, paddingY, align, justify, wrap, flex, ...rest }) => (
  <div
    style={{
      display: "flex",
      flexDirection: "row",
      gap: gap as number,
      padding: padding as number,
      paddingLeft: paddingX as number,
      paddingRight: paddingX as number,
      paddingTop: paddingY as number,
      paddingBottom: paddingY as number,
      alignItems: mapAlign(align as string),
      justifyContent: mapJustify(justify as string),
      flexWrap: wrap ? "wrap" : undefined,
      flex: flex as number,
    }}
    {...rest}
  >
    {children}
  </div>
));

registerComponent("Box", ({ children, padding, paddingX, paddingY, margin, marginX, marginY, flex, width, height, backgroundColor, borderRadius, border, ...rest }) => (
  <div
    style={{
      padding: padding as number,
      paddingLeft: paddingX as number,
      paddingRight: paddingX as number,
      paddingTop: paddingY as number,
      paddingBottom: paddingY as number,
      margin: margin as number,
      marginLeft: marginX as number,
      marginRight: marginX as number,
      marginTop: marginY as number,
      marginBottom: marginY as number,
      flex: flex as number,
      width: width as string | number,
      height: height as string | number,
      backgroundColor: backgroundColor as string,
      borderRadius: borderRadius as number,
      border: border as string,
    }}
    {...rest}
  >
    {children}
  </div>
));

registerComponent("ScrollView", ({ children, horizontal, flex, ...rest }) => (
  <div
    style={{
      overflow: "auto",
      overflowX: horizontal ? "auto" : undefined,
      overflowY: horizontal ? undefined : "auto",
      flex: flex as number,
    }}
    {...rest}
  >
    {children}
  </div>
));

registerComponent("Divider", ({ margin }) => (
  <hr
    style={{
      border: "none",
      borderTop: "1px solid var(--border-color, #e5e5e5)",
      margin: `${margin ?? 8}px 0`,
    }}
  />
));

// Typography Components
registerComponent("Text", ({ children, size, weight, color, align, italic, mono, ...rest }) => (
  <span
    style={{
      fontSize: mapFontSize(size as string),
      fontWeight: mapFontWeight(weight as string),
      color: color as string,
      textAlign: align as "left" | "center" | "right",
      fontStyle: italic ? "italic" : undefined,
      fontFamily: mono ? "monospace" : undefined,
    }}
    {...rest}
  >
    {children}
  </span>
));

registerComponent("Heading", ({ children, level = 2, color, ...rest }) => {
  const Tag = `h${level}` as keyof JSX.IntrinsicElements;
  return (
    <Tag style={{ color: color as string, margin: "0 0 0.5em 0" }} {...rest}>
      {children}
    </Tag>
  );
});

registerComponent("Code", ({ children, language, inline, ...rest }) => {
  if (inline) {
    return (
      <code
        style={{
          fontFamily: "monospace",
          backgroundColor: "var(--code-bg, #f5f5f5)",
          padding: "2px 6px",
          borderRadius: 4,
        }}
        {...rest}
      >
        {children}
      </code>
    );
  }
  return (
    <pre
      style={{
        fontFamily: "monospace",
        backgroundColor: "var(--code-bg, #1e1e1e)",
        color: "var(--code-color, #d4d4d4)",
        padding: 16,
        borderRadius: 8,
        overflow: "auto",
      }}
      {...rest}
    >
      <code>{children}</code>
    </pre>
  );
});

registerComponent("Link", ({ children, href, external, ...rest }) => (
  <a
    href={href as string}
    target={external ? "_blank" : undefined}
    rel={external ? "noopener noreferrer" : undefined}
    style={{ color: "var(--link-color, #0066cc)" }}
    {...rest}
  >
    {children}
  </a>
));

// Form Components
registerComponent("Button", ({ children, variant = "primary", size = "md", disabled, loading, onPress, ...rest }) => (
  <button
    disabled={disabled as boolean || loading as boolean}
    style={{
      padding: size === "sm" ? "4px 12px" : size === "lg" ? "12px 24px" : "8px 16px",
      fontSize: size === "sm" ? 12 : size === "lg" ? 16 : 14,
      borderRadius: 6,
      border: variant === "outline" ? "1px solid currentColor" : "none",
      backgroundColor:
        variant === "primary" ? "var(--primary-color, #0066cc)" :
        variant === "danger" ? "var(--danger-color, #dc3545)" :
        variant === "ghost" || variant === "outline" ? "transparent" :
        "var(--secondary-color, #6c757d)",
      color: variant === "ghost" || variant === "outline" ? "inherit" : "white",
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.5 : 1,
    }}
    {...rest}
  >
    {loading ? "..." : children}
  </button>
));

registerComponent("Input", ({ value, placeholder, type = "text", disabled, multiline, rows, onChangeText, onSubmit, ...rest }) => {
  if (multiline) {
    return (
      <textarea
        value={value as string}
        placeholder={placeholder as string}
        disabled={disabled as boolean}
        rows={rows as number || 3}
        style={{
          padding: 8,
          borderRadius: 6,
          border: "1px solid var(--border-color, #ccc)",
          fontFamily: "inherit",
          fontSize: 14,
          resize: "vertical",
        }}
        {...rest}
      />
    );
  }
  return (
    <input
      type={type as string}
      value={value as string}
      placeholder={placeholder as string}
      disabled={disabled as boolean}
      style={{
        padding: 8,
        borderRadius: 6,
        border: "1px solid var(--border-color, #ccc)",
        fontSize: 14,
      }}
      {...rest}
    />
  );
});

registerComponent("TextArea", ({ value, placeholder, disabled, rows, ...rest }) => (
  <textarea
    value={value as string}
    placeholder={placeholder as string}
    disabled={disabled as boolean}
    rows={rows as number || 3}
    style={{
      padding: 8,
      borderRadius: 6,
      border: "1px solid var(--border-color, #ccc)",
      fontFamily: "inherit",
      fontSize: 14,
      resize: "vertical",
    }}
    {...rest}
  />
));

registerComponent("Select", ({ value, options, placeholder, disabled, onChange, ...rest }) => (
  <select
    value={value as string}
    disabled={disabled as boolean}
    style={{
      padding: 8,
      borderRadius: 6,
      border: "1px solid var(--border-color, #ccc)",
      fontSize: 14,
    }}
    {...rest}
  >
    {placeholder && <option value="">{placeholder}</option>}
    {(options as Array<{ value: string; label: string }>)?.map((opt) => (
      <option key={opt.value} value={opt.value}>
        {opt.label}
      </option>
    ))}
  </select>
));

registerComponent("Checkbox", ({ checked, label, disabled, onChange, ...rest }) => (
  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: disabled ? "not-allowed" : "pointer" }}>
    <input
      type="checkbox"
      checked={checked as boolean}
      disabled={disabled as boolean}
      {...rest}
    />
    {label}
  </label>
));

registerComponent("Switch", ({ value, disabled, onChange, ...rest }) => (
  <button
    role="switch"
    aria-checked={value as boolean}
    disabled={disabled as boolean}
    style={{
      width: 44,
      height: 24,
      borderRadius: 12,
      border: "none",
      backgroundColor: value ? "var(--primary-color, #0066cc)" : "var(--border-color, #ccc)",
      position: "relative",
      cursor: disabled ? "not-allowed" : "pointer",
    }}
    {...rest}
  >
    <span
      style={{
        position: "absolute",
        top: 2,
        left: value ? 22 : 2,
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: "white",
        transition: "left 0.2s",
      }}
    />
  </button>
));

// Data Display Components
registerComponent("DataTable", ({ data, columns, onRowPress, ...rest }) => {
  const tableData = data as Array<Record<string, unknown>>;
  const tableColumns = columns as Array<{ key: string; label: string; width?: number | string }> ||
    (tableData[0] ? Object.keys(tableData[0]).map((key) => ({ key, label: key })) : []);

  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }} {...rest}>
      <thead>
        <tr>
          {tableColumns.map((col) => (
            <th
              key={col.key}
              style={{
                textAlign: "left",
                padding: 8,
                borderBottom: "2px solid var(--border-color, #e5e5e5)",
                width: col.width,
              }}
            >
              {col.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {tableData.map((row, i) => (
          <tr key={i} style={{ cursor: onRowPress ? "pointer" : undefined }}>
            {tableColumns.map((col) => (
              <td
                key={col.key}
                style={{
                  padding: 8,
                  borderBottom: "1px solid var(--border-color, #e5e5e5)",
                }}
              >
                {String(row[col.key] ?? "")}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
});

registerComponent("List", ({ children }) => <div>{children}</div>);

registerComponent("Card", ({ children, padding = 16, elevation = 1, onPress, ...rest }) => (
  <div
    style={{
      padding: padding as number,
      borderRadius: 8,
      backgroundColor: "var(--card-bg, white)",
      boxShadow: `0 ${elevation}px ${(elevation as number) * 2}px rgba(0,0,0,0.1)`,
      cursor: onPress ? "pointer" : undefined,
    }}
    {...rest}
  >
    {children}
  </div>
));

registerComponent("Badge", ({ children, variant = "default", ...rest }) => {
  const colors: Record<string, { bg: string; text: string }> = {
    default: { bg: "#e5e5e5", text: "#333" },
    success: { bg: "#d4edda", text: "#155724" },
    warning: { bg: "#fff3cd", text: "#856404" },
    error: { bg: "#f8d7da", text: "#721c24" },
    info: { bg: "#d1ecf1", text: "#0c5460" },
  };
  const style = colors[variant as string] || colors.default;

  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 4,
        fontSize: 12,
        fontWeight: 500,
        backgroundColor: style.bg,
        color: style.text,
      }}
      {...rest}
    >
      {children}
    </span>
  );
});

registerComponent("Avatar", ({ src, name, size = "md", ...rest }) => {
  const sizes = { sm: 32, md: 40, lg: 56 };
  const px = sizes[size as keyof typeof sizes] || 40;

  return (
    <div
      style={{
        width: px,
        height: px,
        borderRadius: "50%",
        backgroundColor: "var(--primary-color, #0066cc)",
        color: "white",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: px * 0.4,
        fontWeight: 500,
        overflow: "hidden",
      }}
      {...rest}
    >
      {src ? (
        <img src={src as string} alt={name as string} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        (name as string)?.[0]?.toUpperCase() || "?"
      )}
    </div>
  );
});

// Feedback Components
registerComponent("Alert", ({ children, variant = "info", title, dismissible, onDismiss, ...rest }) => {
  const colors: Record<string, { bg: string; border: string; text: string }> = {
    info: { bg: "#d1ecf1", border: "#bee5eb", text: "#0c5460" },
    success: { bg: "#d4edda", border: "#c3e6cb", text: "#155724" },
    warning: { bg: "#fff3cd", border: "#ffeeba", text: "#856404" },
    error: { bg: "#f8d7da", border: "#f5c6cb", text: "#721c24" },
  };
  const style = colors[variant as string] || colors.info;

  return (
    <div
      style={{
        padding: 12,
        borderRadius: 6,
        border: `1px solid ${style.border}`,
        backgroundColor: style.bg,
        color: style.text,
        position: "relative",
      }}
      {...rest}
    >
      {title && <div style={{ fontWeight: 600, marginBottom: 4 }}>{title}</div>}
      {children}
      {dismissible && (
        <button
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 16,
          }}
        >
          ×
        </button>
      )}
    </div>
  );
});

registerComponent("Spinner", ({ size = "md" }) => {
  const sizes = { sm: 16, md: 24, lg: 32 };
  const px = sizes[size as keyof typeof sizes] || 24;

  return (
    <div
      style={{
        width: px,
        height: px,
        border: `2px solid var(--border-color, #e5e5e5)`,
        borderTopColor: "var(--primary-color, #0066cc)",
        borderRadius: "50%",
        animation: "spin 1s linear infinite",
      }}
    />
  );
});

registerComponent("Progress", ({ value, showLabel, ...rest }) => (
  <div style={{ width: "100%" }} {...rest}>
    <div
      style={{
        height: 8,
        backgroundColor: "var(--border-color, #e5e5e5)",
        borderRadius: 4,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: `${Math.min(100, Math.max(0, value as number))}%`,
          height: "100%",
          backgroundColor: "var(--primary-color, #0066cc)",
          transition: "width 0.3s",
        }}
      />
    </div>
    {showLabel && (
      <div style={{ fontSize: 12, marginTop: 4, textAlign: "center" }}>
        {Math.round(value as number)}%
      </div>
    )}
  </div>
));

// Specialized Components (stubs - TODO: implement properly)
registerComponent("CodeEditor", ({ value, language, readOnly, lineNumbers, onChange, ...rest }) => (
  <textarea
    value={value as string}
    readOnly={readOnly as boolean}
    style={{
      width: "100%",
      minHeight: 200,
      fontFamily: "monospace",
      padding: 12,
      backgroundColor: "#1e1e1e",
      color: "#d4d4d4",
      border: "none",
      borderRadius: 8,
    }}
    {...rest}
  />
));

registerComponent("Terminal", ({ processId, readOnly, ...rest }) => (
  <div
    style={{
      backgroundColor: "#1e1e1e",
      color: "#d4d4d4",
      fontFamily: "monospace",
      padding: 12,
      borderRadius: 8,
      minHeight: 200,
    }}
    {...rest}
  >
    {/* TODO: Connect to actual terminal */}
    Terminal (process: {processId || "none"})
  </div>
));

registerComponent("Markdown", ({ children, ...rest }) => (
  <div {...rest}>
    {/* TODO: Proper markdown rendering */}
    {children}
  </div>
));

registerComponent("FileTree", ({ path, onSelect, ...rest }) => (
  <div {...rest}>
    {/* TODO: Implement file tree */}
    FileTree: {path}
  </div>
));

// ============================================================================
// Style Helpers
// ============================================================================

function mapAlign(align?: string): string | undefined {
  const map: Record<string, string> = {
    start: "flex-start",
    center: "center",
    end: "flex-end",
    stretch: "stretch",
  };
  return align ? map[align] : undefined;
}

function mapJustify(justify?: string): string | undefined {
  const map: Record<string, string> = {
    start: "flex-start",
    center: "center",
    end: "flex-end",
    between: "space-between",
    around: "space-around",
  };
  return justify ? map[justify] : undefined;
}

function mapFontSize(size?: string): string | undefined {
  const map: Record<string, string> = {
    xs: "10px",
    sm: "12px",
    base: "14px",
    lg: "16px",
    xl: "20px",
    "2xl": "24px",
    "3xl": "30px",
    "4xl": "36px",
  };
  return size ? map[size] : undefined;
}

function mapFontWeight(weight?: string): number | undefined {
  const map: Record<string, number> = {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  };
  return weight ? map[weight] : undefined;
}

// ============================================================================
// Main Renderer
// ============================================================================

/**
 * Render a component node tree
 */
function renderNode(
  node: UIChild,
  onAction: (action: string, args?: unknown) => void,
  index?: number
): ReactNode {
  // Primitives
  if (typeof node === "string" || typeof node === "number") {
    return node;
  }

  if (node === null || node === undefined || node === false || node === true) {
    return null;
  }

  // Component node
  if (typeof node === "object" && "$" in node && node.$ === "component") {
    const Component = componentRegistry[node.type];

    if (!Component) {
      return (
        <div
          key={node.key ?? index}
          style={{
            padding: 8,
            backgroundColor: "#fff3cd",
            color: "#856404",
            borderRadius: 4,
          }}
        >
          Unknown component: {node.type}
        </div>
      );
    }

    // Transform props - convert action descriptors to handlers
    const transformedProps: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node.props)) {
      if (isActionDescriptor(value)) {
        // Convert action descriptor to onClick/onChange handler
        if (key === "onPress") {
          transformedProps.onClick = () => onAction(value.$action, value.args);
        } else if (key === "onChangeText") {
          transformedProps.onChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
            onAction(value.$action, e.target.value);
        } else if (key === "onChange") {
          transformedProps.onChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
            const target = e.target;
            const newValue = target.type === "checkbox" ? (target as HTMLInputElement).checked : target.value;
            onAction(value.$action, newValue);
          };
        } else {
          transformedProps[key] = () => onAction(value.$action, value.args);
        }
      } else {
        transformedProps[key] = value;
      }
    }

    // Render children
    const children = node.children?.map((child, i) => renderNode(child, onAction, i));

    return (
      <Component key={node.key ?? index} {...transformedProps}>
        {children}
      </Component>
    );
  }

  return null;
}

function isActionDescriptor(value: unknown): value is ActionDescriptor {
  return (
    typeof value === "object" &&
    value !== null &&
    "$action" in value &&
    typeof (value as ActionDescriptor).$action === "string"
  );
}

/**
 * SDR Renderer Component
 *
 * Takes a server-generated component tree and renders it as React components.
 */
export function SDRRenderer({ tree, onAction, state }: SDRRendererProps): ReactNode {
  if (!tree) {
    return null;
  }

  return renderNode(tree, onAction);
}

/**
 * Unknown component fallback
 */
function UnknownComponent({ type }: { type: string }): ReactNode {
  return (
    <div
      style={{
        padding: 8,
        backgroundColor: "#fff3cd",
        color: "#856404",
        borderRadius: 4,
        margin: 4,
      }}
    >
      Unknown component: {type}
    </div>
  );
}

export default SDRRenderer;
