/**
 * @iris/ui - Component Functions
 *
 * Server-side component functions that return SDR component nodes.
 * These are called by the app's ui() function to build the UI tree.
 *
 * Usage:
 * ```typescript
 * import { Stack, Text, Button } from '@iris/ui';
 *
 * ui: (ctx) => Stack({ padding: 16 }, [
 *   Text({ size: 'lg' }, 'Hello World'),
 *   Button({ onPress: () => ctx.runTool('greet') }, 'Greet'),
 * ])
 * ```
 */

import type { ComponentNode, UIChild, PropValue, ActionDescriptor } from "../../../src/apps/types.ts";

// ============================================================================
// Component Builder Helper
// ============================================================================

function component(
  type: string,
  props: Record<string, PropValue> = {},
  children?: UIChild[]
): ComponentNode {
  return {
    $: "component",
    type,
    props,
    children,
  };
}

// Helper to handle children that can be a single item or array
function normalizeChildren(children?: UIChild | UIChild[]): UIChild[] | undefined {
  if (children === undefined || children === null) return undefined;
  if (Array.isArray(children)) return children;
  return [children];
}

// ============================================================================
// Layout Components
// ============================================================================

export interface StackProps {
  gap?: number;
  padding?: number;
  paddingX?: number;
  paddingY?: number;
  align?: "start" | "center" | "end" | "stretch";
  justify?: "start" | "center" | "end" | "between" | "around";
  flex?: number;
  key?: string;
}

/**
 * Vertical stack layout
 */
export function Stack(props: StackProps, children?: UIChild | UIChild[]): ComponentNode {
  return component("Stack", props as Record<string, PropValue>, normalizeChildren(children));
}

export interface RowProps {
  gap?: number;
  padding?: number;
  paddingX?: number;
  paddingY?: number;
  align?: "start" | "center" | "end" | "stretch";
  justify?: "start" | "center" | "end" | "between" | "around";
  wrap?: boolean;
  flex?: number;
  key?: string;
}

/**
 * Horizontal row layout
 */
export function Row(props: RowProps, children?: UIChild | UIChild[]): ComponentNode {
  return component("Row", props as Record<string, PropValue>, normalizeChildren(children));
}

export interface BoxProps {
  padding?: number;
  paddingX?: number;
  paddingY?: number;
  margin?: number;
  marginX?: number;
  marginY?: number;
  flex?: number;
  width?: number | string;
  height?: number | string;
  backgroundColor?: string;
  borderRadius?: number;
  border?: string;
  key?: string;
}

/**
 * Generic container box
 */
export function Box(props: BoxProps, children?: UIChild | UIChild[]): ComponentNode {
  return component("Box", props as Record<string, PropValue>, normalizeChildren(children));
}

export interface ScrollViewProps {
  horizontal?: boolean;
  flex?: number;
  key?: string;
}

/**
 * Scrollable container
 */
export function ScrollView(props: ScrollViewProps, children?: UIChild | UIChild[]): ComponentNode {
  return component("ScrollView", props as Record<string, PropValue>, normalizeChildren(children));
}

/**
 * Visual divider line
 */
export function Divider(props: { margin?: number; key?: string } = {}): ComponentNode {
  return component("Divider", props);
}

// ============================================================================
// Typography Components
// ============================================================================

export interface TextProps {
  size?: "xs" | "sm" | "base" | "lg" | "xl" | "2xl" | "3xl" | "4xl";
  weight?: "normal" | "medium" | "semibold" | "bold";
  color?: string;
  align?: "left" | "center" | "right";
  italic?: boolean;
  mono?: boolean;
  key?: string;
}

/**
 * Text content
 */
export function Text(props: TextProps, children?: UIChild | UIChild[]): ComponentNode {
  return component("Text", props as Record<string, PropValue>, normalizeChildren(children));
}

export interface HeadingProps {
  level?: 1 | 2 | 3 | 4 | 5 | 6;
  color?: string;
  key?: string;
}

/**
 * Heading text (h1-h6)
 */
export function Heading(props: HeadingProps, children?: UIChild | UIChild[]): ComponentNode {
  return component("Heading", props as Record<string, PropValue>, normalizeChildren(children));
}

export interface CodeProps {
  language?: string;
  inline?: boolean;
  key?: string;
}

/**
 * Code display (inline or block)
 */
export function Code(props: CodeProps, children?: UIChild | UIChild[]): ComponentNode {
  return component("Code", props as Record<string, PropValue>, normalizeChildren(children));
}

export interface LinkProps {
  href: string;
  external?: boolean;
  key?: string;
}

/**
 * Hyperlink
 */
export function Link(props: LinkProps, children?: UIChild | UIChild[]): ComponentNode {
  return component("Link", props as Record<string, PropValue>, normalizeChildren(children));
}

// ============================================================================
// Form Components
// ============================================================================

export interface ButtonProps {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  loading?: boolean;
  onPress?: ActionDescriptor | (() => void);
  key?: string;
}

/**
 * Clickable button
 */
export function Button(props: ButtonProps, children?: UIChild | UIChild[]): ComponentNode {
  // Convert function to action descriptor if needed
  const resolvedProps = { ...props };
  if (typeof props.onPress === "function") {
    // This will be serialized; the actual function can't be sent
    // The runtime handles this case specially
    resolvedProps.onPress = { $action: "__callback__" } as ActionDescriptor;
  }
  return component("Button", resolvedProps as Record<string, PropValue>, normalizeChildren(children));
}

export interface InputProps {
  value?: string;
  placeholder?: string;
  type?: "text" | "password" | "email" | "number" | "search";
  disabled?: boolean;
  multiline?: boolean;
  rows?: number;
  onChangeText?: ActionDescriptor | ((text: string) => void);
  onSubmit?: ActionDescriptor | (() => void);
  key?: string;
}

/**
 * Text input field
 */
export function Input(props: InputProps): ComponentNode {
  return component("Input", props as Record<string, PropValue>);
}

export interface TextAreaProps {
  value?: string;
  placeholder?: string;
  disabled?: boolean;
  rows?: number;
  onChangeText?: ActionDescriptor | ((text: string) => void);
  key?: string;
}

/**
 * Multi-line text input
 */
export function TextArea(props: TextAreaProps): ComponentNode {
  return component("TextArea", props as Record<string, PropValue>);
}

export interface SelectProps {
  value?: string;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
  disabled?: boolean;
  onChange?: ActionDescriptor | ((value: string) => void);
  key?: string;
}

/**
 * Dropdown select
 */
export function Select(props: SelectProps): ComponentNode {
  return component("Select", props as Record<string, PropValue>);
}

export interface CheckboxProps {
  checked?: boolean;
  label?: string;
  disabled?: boolean;
  onChange?: ActionDescriptor | ((checked: boolean) => void);
  key?: string;
}

/**
 * Checkbox input
 */
export function Checkbox(props: CheckboxProps): ComponentNode {
  return component("Checkbox", props as Record<string, PropValue>);
}

export interface SwitchProps {
  value?: boolean;
  disabled?: boolean;
  onChange?: ActionDescriptor | ((value: boolean) => void);
  key?: string;
}

/**
 * Toggle switch
 */
export function Switch(props: SwitchProps): ComponentNode {
  return component("Switch", props as Record<string, PropValue>);
}

// ============================================================================
// Data Display Components
// ============================================================================

export interface DataTableProps {
  data: Array<Record<string, unknown>>;
  columns?: Array<{
    key: string;
    label: string;
    width?: number | string;
  }>;
  onRowPress?: ActionDescriptor | ((row: Record<string, unknown>) => void);
  key?: string;
}

/**
 * Data table for displaying tabular data
 */
export function DataTable(props: DataTableProps): ComponentNode {
  return component("DataTable", props as Record<string, PropValue>);
}

export interface ListProps {
  data: unknown[];
  renderItem: (item: unknown, index: number) => ComponentNode;
  keyExtractor?: (item: unknown, index: number) => string;
  key?: string;
}

/**
 * List component for rendering arrays
 */
export function List(props: ListProps): ComponentNode {
  // Pre-render items server-side
  const children = props.data.map((item, index) => {
    const node = props.renderItem(item, index);
    node.key = props.keyExtractor?.(item, index) ?? String(index);
    return node;
  });

  return component("List", { key: props.key }, children);
}

export interface CardProps {
  padding?: number;
  elevation?: number;
  onPress?: ActionDescriptor | (() => void);
  key?: string;
}

/**
 * Card container with elevation
 */
export function Card(props: CardProps, children?: UIChild | UIChild[]): ComponentNode {
  return component("Card", props as Record<string, PropValue>, normalizeChildren(children));
}

export interface BadgeProps {
  variant?: "default" | "success" | "warning" | "error" | "info";
  key?: string;
}

/**
 * Small badge/tag
 */
export function Badge(props: BadgeProps, children?: UIChild | UIChild[]): ComponentNode {
  return component("Badge", props as Record<string, PropValue>, normalizeChildren(children));
}

export interface AvatarProps {
  src?: string;
  name?: string;
  size?: "sm" | "md" | "lg";
  key?: string;
}

/**
 * User avatar
 */
export function Avatar(props: AvatarProps): ComponentNode {
  return component("Avatar", props as Record<string, PropValue>);
}

// ============================================================================
// Feedback Components
// ============================================================================

export interface AlertProps {
  variant?: "info" | "success" | "warning" | "error";
  title?: string;
  dismissible?: boolean;
  onDismiss?: ActionDescriptor | (() => void);
  key?: string;
}

/**
 * Alert message box
 */
export function Alert(props: AlertProps, children?: UIChild | UIChild[]): ComponentNode {
  return component("Alert", props as Record<string, PropValue>, normalizeChildren(children));
}

export interface SpinnerProps {
  size?: "sm" | "md" | "lg";
  key?: string;
}

/**
 * Loading spinner
 */
export function Spinner(props: SpinnerProps = {}): ComponentNode {
  return component("Spinner", props);
}

export interface ProgressProps {
  value: number; // 0-100
  showLabel?: boolean;
  key?: string;
}

/**
 * Progress bar
 */
export function Progress(props: ProgressProps): ComponentNode {
  return component("Progress", props as Record<string, PropValue>);
}

// ============================================================================
// Specialized Components
// ============================================================================

export interface CodeEditorProps {
  value?: string;
  language?: string;
  readOnly?: boolean;
  lineNumbers?: boolean;
  onChange?: ActionDescriptor | ((value: string) => void);
  key?: string;
}

/**
 * Code editor component
 */
export function CodeEditor(props: CodeEditorProps): ComponentNode {
  return component("CodeEditor", props as Record<string, PropValue>);
}

export interface TerminalProps {
  processId?: string;
  readOnly?: boolean;
  key?: string;
}

/**
 * Terminal emulator display
 */
export function Terminal(props: TerminalProps): ComponentNode {
  return component("Terminal", props as Record<string, PropValue>);
}

export interface MarkdownProps {
  key?: string;
}

/**
 * Markdown renderer
 */
export function Markdown(props: MarkdownProps, children?: UIChild | UIChild[]): ComponentNode {
  return component("Markdown", props as Record<string, PropValue>, normalizeChildren(children));
}

export interface FileTreeProps {
  path: string;
  onSelect?: ActionDescriptor | ((path: string) => void);
  key?: string;
}

/**
 * File tree browser
 */
export function FileTree(props: FileTreeProps): ComponentNode {
  return component("FileTree", props as Record<string, PropValue>);
}

// ============================================================================
// Conditional & Utility
// ============================================================================

/**
 * Conditional rendering helper
 */
export function Show(
  condition: boolean,
  children: UIChild | UIChild[]
): UIChild[] | null {
  return condition ? normalizeChildren(children) ?? null : null;
}

/**
 * Fragment for grouping without wrapper
 */
export function Fragment(children: UIChild | UIChild[]): UIChild[] {
  return normalizeChildren(children) ?? [];
}
