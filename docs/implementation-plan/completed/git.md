# Phase 12: Git Integration ✅ COMPLETE

**Goal**: First-class git operations via API with Iris SSH identity

**Status**: Complete - SSH identity, full git operations, WebSocket events

## Overview

Every Iris project is a git repository. This phase adds git operations (status, branch, commit, push/pull) via API, enabling both the UI and agents to perform version control operations.

**Key Decision**: Iris has its own SSH identity. Users add the Iris public key to GitHub/GitLab to grant push access.

---

## Backend

### Dependencies

```json
{
  "dependencies": {
    "simple-git": "^3.22.0"
  }
}
```

### Iris SSH Identity

On first run, Iris generates an SSH keypair:

```typescript
// src/services/identity.ts
import { generateKeyPairSync } from 'crypto'
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

const IRIS_DIR = join(homedir(), '.iris')
const PRIVATE_KEY_PATH = join(IRIS_DIR, 'id_ed25519')
const PUBLIC_KEY_PATH = join(IRIS_DIR, 'id_ed25519.pub')

export function ensureIdentity(): void {
  if (!existsSync(IRIS_DIR)) {
    mkdirSync(IRIS_DIR, { recursive: true })
  }

  if (!existsSync(PRIVATE_KEY_PATH)) {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519', {
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    })

    // Convert to OpenSSH format
    const sshPublicKey = convertToOpenSSH(publicKey)

    writeFileSync(PRIVATE_KEY_PATH, privateKey, { mode: 0o600 })
    writeFileSync(PUBLIC_KEY_PATH, sshPublicKey, { mode: 0o644 })
  }
}

export function getPublicKey(): string {
  return readFileSync(PUBLIC_KEY_PATH, 'utf-8').trim()
}

export function getPrivateKeyPath(): string {
  return PRIVATE_KEY_PATH
}
```

Configure git to use Iris identity:

```typescript
// When performing git operations
const git = simpleGit(projectPath, {
  config: [
    `core.sshCommand=ssh -i ${getPrivateKeyPath()} -o StrictHostKeyChecking=accept-new`,
  ],
})
```

### GitService

Create `src/services/git.ts`:

```typescript
import simpleGit, { SimpleGit, StatusResult, BranchSummary, LogResult } from 'simple-git'

interface GitService {
  // Status
  status(projectId: string): Promise<GitStatus>

  // Branches
  listBranches(projectId: string): Promise<BranchInfo[]>
  currentBranch(projectId: string): Promise<string>
  createBranch(projectId: string, name: string, from?: string): Promise<void>
  switchBranch(projectId: string, name: string): Promise<void>
  deleteBranch(projectId: string, name: string, force?: boolean): Promise<void>

  // Staging
  stage(projectId: string, paths: string[]): Promise<void>
  stageAll(projectId: string): Promise<void>
  unstage(projectId: string, paths: string[]): Promise<void>
  unstageAll(projectId: string): Promise<void>

  // Commits
  commit(projectId: string, message: string): Promise<CommitResult>
  log(projectId: string, options?: LogOptions): Promise<CommitInfo[]>

  // Diff
  diff(projectId: string, options?: DiffOptions): Promise<string>
  diffFile(projectId: string, path: string): Promise<string>
  diffStaged(projectId: string): Promise<string>

  // Remotes
  listRemotes(projectId: string): Promise<RemoteInfo[]>
  fetch(projectId: string, remote?: string): Promise<void>
  pull(projectId: string, remote?: string, branch?: string): Promise<PullResult>
  push(projectId: string, remote?: string, branch?: string, options?: PushOptions): Promise<void>

  // Stash
  stashList(projectId: string): Promise<StashInfo[]>
  stashPush(projectId: string, message?: string): Promise<void>
  stashPop(projectId: string, index?: number): Promise<void>
  stashDrop(projectId: string, index?: number): Promise<void>

  // Identity
  getIdentity(): Promise<{ publicKey: string; fingerprint: string }>
}

// Iris commits with recognizable signature
const IRIS_AUTHOR = {
  name: 'Iris',
  email: 'iris@iris-agent.dev',  // Configurable via env
}
```

### Types

```typescript
interface GitStatus {
  branch: string
  ahead: number
  behind: number
  staged: FileChange[]
  unstaged: FileChange[]
  untracked: string[]
  conflicted: string[]
}

interface FileChange {
  path: string
  status: 'M' | 'A' | 'D' | 'R' | 'C' | '?'  // Modified, Added, Deleted, Renamed, Copied, Untracked
  oldPath?: string  // For renames
}

interface BranchInfo {
  name: string
  current: boolean
  commit: string
  remote?: string
  ahead?: number
  behind?: number
}

interface CommitInfo {
  hash: string
  hashShort: string
  author: string
  email: string
  date: string
  message: string
  body?: string
}

interface CommitResult {
  hash: string
  branch: string
  author: string
  summary: {
    changes: number
    insertions: number
    deletions: number
  }
}

interface PullResult {
  files: string[]
  insertions: number
  deletions: number
  summary: {
    changes: number
    insertions: number
    deletions: number
  }
}
```

### Implementation Example

```typescript
class GitServiceImpl implements GitService {
  private getGit(projectPath: string): SimpleGit {
    return simpleGit(projectPath, {
      config: [
        `core.sshCommand=ssh -i ${getPrivateKeyPath()} -o StrictHostKeyChecking=accept-new`,
        `user.name=${IRIS_AUTHOR.name}`,
        `user.email=${IRIS_AUTHOR.email}`,
      ],
    })
  }

  async status(projectId: string): Promise<GitStatus> {
    const project = await projectService.get(projectId)
    const git = this.getGit(project.path)
    const status = await git.status()

    return {
      branch: status.current || 'HEAD',
      ahead: status.ahead,
      behind: status.behind,
      staged: status.staged.map(f => ({ path: f, status: 'M' })),
      unstaged: status.modified.map(f => ({ path: f, status: 'M' })),
      untracked: status.not_added,
      conflicted: status.conflicted,
    }
  }

  async commit(projectId: string, message: string): Promise<CommitResult> {
    const project = await projectService.get(projectId)
    const git = this.getGit(project.path)

    const result = await git.commit(message, {
      '--author': `${IRIS_AUTHOR.name} <${IRIS_AUTHOR.email}>`,
    })

    // Emit event
    bus.emit('git.commit.created', {
      projectId,
      hash: result.commit,
      message,
    })

    return {
      hash: result.commit,
      branch: result.branch,
      author: IRIS_AUTHOR.name,
      summary: result.summary,
    }
  }

  async push(projectId: string, remote = 'origin', branch?: string): Promise<void> {
    const project = await projectService.get(projectId)
    const git = this.getGit(project.path)

    const currentBranch = branch || (await git.branch()).current
    await git.push(remote, currentBranch)

    bus.emit('git.pushed', { projectId, remote, branch: currentBranch })
  }
}
```

### REST Routes

Create `src/server/routes/git.ts`:

```
# Status
GET    /api/projects/:projectId/git/status         Get working tree status

# Branches
GET    /api/projects/:projectId/git/branches       List branches
POST   /api/projects/:projectId/git/branches       Create branch
POST   /api/projects/:projectId/git/checkout       Switch branch
DELETE /api/projects/:projectId/git/branches/:name Delete branch

# Staging
POST   /api/projects/:projectId/git/stage          Stage files (body: { paths: string[] })
POST   /api/projects/:projectId/git/stage-all      Stage all changes
POST   /api/projects/:projectId/git/unstage        Unstage files (body: { paths: string[] })
POST   /api/projects/:projectId/git/unstage-all    Unstage all

# Commits
POST   /api/projects/:projectId/git/commit         Create commit (body: { message: string })
GET    /api/projects/:projectId/git/log            Get commit history

# Diff
GET    /api/projects/:projectId/git/diff           Get diff (query: ?staged=true, ?file=path)

# Remotes
GET    /api/projects/:projectId/git/remotes        List remotes
POST   /api/projects/:projectId/git/fetch          Fetch from remote
POST   /api/projects/:projectId/git/pull           Pull from remote
POST   /api/projects/:projectId/git/push           Push to remote

# Stash
GET    /api/projects/:projectId/git/stash          List stashes
POST   /api/projects/:projectId/git/stash          Create stash
POST   /api/projects/:projectId/git/stash/pop      Pop stash
DELETE /api/projects/:projectId/git/stash/:index   Drop stash

# Identity
GET    /api/git/identity                           Get Iris SSH public key
```

### WebSocket Events

```typescript
// Server → Client Events
| { type: 'git.status.changed'; payload: { projectId: string; status: GitStatus } }
| { type: 'git.branch.switched'; payload: { projectId: string; branch: string } }
| { type: 'git.commit.created'; payload: { projectId: string; hash: string; message: string } }
| { type: 'git.pushed'; payload: { projectId: string; remote: string; branch: string } }
| { type: 'git.pulled'; payload: { projectId: string; result: PullResult } }
```

---

## Frontend

### API Queries

```typescript
export function useGitStatus(projectId: string) {
  return useQuery({
    queryKey: ['projects', projectId, 'git', 'status'],
    queryFn: () => apiClient<GitStatus>(`/api/projects/${projectId}/git/status`),
    refetchInterval: 5000,  // Poll every 5 seconds
  })
}

export function useGitBranches(projectId: string) {
  return useQuery({
    queryKey: ['projects', projectId, 'git', 'branches'],
    queryFn: () => apiClient<BranchInfo[]>(`/api/projects/${projectId}/git/branches`),
  })
}

export function useGitLog(projectId: string, options?: { limit?: number }) {
  return useQuery({
    queryKey: ['projects', projectId, 'git', 'log', options],
    queryFn: () => apiClient<CommitInfo[]>(
      `/api/projects/${projectId}/git/log?limit=${options?.limit || 50}`
    ),
  })
}

export function useGitDiff(projectId: string, options?: { staged?: boolean; file?: string }) {
  return useQuery({
    queryKey: ['projects', projectId, 'git', 'diff', options],
    queryFn: () => apiClient<string>(
      `/api/projects/${projectId}/git/diff?${new URLSearchParams(options as any)}`
    ),
  })
}

export function useIrisIdentity() {
  return useQuery({
    queryKey: ['git', 'identity'],
    queryFn: () => apiClient<{ publicKey: string; fingerprint: string }>('/api/git/identity'),
  })
}

// Mutations
export function useGitStage() {
  return useMutation({
    mutationFn: ({ projectId, paths }: { projectId: string; paths: string[] }) =>
      apiClient(`/api/projects/${projectId}/git/stage`, {
        method: 'POST',
        body: JSON.stringify({ paths }),
      }),
  })
}

export function useGitCommit() {
  return useMutation({
    mutationFn: ({ projectId, message }: { projectId: string; message: string }) =>
      apiClient<CommitResult>(`/api/projects/${projectId}/git/commit`, {
        method: 'POST',
        body: JSON.stringify({ message }),
      }),
  })
}

export function useGitPush() {
  return useMutation({
    mutationFn: ({ projectId, remote, branch }: { projectId: string; remote?: string; branch?: string }) =>
      apiClient(`/api/projects/${projectId}/git/push`, {
        method: 'POST',
        body: JSON.stringify({ remote, branch }),
      }),
  })
}

export function useGitPull() {
  return useMutation({
    mutationFn: ({ projectId }: { projectId: string }) =>
      apiClient<PullResult>(`/api/projects/${projectId}/git/pull`, {
        method: 'POST',
      }),
  })
}
```

---

## Testing

### Unit Tests

```
tests/unit/services/git.test.ts            50+ tests
├── status() - returns correct status
├── listBranches() - lists local and remote
├── createBranch() - creates new branch
├── switchBranch() - checks out branch
├── deleteBranch() - deletes branch
├── stage() / unstage() - staging operations
├── commit() - creates commit with Iris author
├── log() - returns commit history
├── diff() - returns diff output
├── fetch() / pull() / push() - remote operations
├── stash operations
├── getIdentity() - returns public key
└── error handling

tests/unit/services/identity.test.ts       15+ tests
├── ensureIdentity() - creates keys if missing
├── ensureIdentity() - reuses existing keys
├── getPublicKey() - returns public key
├── getPrivateKeyPath() - returns path
└── key format validation

tests/unit/server/routes/git.test.ts       35+ tests
├── GET /projects/:id/git/status
├── GET /projects/:id/git/branches
├── POST /projects/:id/git/branches
├── POST /projects/:id/git/checkout
├── POST /projects/:id/git/stage
├── POST /projects/:id/git/commit
├── GET /projects/:id/git/log
├── GET /projects/:id/git/diff
├── POST /projects/:id/git/push
├── POST /projects/:id/git/pull
├── GET /api/git/identity
└── error handling
```

### Integration Tests

```
tests/integration/git-operations.test.ts
├── Full workflow: modify → stage → commit → push
├── Branch operations: create → switch → merge → delete
├── Conflict handling
├── Stash operations
├── Multiple remotes
├── SSH authentication works
└── WebSocket events broadcast
```

**Note**: Integration tests use a temporary git repo with a local "remote" for push/pull testing.

---

## Validation Criteria

- [ ] Git status correctly reports working tree state
- [ ] Branch operations work (create, switch, delete)
- [ ] Staging/unstaging works correctly
- [ ] Commits created with Iris author signature
- [ ] Commit history retrieved correctly
- [ ] Diff output returned for staged/unstaged changes
- [ ] Push/pull work with Iris SSH identity
- [ ] Stash operations work
- [ ] Identity API returns public key for user to add to GitHub
- [ ] WebSocket events broadcast for git operations
- [ ] All 100+ tests pass

**Deliverable**: Complete git operations via API with SSH authentication
