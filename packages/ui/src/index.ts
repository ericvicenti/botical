/**
 * @iris/ui
 *
 * Cross-platform component library for Iris Apps.
 * These functions return SDR component nodes that are rendered
 * by the Iris runtime on both web and mobile.
 *
 * @example
 * ```typescript
 * import { Stack, Text, Button, Input } from '@iris/ui';
 *
 * Stack({ padding: 16, gap: 12 }, [
 *   Text({ size: 'lg' }, 'Hello World'),
 *   Input({ placeholder: 'Enter text...' }),
 *   Button({ variant: 'primary' }, 'Submit'),
 * ])
 * ```
 */

// Layout components
export { Stack, Row, Box, ScrollView, Divider } from "./components.ts";
export type { StackProps, RowProps, BoxProps, ScrollViewProps } from "./components.ts";

// Typography components
export { Text, Heading, Code, Link } from "./components.ts";
export type { TextProps, HeadingProps, CodeProps, LinkProps } from "./components.ts";

// Form components
export { Button, Input, TextArea, Select, Checkbox, Switch } from "./components.ts";
export type {
  ButtonProps,
  InputProps,
  TextAreaProps,
  SelectProps,
  CheckboxProps,
  SwitchProps,
} from "./components.ts";

// Data display components
export { DataTable, List, Card, Badge, Avatar } from "./components.ts";
export type {
  DataTableProps,
  ListProps,
  CardProps,
  BadgeProps,
  AvatarProps,
} from "./components.ts";

// Feedback components
export { Alert, Spinner, Progress } from "./components.ts";
export type { AlertProps, SpinnerProps, ProgressProps } from "./components.ts";

// Specialized components
export { CodeEditor, Terminal, Markdown, FileTree } from "./components.ts";
export type {
  CodeEditorProps,
  TerminalProps,
  MarkdownProps,
  FileTreeProps,
} from "./components.ts";

// Utility components
export { Show, Fragment } from "./components.ts";
