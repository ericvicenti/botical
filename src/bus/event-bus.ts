/**
 * Event Bus Module
 *
 * Provides decoupled communication between components using pub/sub pattern.
 * See: docs/knowledge-base/04-patterns.md#event-bus-pattern
 *
 * The event bus is central to Iris's event-driven architecture:
 * - Services publish events when state changes
 * - WebSocket bridge subscribes to broadcast to clients
 * - Components can subscribe with pattern matching (e.g., "message.*")
 *
 * See: docs/knowledge-base/01-architecture.md#event-bus-layer
 */

import { generateId } from "../utils/id.ts";
import type {
  IrisEvent,
  IrisEventType,
  EventEnvelope,
  EventSubscriber,
  EventPattern,
} from "./types.ts";

/**
 * Subscription handle for unsubscribing
 */
export interface Subscription {
  id: string;
  pattern: EventPattern;
  projectId?: string;
  unsubscribe: () => void;
}

/**
 * Internal subscription storage
 */
interface StoredSubscription {
  id: string;
  pattern: EventPattern;
  projectId?: string;
  callback: EventSubscriber;
}

/**
 * Event Bus Singleton
 *
 * Provides typed pub/sub for internal events with automatic WebSocket bridging.
 * See: docs/knowledge-base/04-patterns.md#event-bus-pattern
 *
 * Supports:
 * - Global events (cross-project): Use publishGlobal()
 * - Project-scoped events: Use publish(projectId, event)
 * - Pattern matching: "message.*" matches "message.created", "message.text.delta", etc.
 *
 * Event flow: Service → EventBus → WebSocket Bridge → Connected Clients
 * See: docs/knowledge-base/01-architecture.md#event-driven-communication
 */
class EventBusSingleton {
  private static instance: EventBusSingleton;
  private subscriptions = new Map<string, StoredSubscription>();
  private eventLog: EventEnvelope[] = [];
  private maxLogSize = 1000;

  private constructor() {}

  static getInstance(): EventBusSingleton {
    if (!EventBusSingleton.instance) {
      EventBusSingleton.instance = new EventBusSingleton();
    }
    return EventBusSingleton.instance;
  }

  /**
   * Publish an event for a specific project
   */
  publish(projectId: string, event: IrisEvent): EventEnvelope {
    const envelope: EventEnvelope = {
      id: generateId("evt"),
      timestamp: Date.now(),
      projectId,
      event,
    };

    this.processEvent(envelope);
    return envelope;
  }

  /**
   * Publish a global event (not scoped to a project)
   */
  publishGlobal(event: IrisEvent): EventEnvelope {
    const envelope: EventEnvelope = {
      id: generateId("evt"),
      timestamp: Date.now(),
      event,
    };

    this.processEvent(envelope);
    return envelope;
  }

  /**
   * Subscribe to events matching a pattern
   *
   * @param pattern - Event type or pattern with wildcard (e.g., "message.*")
   * @param callback - Function to call when event matches
   * @returns Subscription handle
   */
  subscribe(
    pattern: EventPattern,
    callback: EventSubscriber
  ): Subscription {
    const id = generateId("sub");
    const subscription: StoredSubscription = {
      id,
      pattern,
      callback,
    };

    this.subscriptions.set(id, subscription);

    return {
      id,
      pattern,
      unsubscribe: () => this.unsubscribe(id),
    };
  }

  /**
   * Subscribe to events for a specific project
   */
  subscribeProject(
    projectId: string,
    pattern: EventPattern,
    callback: EventSubscriber
  ): Subscription {
    const id = generateId("sub");
    const subscription: StoredSubscription = {
      id,
      pattern,
      projectId,
      callback,
    };

    this.subscriptions.set(id, subscription);

    return {
      id,
      pattern,
      projectId,
      unsubscribe: () => this.unsubscribe(id),
    };
  }

  /**
   * Unsubscribe by subscription ID
   */
  unsubscribe(subscriptionId: string): boolean {
    return this.subscriptions.delete(subscriptionId);
  }

  /**
   * Unsubscribe all subscriptions for a project
   */
  unsubscribeProject(projectId: string): number {
    let count = 0;
    for (const [id, sub] of this.subscriptions) {
      if (sub.projectId === projectId) {
        this.subscriptions.delete(id);
        count++;
      }
    }
    return count;
  }

  /**
   * Clear all subscriptions
   */
  clearAll(): void {
    this.subscriptions.clear();
    this.eventLog = [];
  }

  /**
   * Get recent events (for debugging)
   */
  getRecentEvents(limit = 100): EventEnvelope[] {
    return this.eventLog.slice(-limit);
  }

  /**
   * Get subscription count
   */
  getSubscriptionCount(): number {
    return this.subscriptions.size;
  }

  /**
   * Process an event and notify subscribers
   */
  private async processEvent(envelope: EventEnvelope): Promise<void> {
    // Add to log
    this.eventLog.push(envelope);
    if (this.eventLog.length > this.maxLogSize) {
      this.eventLog.shift();
    }

    // Find matching subscriptions
    const matching = this.findMatchingSubscriptions(envelope);

    // Execute callbacks (fire and forget for async)
    for (const sub of matching) {
      try {
        const result = sub.callback(envelope);
        // Don't await - let callbacks run asynchronously
        if (result instanceof Promise) {
          result.catch((error) => {
            console.error(
              `Event subscriber error for ${envelope.event.type}:`,
              error
            );
          });
        }
      } catch (error) {
        console.error(
          `Event subscriber error for ${envelope.event.type}:`,
          error
        );
      }
    }
  }

  /**
   * Find subscriptions matching an event
   */
  private findMatchingSubscriptions(
    envelope: EventEnvelope
  ): StoredSubscription[] {
    const matches: StoredSubscription[] = [];

    for (const sub of this.subscriptions.values()) {
      // Check project scope
      if (sub.projectId && sub.projectId !== envelope.projectId) {
        continue;
      }

      // Check pattern match
      if (this.matchesPattern(sub.pattern, envelope.event.type)) {
        matches.push(sub);
      }
    }

    return matches;
  }

  /**
   * Check if an event type matches a pattern
   */
  private matchesPattern(pattern: EventPattern, eventType: string): boolean {
    // Exact match
    if (pattern === eventType) {
      return true;
    }

    // Wildcard match (e.g., "message.*" matches "message.created")
    if (pattern.endsWith(".*")) {
      const prefix = pattern.slice(0, -2);
      return eventType.startsWith(prefix + ".");
    }

    return false;
  }
}

export const EventBus = EventBusSingleton.getInstance();
