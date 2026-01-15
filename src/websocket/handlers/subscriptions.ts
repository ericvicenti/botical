/**
 * Subscription Request Handlers
 *
 * Handles WebSocket requests for channel subscriptions.
 * See: docs/implementation-plan/05-realtime-communication.md#request-handlers
 */

import { SubscribePayload, UnsubscribePayload } from "../protocol.ts";
import { RoomManager, getSessionRoom, getProjectRoom } from "../rooms.ts";
import type { WSData } from "../connections.ts";

/**
 * Validate that a channel is valid for this connection
 */
function validateChannel(channel: string, ctx: WSData): void {
  // Session channels: session:{sessionId}
  if (channel.startsWith("session:")) {
    // Allow subscribing to any session in the project
    // More granular permission checks could be added here
    return;
  }

  // Project channels: project:{projectId}
  if (channel.startsWith("project:")) {
    const projectId = channel.slice("project:".length);
    if (projectId !== ctx.projectId) {
      throw new Error("Cannot subscribe to events from another project");
    }
    return;
  }

  throw new Error(`Invalid channel: ${channel}`);
}

/**
 * Subscription handlers for WebSocket requests
 */
export const SubscriptionHandlers = {
  /**
   * Subscribe to a channel
   */
  async subscribe(payload: unknown, ctx: WSData) {
    const input = SubscribePayload.parse(payload);

    validateChannel(input.channel, ctx);

    RoomManager.join(input.channel, ctx.connectionId);

    return {
      subscribed: true,
      channel: input.channel,
    };
  },

  /**
   * Unsubscribe from a channel
   */
  async unsubscribe(payload: unknown, ctx: WSData) {
    const input = UnsubscribePayload.parse(payload);

    RoomManager.leave(input.channel, ctx.connectionId);

    return {
      unsubscribed: true,
      channel: input.channel,
    };
  },
};
