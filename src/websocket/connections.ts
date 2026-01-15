/**
 * WebSocket Connection Manager
 *
 * Tracks active WebSocket connections and provides utilities for
 * sending messages to specific connections or broadcasting.
 * See: docs/implementation-plan/05-realtime-communication.md#connection--room-management
 */

import type { WSEvent } from "./protocol.ts";

/**
 * WebSocket interface for connection management.
 * We use a minimal interface to decouple from the specific WebSocket implementation.
 */
export interface WebSocketConnection {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  readyState: number;
}

/**
 * Connection metadata stored for each active connection
 */
export interface ConnectionInfo {
  ws: WebSocketConnection;
  userId: string;
  projectId: string;
  connectedAt: number;
  lastActivity: number;
  subscriptions: Set<string>;
}

/**
 * Connection data attached to WebSocket context
 */
export interface WSData {
  userId: string;
  projectId: string;
  connectionId: string;
}

/**
 * Connection Manager Singleton
 *
 * Provides centralized management of WebSocket connections.
 * Tracks connections by ID and provides lookup by user or project.
 */
class ConnectionManagerSingleton {
  private static instance: ConnectionManagerSingleton;
  private connections = new Map<string, ConnectionInfo>();

  private constructor() {}

  static getInstance(): ConnectionManagerSingleton {
    if (!ConnectionManagerSingleton.instance) {
      ConnectionManagerSingleton.instance = new ConnectionManagerSingleton();
    }
    return ConnectionManagerSingleton.instance;
  }

  /**
   * Add a new connection
   */
  add(id: string, info: Omit<ConnectionInfo, "subscriptions">): void {
    this.connections.set(id, {
      ...info,
      subscriptions: new Set(),
    });
  }

  /**
   * Remove a connection
   */
  remove(id: string): boolean {
    return this.connections.delete(id);
  }

  /**
   * Get a connection by ID
   */
  get(id: string): ConnectionInfo | undefined {
    return this.connections.get(id);
  }

  /**
   * Check if a connection exists
   */
  has(id: string): boolean {
    return this.connections.has(id);
  }

  /**
   * Get all connections for a user
   */
  getByUser(userId: string): ConnectionInfo[] {
    return Array.from(this.connections.values()).filter(
      (c) => c.userId === userId
    );
  }

  /**
   * Get all connections for a project
   */
  getByProject(projectId: string): ConnectionInfo[] {
    return Array.from(this.connections.values()).filter(
      (c) => c.projectId === projectId
    );
  }

  /**
   * Get connection IDs for a project
   */
  getConnectionIdsByProject(projectId: string): string[] {
    const ids: string[] = [];
    for (const [id, conn] of this.connections) {
      if (conn.projectId === projectId) {
        ids.push(id);
      }
    }
    return ids;
  }

  /**
   * Add a subscription to a connection
   */
  addSubscription(connectionId: string, channel: string): boolean {
    const conn = this.connections.get(connectionId);
    if (conn) {
      conn.subscriptions.add(channel);
      return true;
    }
    return false;
  }

  /**
   * Remove a subscription from a connection
   */
  removeSubscription(connectionId: string, channel: string): boolean {
    const conn = this.connections.get(connectionId);
    if (conn) {
      return conn.subscriptions.delete(channel);
    }
    return false;
  }

  /**
   * Check if a connection has a subscription
   */
  hasSubscription(connectionId: string, channel: string): boolean {
    const conn = this.connections.get(connectionId);
    return conn?.subscriptions.has(channel) ?? false;
  }

  /**
   * Get all subscriptions for a connection
   */
  getSubscriptions(connectionId: string): string[] {
    const conn = this.connections.get(connectionId);
    return conn ? Array.from(conn.subscriptions) : [];
  }

  /**
   * Update last activity timestamp
   */
  updateActivity(id: string): void {
    const conn = this.connections.get(id);
    if (conn) {
      conn.lastActivity = Date.now();
    }
  }

  /**
   * Send a message to a specific connection
   */
  send(id: string, message: WSEvent): boolean {
    const conn = this.connections.get(id);
    if (conn && conn.ws.readyState === 1) {
      // 1 = OPEN
      try {
        conn.ws.send(JSON.stringify(message));
        return true;
      } catch {
        // Connection may have closed
        return false;
      }
    }
    return false;
  }

  /**
   * Broadcast a message to all connections for a project
   */
  broadcastToProject(
    projectId: string,
    message: WSEvent,
    exclude: string[] = []
  ): number {
    let count = 0;
    for (const [id, conn] of this.connections) {
      if (conn.projectId === projectId && !exclude.includes(id)) {
        if (this.send(id, message)) {
          count++;
        }
      }
    }
    return count;
  }

  /**
   * Broadcast a message to all connections for a user
   */
  broadcastToUser(
    userId: string,
    message: WSEvent,
    exclude: string[] = []
  ): number {
    let count = 0;
    for (const [id, conn] of this.connections) {
      if (conn.userId === userId && !exclude.includes(id)) {
        if (this.send(id, message)) {
          count++;
        }
      }
    }
    return count;
  }

  /**
   * Get total connection count
   */
  getCount(): number {
    return this.connections.size;
  }

  /**
   * Get connection count for a project
   */
  getProjectCount(projectId: string): number {
    let count = 0;
    for (const conn of this.connections.values()) {
      if (conn.projectId === projectId) {
        count++;
      }
    }
    return count;
  }

  /**
   * Get all connection IDs
   */
  getAllIds(): string[] {
    return Array.from(this.connections.keys());
  }

  /**
   * Clear all connections (for testing)
   */
  clear(): void {
    this.connections.clear();
  }
}

export const ConnectionManager = ConnectionManagerSingleton.getInstance();
