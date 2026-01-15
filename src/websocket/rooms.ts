/**
 * Room/Channel Manager
 *
 * Manages subscription channels for WebSocket connections.
 * Clients can subscribe to rooms to receive targeted events.
 * See: docs/implementation-plan/05-realtime-communication.md#connection--room-management
 *
 * Room naming convention:
 * - project:{projectId} - All events for a project
 * - session:{sessionId} - Message streaming for a session
 */

import { ConnectionManager } from "./connections.ts";
import type { WSEvent } from "./protocol.ts";

/**
 * Room Manager Singleton
 *
 * Manages room membership and provides room-based broadcasting.
 * Rooms are logical groupings of connections for targeted message delivery.
 */
class RoomManagerSingleton {
  private static instance: RoomManagerSingleton;
  private rooms = new Map<string, Set<string>>();

  private constructor() {}

  static getInstance(): RoomManagerSingleton {
    if (!RoomManagerSingleton.instance) {
      RoomManagerSingleton.instance = new RoomManagerSingleton();
    }
    return RoomManagerSingleton.instance;
  }

  /**
   * Join a connection to a room
   */
  join(room: string, connectionId: string): void {
    if (!this.rooms.has(room)) {
      this.rooms.set(room, new Set());
    }
    this.rooms.get(room)!.add(connectionId);

    // Also track in connection's subscriptions
    ConnectionManager.addSubscription(connectionId, room);
  }

  /**
   * Remove a connection from a room
   */
  leave(room: string, connectionId: string): boolean {
    const members = this.rooms.get(room);
    if (!members) return false;

    const removed = members.delete(connectionId);

    // Clean up empty rooms
    if (members.size === 0) {
      this.rooms.delete(room);
    }

    // Also remove from connection's subscriptions
    ConnectionManager.removeSubscription(connectionId, room);

    return removed;
  }

  /**
   * Remove a connection from all rooms
   */
  leaveAll(connectionId: string): number {
    let count = 0;
    for (const [room, members] of this.rooms) {
      if (members.delete(connectionId)) {
        count++;
        if (members.size === 0) {
          this.rooms.delete(room);
        }
      }
    }
    return count;
  }

  /**
   * Check if a connection is in a room
   */
  isMember(room: string, connectionId: string): boolean {
    const members = this.rooms.get(room);
    return members?.has(connectionId) ?? false;
  }

  /**
   * Get all members of a room
   */
  getMembers(room: string): string[] {
    return Array.from(this.rooms.get(room) || []);
  }

  /**
   * Get member count for a room
   */
  getMemberCount(room: string): number {
    return this.rooms.get(room)?.size ?? 0;
  }

  /**
   * Get all rooms a connection is in
   */
  getRooms(connectionId: string): string[] {
    const rooms: string[] = [];
    for (const [room, members] of this.rooms) {
      if (members.has(connectionId)) {
        rooms.push(room);
      }
    }
    return rooms;
  }

  /**
   * Broadcast a message to all members of a room
   */
  broadcast(room: string, message: WSEvent, exclude: string[] = []): number {
    const members = this.rooms.get(room);
    if (!members) return 0;

    let count = 0;
    for (const connectionId of members) {
      if (!exclude.includes(connectionId)) {
        if (ConnectionManager.send(connectionId, message)) {
          count++;
        }
      }
    }
    return count;
  }

  /**
   * Check if a room exists (has members)
   */
  exists(room: string): boolean {
    const members = this.rooms.get(room);
    return members !== undefined && members.size > 0;
  }

  /**
   * Get all active room names
   */
  getAllRooms(): string[] {
    return Array.from(this.rooms.keys());
  }

  /**
   * Get room count
   */
  getRoomCount(): number {
    return this.rooms.size;
  }

  /**
   * Clear all rooms (for testing)
   */
  clear(): void {
    this.rooms.clear();
  }
}

export const RoomManager = RoomManagerSingleton.getInstance();

/**
 * Helper to get the project room name
 */
export function getProjectRoom(projectId: string): string {
  return `project:${projectId}`;
}

/**
 * Helper to get the session room name
 */
export function getSessionRoom(sessionId: string): string {
  return `session:${sessionId}`;
}
