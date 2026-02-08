# File Management

## Overview

Botical provides file management through agent tools that operate on the local filesystem within the project directory. File operations are:
- Scoped to the project directory (no path traversal)
- Executed through the tool system
- Integrated with the agent workflow

## File Tools

File operations are exposed as tools available to agents. These are implemented in Phase 2 (Agent Core).

### Read Tool

Reads file contents with optional line limits:

```typescript
// src/tools/read.ts
const readTool = defineTool('read', {
  description: 'Read a file from the project',
  parameters: z.object({
    path: z.string().describe('File path relative to project root'),
    offset: z.number().optional().describe('Line offset to start from'),
    limit: z.number().optional().describe('Maximum lines to read'),
  }),
  execute: async (args, context) => {
    const fullPath = resolvePath(context.projectPath, args.path);
    const content = await fs.readFile(fullPath, 'utf-8');

    // Apply line limits if specified
    const lines = content.split('\n');
    const start = args.offset ?? 0;
    const end = args.limit ? start + args.limit : lines.length;
    const selectedLines = lines.slice(start, end);

    return {
      title: `Read ${args.path}`,
      output: selectedLines.join('\n'),
      success: true,
    };
  },
});
```

### Write Tool

Writes content to a file, creating directories as needed:

```typescript
// src/tools/write.ts
const writeTool = defineTool('write', {
  description: 'Write content to a file',
  parameters: z.object({
    path: z.string().describe('File path relative to project root'),
    content: z.string().describe('Content to write'),
  }),
  execute: async (args, context) => {
    const fullPath = resolvePath(context.projectPath, args.path);

    // Create parent directories if needed
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, args.content, 'utf-8');

    return {
      title: `Wrote ${args.path}`,
      output: `Successfully wrote ${args.content.length} characters`,
      success: true,
    };
  },
});
```

### Edit Tool

Performs search-and-replace edits on files:

```typescript
// src/tools/edit.ts
const editTool = defineTool('edit', {
  description: 'Edit a file by replacing text',
  parameters: z.object({
    path: z.string().describe('File path relative to project root'),
    oldText: z.string().describe('Text to find and replace'),
    newText: z.string().describe('Replacement text'),
  }),
  execute: async (args, context) => {
    const fullPath = resolvePath(context.projectPath, args.path);
    const content = await fs.readFile(fullPath, 'utf-8');

    if (!content.includes(args.oldText)) {
      return {
        title: `Edit ${args.path}`,
        output: 'Old text not found in file',
        success: false,
      };
    }

    const newContent = content.replace(args.oldText, args.newText);
    await fs.writeFile(fullPath, newContent, 'utf-8');

    return {
      title: `Edited ${args.path}`,
      output: 'Successfully replaced text',
      success: true,
    };
  },
});
```

### Glob Tool

Finds files matching a pattern:

```typescript
// src/tools/glob.ts
const globTool = defineTool('glob', {
  description: 'Find files matching a glob pattern',
  parameters: z.object({
    pattern: z.string().describe('Glob pattern (e.g., "**/*.ts")'),
  }),
  execute: async (args, context) => {
    const matches = await glob(args.pattern, {
      cwd: context.projectPath,
      ignore: ['node_modules/**', '.git/**', 'dist/**'],
    });

    return {
      title: `Glob: ${args.pattern}`,
      output: matches.join('\n'),
      success: true,
    };
  },
});
```

### Grep Tool

Searches file contents:

```typescript
// src/tools/grep.ts
const grepTool = defineTool('grep', {
  description: 'Search for text in files',
  parameters: z.object({
    pattern: z.string().describe('Search pattern (regex)'),
    path: z.string().optional().describe('Directory to search'),
  }),
  execute: async (args, context) => {
    const searchPath = args.path
      ? resolvePath(context.projectPath, args.path)
      : context.projectPath;

    // Use ripgrep or similar for efficient search
    const results = await searchFiles(searchPath, args.pattern);

    return {
      title: `Grep: ${args.pattern}`,
      output: formatGrepResults(results),
      success: true,
    };
  },
});
```

### Bash Tool

Executes shell commands:

```typescript
// src/tools/bash.ts
const bashTool = defineTool('bash', {
  description: 'Execute a bash command',
  parameters: z.object({
    command: z.string().describe('Command to execute'),
    cwd: z.string().optional().describe('Working directory'),
  }),
  execute: async (args, context) => {
    const workingDir = args.cwd
      ? resolvePath(context.projectPath, args.cwd)
      : context.projectPath;

    const result = await exec(args.command, {
      cwd: workingDir,
      timeout: 30000,
    });

    return {
      title: `$ ${args.command}`,
      output: result.stdout + result.stderr,
      success: result.exitCode === 0,
    };
  },
});
```

## Path Security

All file operations validate paths to prevent directory traversal:

```typescript
// src/utils/path.ts
export function resolvePath(projectPath: string, relativePath: string): string {
  const resolved = path.resolve(projectPath, relativePath);

  // Ensure resolved path is within project
  if (!resolved.startsWith(projectPath)) {
    throw new ValidationError('Path traversal not allowed');
  }

  return resolved;
}
```

## File Events

File changes are broadcast via the event bus:

```typescript
// After any file write/edit
EventBus.publish(projectId, {
  type: 'file.updated',
  payload: {
    path: relativePath,
    sessionId: context.sessionId,
  },
});
```

This allows connected clients to refresh file views when agents modify files.

## Integration with Git

For git-based projects, agents can use the bash tool to run git commands:

```typescript
// Example: Agent commits changes
await bashTool.execute({
  command: 'git add . && git commit -m "Updated configuration"',
}, context);
```

Git operations are treated like any other shell command - no special git integration is needed.
