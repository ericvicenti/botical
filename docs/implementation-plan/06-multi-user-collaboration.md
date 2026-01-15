# Multi-User Collaboration

## Overview

Iris supports multiple users working on the same project with:
- Email-based magic link authentication (passwordless)
- Real-time presence awareness
- Session sharing and collaborative viewing
- Role-based access control
- Concurrent editing coordination

## Authentication System

### Magic Link Authentication

Iris uses passwordless email-based authentication with magic links. This provides:
- No passwords to remember or manage
- Reduced attack surface (no password database)
- Simple user experience
- Dev mode console logging for local development

```typescript
// src/auth/magic-link.ts
import { DatabaseManager } from '../database';
import { hashSha256, generateSecureToken } from '../services/crypto';
import { EmailService } from '../services/email';

const MAGIC_LINK_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes

export class MagicLinkService {
  // Request a magic link for the given email
  static async request(
    email: string,
    metadata?: { ipAddress?: string; userAgent?: string }
  ): Promise<void> {
    const db = DatabaseManager.getRootDb();
    const normalizedEmail = email.toLowerCase().trim();

    // Generate secure random token
    const token = generateSecureToken(32);
    const tokenHash = hashSha256(token);

    // Check if user exists
    const existingUser = db.prepare(
      'SELECT id FROM users WHERE email = ?'
    ).get(normalizedEmail);

    // Store token with expiry
    db.prepare(`
      INSERT INTO email_verification_tokens
      (id, email, token_hash, token_type, user_id, created_at, expires_at, ip_address, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      generateId('emltkn'),
      normalizedEmail,
      tokenHash,
      'magic_link',
      existingUser?.id ?? null,
      Date.now(),
      Date.now() + MAGIC_LINK_EXPIRY_MS,
      metadata?.ipAddress ?? null,
      metadata?.userAgent ?? null
    );

    // Send email (or log in dev mode)
    await EmailService.sendMagicLink(normalizedEmail, token);
  }

  // Verify a magic link token and return/create user
  static verify(
    token: string,
    metadata?: { ipAddress?: string; userAgent?: string }
  ): { userId: string; isNewUser: boolean; isAdmin: boolean } {
    const db = DatabaseManager.getRootDb();
    const tokenHash = hashSha256(token);

    // Find valid token
    const tokenRecord = db.prepare(`
      SELECT * FROM email_verification_tokens
      WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?
    `).get(tokenHash, Date.now());

    if (!tokenRecord) {
      throw new AuthenticationError('Invalid or expired magic link');
    }

    // Mark token as used
    db.prepare('UPDATE email_verification_tokens SET used_at = ? WHERE id = ?')
      .run(Date.now(), tokenRecord.id);

    // Find or create user
    let userId: string;
    let isNewUser = false;
    let isAdmin = false;

    if (tokenRecord.user_id) {
      userId = tokenRecord.user_id;
      const user = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(userId);
      isAdmin = Boolean(user?.is_admin);
    } else {
      // Create new user - check if first user
      isNewUser = true;
      userId = generateId('usr');

      const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
      const isFirstUser = userCount.count === 0;
      isAdmin = isFirstUser;

      // Generate username from email
      const username = tokenRecord.email.split('@')[0] + '_' + randomHex(4);

      db.prepare(`
        INSERT INTO users (id, email, username, is_admin, can_execute_code, preferences, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        userId,
        tokenRecord.email,
        username,
        isFirstUser ? 1 : 0,
        isFirstUser ? 1 : 0, // First user can execute code
        '{}',
        Date.now(),
        Date.now()
      );
    }

    // Update last login
    db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(Date.now(), userId);

    return { userId, isNewUser, isAdmin };
  }
}
```

### User Trust Levels

Users have different trust levels that control their capabilities:

| Trust Level | is_admin | can_execute_code | Capabilities |
|-------------|----------|------------------|--------------|
| Admin | true | true | Full access, code execution, manage users |
| Trusted | false | true | Code execution, full project access |
| Regular | false | false | Read/write projects, no code execution |

The **first registered user** automatically becomes an admin.

### Session Management

Sessions are database-backed for immediate revocation:

```typescript
// src/auth/session.ts
export class SessionService {
  // Create a new session for a user
  static create(
    userId: string,
    metadata?: { ipAddress?: string; userAgent?: string }
  ): { session: AuthSession; token: string } {
    const db = DatabaseManager.getRootDb();

    const token = generateSecureToken(32);
    const tokenHash = hashSha256(token);

    const session = {
      id: generateId('authsess'),
      userId,
      createdAt: Date.now(),
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
      lastActivityAt: Date.now(),
    };

    db.prepare(`
      INSERT INTO auth_sessions
      (id, user_id, token_hash, created_at, expires_at, last_activity_at, ip_address, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      session.id,
      userId,
      tokenHash,
      session.createdAt,
      session.expiresAt,
      session.lastActivityAt,
      metadata?.ipAddress ?? null,
      metadata?.userAgent ?? null
    );

    return { session, token };
  }

  // Validate a session token
  static validate(token: string): AuthSession | null {
    const db = DatabaseManager.getRootDb();
    const tokenHash = hashSha256(token);

    const row = db.prepare(`
      SELECT * FROM auth_sessions
      WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ?
    `).get(tokenHash, Date.now());

    if (!row) return null;

    // Update last activity
    db.prepare('UPDATE auth_sessions SET last_activity_at = ? WHERE id = ?')
      .run(Date.now(), row.id);

    return rowToAuthSession(row);
  }

  // Revoke a session
  static revoke(sessionId: string): void {
    const db = DatabaseManager.getRootDb();
    db.prepare('UPDATE auth_sessions SET revoked_at = ? WHERE id = ?')
      .run(Date.now(), sessionId);
  }
}
```

### API Key Authentication

```typescript
// src/auth/api-keys.ts
export class ApiKeyService {
  // Generate new API key
  static create(
    userId: string,
    input: { name: string; projectId?: string; permissions?: string[]; expiresIn?: number }
  ): { apiKey: string; record: ApiKeyRecord } {
    const rootDb = DatabaseManager.getRootDb();

    // Generate random key with prefix
    const keyBytes = randomBytes(32);
    const apiKey = `iris_${keyBytes.toString('base64url')}`;
    const keyHash = hashSha256(apiKey);
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
      input.projectId ?? null,
      JSON.stringify(input.permissions ?? []),
      Date.now(),
      expiresAt
    );

    const record = this.get(id);
    return { apiKey, record: record! };
  }

  // Validate API key
  static validate(apiKey: string): ApiKeyValidation | null {
    if (!apiKey.startsWith('iris_')) return null;

    const keyHash = hashSha256(apiKey);
    const rootDb = DatabaseManager.getRootDb();

    const record = rootDb.prepare(`
      SELECT * FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL
    `).get(keyHash);

    if (!record) return null;
    if (record.expires_at && record.expires_at < Date.now()) return null;

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
}
```

## Email Service

### Resend Integration

```typescript
// src/services/email.ts
export class EmailService {
  // Send magic link email
  async sendMagicLink(email: string, token: string): Promise<void> {
    const config = this.getConfig();
    const magicLink = `${config.appUrl}/auth/verify?token=${token}`;

    if (!config.resendApiKey) {
      // Dev mode: log to console
      console.log('\n========================================');
      console.log('MAGIC LINK (dev mode)');
      console.log(`Email: ${email}`);
      console.log(`Link: ${magicLink}`);
      console.log('========================================\n');
      return;
    }

    // Production: send via Resend
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: config.fromEmail,
        to: email,
        subject: 'Your Iris Login Link',
        html: `
          <h1>Login to Iris</h1>
          <p>Click the link below to log in:</p>
          <a href="${magicLink}">Log in to Iris</a>
          <p>This link expires in 15 minutes.</p>
        `,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to send email: ${response.statusText}`);
    }
  }
}
```

## Per-User Provider Credentials

Users configure their own AI provider API keys:

```typescript
// src/services/provider-credentials.ts
export class ProviderCredentialsService {
  // Store a new provider credential (encrypted)
  static create(
    userId: string,
    input: { provider: 'openai' | 'anthropic' | 'google'; apiKey: string; name?: string; isDefault?: boolean }
  ): ProviderCredential {
    const db = DatabaseManager.getRootDb();

    // If setting as default, unset other defaults for this provider
    if (input.isDefault) {
      db.prepare(`
        UPDATE provider_credentials SET is_default = 0
        WHERE user_id = ? AND provider = ?
      `).run(userId, input.provider);
    }

    const id = generateId('cred');
    db.prepare(`
      INSERT INTO provider_credentials
      (id, user_id, provider, api_key_encrypted, name, is_default, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      userId,
      input.provider,
      encrypt(input.apiKey), // AES-256-GCM encryption
      input.name ?? null,
      input.isDefault ? 1 : 0,
      Date.now(),
      Date.now()
    );

    return { id, provider: input.provider, name: input.name ?? null, isDefault: input.isDefault ?? true, createdAt: Date.now(), updatedAt: Date.now() };
  }

  // Get decrypted API key for a provider
  static getApiKey(userId: string, provider: string): string | null {
    const db = DatabaseManager.getRootDb();

    const row = db.prepare(`
      SELECT api_key_encrypted FROM provider_credentials
      WHERE user_id = ? AND provider = ? AND is_default = 1
    `).get(userId, provider);

    if (!row) return null;
    return decrypt(row.api_key_encrypted);
  }
}
```

## Session Sharing

```typescript
// src/services/session-sharing.ts
export class SessionSharingService {
  // Create share link for session
  static async createShareLink(
    projectId: string,
    sessionId: string,
    userId: string,
    options: { allowAnonymous?: boolean; expiresIn?: number }
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

    const secret = generateSecureToken(16);
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
