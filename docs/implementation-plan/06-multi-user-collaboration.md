# Multi-User Collaboration

## Overview

Iris supports multiple users working on the same project with:
- Real-time presence awareness
- Session sharing and collaborative viewing
- Role-based access control
- Concurrent editing coordination

## Authentication System

### Auth Service

```typescript
// src/auth/service.ts
import { z } from 'zod';
import { sign, verify } from './jwt';
import { hash, compare } from 'bcrypt';
import { DatabaseManager } from '../database';

export const AuthCredentials = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const AuthToken = z.object({
  sub: z.string(),          // User ID
  email: z.string(),
  username: z.string(),
  iat: z.number(),
  exp: z.number(),
});

export class AuthService {
  // Register new user
  static async register(input: {
    email: string;
    username: string;
    password: string;
  }): Promise<User> {
    const rootDb = DatabaseManager.getRootDb();

    // Check for existing user
    const existing = rootDb.prepare(
      'SELECT id FROM users WHERE email = ? OR username = ?'
    ).get(input.email, input.username);

    if (existing) {
      throw new ConflictError('User already exists');
    }

    const id = generateId('user');
    const passwordHash = await hash(input.password, 12);

    rootDb.prepare(`
      INSERT INTO users (id, email, username, password_hash, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, input.email, input.username, passwordHash, Date.now(), Date.now());

    return this.getUser(id)!;
  }

  // Login with email/password
  static async login(input: z.infer<typeof AuthCredentials>): Promise<AuthResult> {
    const rootDb = DatabaseManager.getRootDb();

    const user = rootDb.prepare(
      'SELECT * FROM users WHERE email = ?'
    ).get(input.email);

    if (!user || !user.password_hash) {
      throw new AuthError('Invalid credentials');
    }

    const valid = await compare(input.password, user.password_hash);
    if (!valid) {
      throw new AuthError('Invalid credentials');
    }

    // Update last login
    rootDb.prepare(
      'UPDATE users SET last_login_at = ? WHERE id = ?'
    ).run(Date.now(), user.id);

    const token = await this.createToken(user);

    return {
      user: this.toUser(user),
      token,
    };
  }

  // OAuth login/registration
  static async oauthLogin(input: {
    provider: 'github' | 'google';
    providerId: string;
    email: string;
    username: string;
    avatar?: string;
  }): Promise<AuthResult> {
    const rootDb = DatabaseManager.getRootDb();

    // Find existing OAuth user
    let user = rootDb.prepare(
      'SELECT * FROM users WHERE oauth_provider = ? AND oauth_id = ?'
    ).get(input.provider, input.providerId);

    if (!user) {
      // Check if email already registered
      user = rootDb.prepare(
        'SELECT * FROM users WHERE email = ?'
      ).get(input.email);

      if (user) {
        // Link OAuth to existing account
        rootDb.prepare(`
          UPDATE users SET oauth_provider = ?, oauth_id = ?, updated_at = ?
          WHERE id = ?
        `).run(input.provider, input.providerId, Date.now(), user.id);
      } else {
        // Create new user
        const id = generateId('user');
        rootDb.prepare(`
          INSERT INTO users (id, email, username, oauth_provider, oauth_id, avatar_url, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, input.email, input.username, input.provider, input.providerId, input.avatar, Date.now(), Date.now());

        user = rootDb.prepare('SELECT * FROM users WHERE id = ?').get(id);
      }
    }

    // Update last login
    rootDb.prepare(
      'UPDATE users SET last_login_at = ? WHERE id = ?'
    ).run(Date.now(), user.id);

    const token = await this.createToken(user);

    return {
      user: this.toUser(user),
      token,
    };
  }

  // Create JWT token
  private static async createToken(user: any): Promise<string> {
    return sign({
      sub: user.id,
      email: user.email,
      username: user.username,
    }, {
      expiresIn: '7d',
    });
  }

  // Verify token
  static async verifyToken(token: string): Promise<AuthToken | null> {
    try {
      return await verify(token);
    } catch {
      return null;
    }
  }

  // Get user by ID
  static async getUser(id: string): Promise<User | null> {
    const rootDb = DatabaseManager.getRootDb();
    const user = rootDb.prepare('SELECT * FROM users WHERE id = ?').get(id);
    return user ? this.toUser(user) : null;
  }
}
```

### API Key Authentication

```typescript
// src/auth/api-keys.ts
import { z } from 'zod';
import { randomBytes, createHash } from 'crypto';

export const ApiKeyCreate = z.object({
  name: z.string().min(1).max(100),
  projectId: z.string().optional(),
  permissions: z.array(z.string()).default([]),
  expiresIn: z.number().optional(), // Days
});

export class ApiKeyService {
  // Generate new API key
  static async create(
    userId: string,
    input: z.infer<typeof ApiKeyCreate>
  ): Promise<{ apiKey: string; record: ApiKeyRecord }> {
    const rootDb = DatabaseManager.getRootDb();

    // Generate random key
    const keyBytes = randomBytes(32);
    const apiKey = `iris_${keyBytes.toString('base64url')}`;
    const keyHash = createHash('sha256').update(apiKey).digest('hex');
    const keyPrefix = apiKey.slice(0, 12);

    const id = generateId('key');
    const expiresAt = input.expiresIn
      ? Date.now() + input.expiresIn * 24 * 60 * 60 * 1000
      : null;

    rootDb.prepare(`
      INSERT INTO api_keys (id, user_id, name, key_hash, key_prefix, project_id, permissions, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      userId,
      input.name,
      keyHash,
      keyPrefix,
      input.projectId,
      JSON.stringify(input.permissions),
      Date.now(),
      expiresAt
    );

    const record = await this.get(id);

    // Only return full key once
    return { apiKey, record: record! };
  }

  // Validate API key
  static async validate(apiKey: string): Promise<ApiKeyValidation | null> {
    if (!apiKey.startsWith('iris_')) {
      return null;
    }

    const keyHash = createHash('sha256').update(apiKey).digest('hex');
    const rootDb = DatabaseManager.getRootDb();

    const record = rootDb.prepare(`
      SELECT * FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL
    `).get(keyHash);

    if (!record) return null;

    // Check expiration
    if (record.expires_at && record.expires_at < Date.now()) {
      return null;
    }

    // Update usage
    rootDb.prepare(`
      UPDATE api_keys SET last_used_at = ?, usage_count = usage_count + 1 WHERE id = ?
    `).run(Date.now(), record.id);

    return {
      id: record.id,
      userId: record.user_id,
      projectId: record.project_id,
      permissions: JSON.parse(record.permissions),
    };
  }

  // Revoke API key
  static async revoke(userId: string, keyId: string): Promise<void> {
    const rootDb = DatabaseManager.getRootDb();

    const result = rootDb.prepare(`
      UPDATE api_keys SET revoked_at = ? WHERE id = ? AND user_id = ?
    `).run(Date.now(), keyId, userId);

    if (result.changes === 0) {
      throw new NotFoundError('API key not found');
    }
  }

  // List user's API keys
  static async list(userId: string): Promise<ApiKeyRecord[]> {
    const rootDb = DatabaseManager.getRootDb();

    return rootDb.prepare(`
      SELECT * FROM api_keys WHERE user_id = ? AND revoked_at IS NULL
      ORDER BY created_at DESC
    `).all(userId).map(row => ({
      id: row.id,
      name: row.name,
      keyPrefix: row.key_prefix,
      projectId: row.project_id,
      permissions: JSON.parse(row.permissions),
      lastUsedAt: row.last_used_at,
      usageCount: row.usage_count,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
    }));
  }
}
```

## Session Sharing

```typescript
// src/services/session-sharing.ts
import { z } from 'zod';
import { randomBytes } from 'crypto';

export const ShareOptions = z.object({
  allowAnonymous: z.boolean().default(false),
  expiresIn: z.number().optional(), // Hours
});

export class SessionSharingService {
  // Create share link for session
  static async createShareLink(
    projectId: string,
    sessionId: string,
    userId: string,
    options: z.infer<typeof ShareOptions>
  ): Promise<ShareLink> {
    const db = DatabaseManager.getProjectDb(projectId);

    // Check user has permission
    const hasAccess = await ProjectMemberService.hasPermission(
      projectId,
      userId,
      'session.share'
    );
    if (!hasAccess) {
      throw new ForbiddenError('Cannot share session');
    }

    const secret = randomBytes(16).toString('base64url');
    const expiresAt = options.expiresIn
      ? Date.now() + options.expiresIn * 60 * 60 * 1000
      : null;

    // Update session with share info
    db.prepare(`
      UPDATE sessions SET share_url = ?, share_secret = ? WHERE id = ?
    `).run(
      `${Config.publicUrl}/share/${sessionId}`,
      secret,
      sessionId
    );

    // Store share metadata in root DB
    const rootDb = DatabaseManager.getRootDb();
    rootDb.prepare(`
      INSERT INTO session_shares (id, project_id, session_id, created_by, secret, allow_anonymous, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      generateId('share'),
      projectId,
      sessionId,
      userId,
      secret,
      options.allowAnonymous ? 1 : 0,
      expiresAt,
      Date.now()
    );

    return {
      url: `${Config.publicUrl}/share/${sessionId}?s=${secret}`,
      secret,
      expiresAt,
    };
  }

  // Validate share access
  static async validateShareAccess(
    sessionId: string,
    secret: string,
    userId?: string
  ): Promise<ShareAccess | null> {
    const rootDb = DatabaseManager.getRootDb();

    const share = rootDb.prepare(`
      SELECT * FROM session_shares WHERE session_id = ? AND secret = ?
    `).get(sessionId, secret);

    if (!share) return null;

    // Check expiration
    if (share.expires_at && share.expires_at < Date.now()) {
      return null;
    }

    // Check if anonymous access allowed
    if (!userId && !share.allow_anonymous) {
      return null;
    }

    return {
      projectId: share.project_id,
      sessionId: share.session_id,
      permissions: ['read'], // Shared sessions are read-only by default
    };
  }

  // Revoke share link
  static async revokeShareLink(
    projectId: string,
    sessionId: string,
    userId: string
  ): Promise<void> {
    const db = DatabaseManager.getProjectDb(projectId);

    db.prepare(`
      UPDATE sessions SET share_url = NULL, share_secret = NULL WHERE id = ?
    `).run(sessionId);

    const rootDb = DatabaseManager.getRootDb();
    rootDb.prepare(`
      DELETE FROM session_shares WHERE session_id = ?
    `).run(sessionId);
  }
}
```

## Presence System

```typescript
// src/services/presence.ts
import { ConnectionManager } from '../websocket/connections';
import { RoomManager } from '../websocket/rooms';

interface UserPresence {
  userId: string;
  username: string;
  avatar?: string;
  connectionIds: Set<string>;
  lastActivity: number;
  currentSession?: string;
  cursorPosition?: number;
}

class PresenceService {
  private presence = new Map<string, Map<string, UserPresence>>();

  // Track user joining project
  join(projectId: string, connectionId: string, user: {
    userId: string;
    username: string;
    avatar?: string;
  }) {
    let projectPresence = this.presence.get(projectId);
    if (!projectPresence) {
      projectPresence = new Map();
      this.presence.set(projectId, projectPresence);
    }

    let userPresence = projectPresence.get(user.userId);
    if (!userPresence) {
      userPresence = {
        ...user,
        connectionIds: new Set(),
        lastActivity: Date.now(),
      };
      projectPresence.set(user.userId, userPresence);
    }

    userPresence.connectionIds.add(connectionId);
    userPresence.lastActivity = Date.now();

    // Broadcast to other users
    RoomManager.broadcast(`project:${projectId}`, {
      type: 'presence.joined',
      payload: {
        userId: user.userId,
        username: user.username,
        avatar: user.avatar,
      },
    }, [connectionId]);

    return this.getProjectPresence(projectId);
  }

  // Track user leaving
  leave(projectId: string, connectionId: string, userId: string) {
    const projectPresence = this.presence.get(projectId);
    if (!projectPresence) return;

    const userPresence = projectPresence.get(userId);
    if (!userPresence) return;

    userPresence.connectionIds.delete(connectionId);

    // Only broadcast leave if all connections closed
    if (userPresence.connectionIds.size === 0) {
      projectPresence.delete(userId);

      RoomManager.broadcast(`project:${projectId}`, {
        type: 'presence.left',
        payload: { userId },
      });
    }
  }

  // Update user activity
  activity(projectId: string, userId: string, activity: {
    sessionId?: string;
    cursorPosition?: number;
  }) {
    const projectPresence = this.presence.get(projectId);
    if (!projectPresence) return;

    const userPresence = projectPresence.get(userId);
    if (!userPresence) return;

    userPresence.lastActivity = Date.now();
    userPresence.currentSession = activity.sessionId;
    userPresence.cursorPosition = activity.cursorPosition;

    // Broadcast cursor position
    if (activity.cursorPosition !== undefined && activity.sessionId) {
      RoomManager.broadcast(`session:${activity.sessionId}`, {
        type: 'presence.cursor',
        payload: {
          userId,
          sessionId: activity.sessionId,
          position: activity.cursorPosition,
        },
      });
    }
  }

  // Get all users in project
  getProjectPresence(projectId: string): UserPresence[] {
    const projectPresence = this.presence.get(projectId);
    if (!projectPresence) return [];

    return Array.from(projectPresence.values()).map(p => ({
      userId: p.userId,
      username: p.username,
      avatar: p.avatar,
      currentSession: p.currentSession,
      lastActivity: p.lastActivity,
    }));
  }

  // Get users viewing a session
  getSessionViewers(projectId: string, sessionId: string): UserPresence[] {
    const projectPresence = this.presence.get(projectId);
    if (!projectPresence) return [];

    return Array.from(projectPresence.values())
      .filter(p => p.currentSession === sessionId)
      .map(p => ({
        userId: p.userId,
        username: p.username,
        avatar: p.avatar,
        cursorPosition: p.cursorPosition,
      }));
  }
}

export const Presence = new PresenceService();
```

## Concurrent Editing

```typescript
// src/services/concurrent-editing.ts
import { EventBus } from '../bus';

interface EditLock {
  sessionId: string;
  userId: string;
  lockedAt: number;
  expiresAt: number;
}

class ConcurrentEditingService {
  private locks = new Map<string, EditLock>();

  // Try to acquire edit lock for a session
  async acquireLock(
    projectId: string,
    sessionId: string,
    userId: string,
    duration: number = 30000 // 30 seconds default
  ): Promise<boolean> {
    const lockKey = `${projectId}:${sessionId}`;
    const existing = this.locks.get(lockKey);

    // Check if already locked by another user
    if (existing && existing.userId !== userId && existing.expiresAt > Date.now()) {
      return false;
    }

    // Acquire lock
    this.locks.set(lockKey, {
      sessionId,
      userId,
      lockedAt: Date.now(),
      expiresAt: Date.now() + duration,
    });

    // Notify others
    EventBus.publish(projectId, {
      type: 'session.locked',
      payload: {
        sessionId,
        userId,
        expiresAt: Date.now() + duration,
      },
    });

    return true;
  }

  // Release edit lock
  releaseLock(projectId: string, sessionId: string, userId: string): void {
    const lockKey = `${projectId}:${sessionId}`;
    const existing = this.locks.get(lockKey);

    if (existing && existing.userId === userId) {
      this.locks.delete(lockKey);

      EventBus.publish(projectId, {
        type: 'session.unlocked',
        payload: { sessionId },
      });
    }
  }

  // Extend lock duration
  extendLock(
    projectId: string,
    sessionId: string,
    userId: string,
    duration: number = 30000
  ): boolean {
    const lockKey = `${projectId}:${sessionId}`;
    const existing = this.locks.get(lockKey);

    if (!existing || existing.userId !== userId) {
      return false;
    }

    existing.expiresAt = Date.now() + duration;
    return true;
  }

  // Get current lock holder
  getLockHolder(projectId: string, sessionId: string): string | null {
    const lockKey = `${projectId}:${sessionId}`;
    const lock = this.locks.get(lockKey);

    if (!lock || lock.expiresAt < Date.now()) {
      return null;
    }

    return lock.userId;
  }

  // Clean up expired locks
  cleanupExpired(): void {
    const now = Date.now();
    for (const [key, lock] of this.locks) {
      if (lock.expiresAt < now) {
        this.locks.delete(key);
      }
    }
  }
}

export const ConcurrentEditing = new ConcurrentEditingService();

// Cleanup expired locks periodically
setInterval(() => {
  ConcurrentEditing.cleanupExpired();
}, 10000);
```

## Activity Audit Log

```typescript
// src/services/audit-log.ts
import { z } from 'zod';

export const AuditEvent = z.object({
  id: z.string(),
  projectId: z.string(),
  userId: z.string(),
  action: z.string(),
  resourceType: z.string(),
  resourceId: z.string(),
  metadata: z.record(z.unknown()).optional(),
  timestamp: z.number(),
});

export class AuditLogService {
  // Log an action
  static async log(event: Omit<z.infer<typeof AuditEvent>, 'id' | 'timestamp'>): Promise<void> {
    const db = DatabaseManager.getProjectDb(event.projectId);

    db.prepare(`
      INSERT INTO audit_log (id, user_id, action, resource_type, resource_id, metadata, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      generateId('audit'),
      event.userId,
      event.action,
      event.resourceType,
      event.resourceId,
      event.metadata ? JSON.stringify(event.metadata) : null,
      Date.now()
    );
  }

  // Get recent activity
  static async getRecent(
    projectId: string,
    options: {
      limit?: number;
      userId?: string;
      resourceType?: string;
      after?: number;
    } = {}
  ): Promise<AuditEvent[]> {
    const db = DatabaseManager.getProjectDb(projectId);

    let query = 'SELECT * FROM audit_log WHERE 1=1';
    const params: any[] = [];

    if (options.userId) {
      query += ' AND user_id = ?';
      params.push(options.userId);
    }

    if (options.resourceType) {
      query += ' AND resource_type = ?';
      params.push(options.resourceType);
    }

    if (options.after) {
      query += ' AND timestamp > ?';
      params.push(options.after);
    }

    query += ' ORDER BY timestamp DESC';
    query += ` LIMIT ${options.limit || 100}`;

    return db.prepare(query).all(...params).map(row => ({
      id: row.id,
      projectId,
      userId: row.user_id,
      action: row.action,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      timestamp: row.timestamp,
    }));
  }
}
```
