/**
 * Telegram Integration
 *
 * Provides two-way communication between Botical and Telegram.
 * - Receives messages from Telegram via long polling
 * - Sends messages/notifications to Telegram users
 * - Routes incoming messages to leopard agent sessions
 */

import { DatabaseManager } from "@/database/manager.ts";
import { SessionService } from "@/services/sessions.ts";
import { AgentOrchestrator } from "@/agents/orchestrator.ts";
import { CredentialResolver } from "@/agents/credential-resolver.ts";
import type { ProviderId } from "@/agents/types.ts";
import { Config } from "@/config/index.ts";
import { extractTextContent } from "@/services/message-content.ts";

const TELEGRAM_API = "https://api.telegram.org/bot";

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: {
      id: number;
      first_name: string;
      username?: string;
    };
    chat: {
      id: number;
      type: string;
    };
    text?: string;
    date: number;
  };
}

interface TelegramConfig {
  botToken: string;
  /** Allowed Telegram user IDs (security — only these users can interact) */
  allowedUsers: number[];
  /** Default project ID for sessions */
  projectId: string;
  /** Default agent name */
  agent: string;
  /** Default provider for LLM calls */
  providerId: ProviderId;
  /** User ID in Botical's auth system */
  boticalUserId: string;
}

/**
 * Telegram Bot Integration
 */
export class TelegramBot {
  private config: TelegramConfig;
  private offset: number = 0;
  private running: boolean = false;
  private pollTimeout: ReturnType<typeof setTimeout> | null = null;
  /** Map of telegram chat ID → active botical session ID */
  private activeSessions: Map<number, string> = new Map();

  constructor(config: TelegramConfig) {
    this.config = config;
  }

  /**
   * Start the bot (long polling)
   */
  start(): void {
    if (this.running) return;
    this.running = true;
    console.log(`[Telegram] Starting bot @${this.config.botToken.split(":")[0]}...`);
    this.poll();
  }

  /**
   * Stop the bot
   */
  stop(): void {
    this.running = false;
    if (this.pollTimeout) {
      clearTimeout(this.pollTimeout);
      this.pollTimeout = null;
    }
    console.log("[Telegram] Bot stopped");
  }

  /**
   * Send a message to a Telegram chat
   */
  async sendMessage(chatId: number, text: string, options?: {
    parseMode?: "Markdown" | "MarkdownV2" | "HTML";
    replyToMessageId?: number;
    disableNotification?: boolean;
  }): Promise<boolean> {
    try {
      // Telegram has a 4096 char limit per message
      const chunks = this.splitMessage(text, 4000);

      for (const chunk of chunks) {
        const resp = await fetch(`${TELEGRAM_API}${this.config.botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: chunk,
            parse_mode: options?.parseMode,
            reply_to_message_id: options?.replyToMessageId,
            disable_notification: options?.disableNotification,
          }),
        });

        if (!resp.ok) {
          const err = await resp.text();
          console.error(`[Telegram] sendMessage failed: ${resp.status} ${err}`);
          return false;
        }
      }
      return true;
    } catch (err) {
      console.error("[Telegram] sendMessage error:", err);
      return false;
    }
  }

  /**
   * Send a typing indicator
   */
  async sendTyping(chatId: number): Promise<void> {
    try {
      await fetch(`${TELEGRAM_API}${this.config.botToken}/sendChatAction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, action: "typing" }),
      });
    } catch { /* ignore */ }
  }

  /**
   * Poll for updates
   */
  private async poll(): Promise<void> {
    if (!this.running) return;

    try {
      const resp = await fetch(
        `${TELEGRAM_API}${this.config.botToken}/getUpdates?offset=${this.offset}&timeout=30&allowed_updates=["message"]`,
        { signal: AbortSignal.timeout(35000) }
      );

      if (!resp.ok) {
        console.error(`[Telegram] Poll failed: ${resp.status}`);
        this.scheduleNextPoll(5000);
        return;
      }

      const data = await resp.json() as { ok: boolean; result: TelegramUpdate[] };

      if (data.ok && data.result.length > 0) {
        for (const update of data.result) {
          this.offset = update.update_id + 1;
          await this.handleUpdate(update);
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name !== "AbortError") {
        console.error("[Telegram] Poll error:", err.message);
      }
    }

    this.scheduleNextPoll(100); // Poll again immediately
  }

  private scheduleNextPoll(delayMs: number): void {
    if (!this.running) return;
    this.pollTimeout = setTimeout(() => this.poll(), delayMs);
  }

  /**
   * Handle an incoming update
   */
  private async handleUpdate(update: TelegramUpdate): Promise<void> {
    const msg = update.message;
    if (!msg?.text) return;

    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text;

    // Security check
    if (!this.config.allowedUsers.includes(userId)) {
      console.log(`[Telegram] Unauthorized user ${userId} (${msg.from.username})`);
      await this.sendMessage(chatId, "⚠️ Unauthorized. This bot is private.");
      return;
    }

    console.log(`[Telegram] Message from ${msg.from.username || userId}: ${text.substring(0, 100)}`);

    // Handle commands
    if (text.startsWith("/")) {
      await this.handleCommand(chatId, text);
      return;
    }

    // Route to leopard agent
    await this.routeToAgent(chatId, text);
  }

  /**
   * Handle bot commands
   */
  private async handleCommand(chatId: number, text: string): Promise<void> {
    const [cmd, ...args] = text.split(" ");

    switch (cmd) {
      case "/start":
        await this.sendMessage(chatId, "🐆 Leopard here! I'm the Botical self-improvement agent.\n\nSend me messages and I'll respond using the AI agent system.\n\n/status — Check system status\n/new — Start a new session\n/priorities — Show current priorities");
        break;

      case "/status": {
        const prodActive = await this.checkService("botical-prod");
        const devActive = await this.checkService("botical-dev");
        await this.sendMessage(chatId,
          `🐆 Leopard Status\n\n` +
          `Prod: ${prodActive ? "✅" : "❌"}\n` +
          `Dev: ${devActive ? "✅" : "❌"}\n` +
          `Session: ${this.activeSessions.get(chatId) || "none"}`
        );
        break;
      }

      case "/new":
        this.activeSessions.delete(chatId);
        await this.sendMessage(chatId, "🆕 New session will be created on your next message.");
        break;

      case "/priorities": {
        try {
          const priorities = await Bun.file(`${process.cwd()}/PRIORITIES.md`).text();
          // Send first 3000 chars
          await this.sendMessage(chatId, priorities.substring(0, 3000));
        } catch {
          await this.sendMessage(chatId, "❌ Could not read PRIORITIES.md");
        }
        break;
      }

      default:
        await this.sendMessage(chatId, `Unknown command: ${cmd}`);
    }
  }

  /**
   * Route a message to the leopard agent
   */
  private async routeToAgent(chatId: number, text: string): Promise<void> {
    await this.sendTyping(chatId);

    const { projectId, agent, providerId, boticalUserId } = this.config;

    try {
      const db = DatabaseManager.getProjectDb(projectId);

      // Get or create session
      let sessionId = this.activeSessions.get(chatId);

      if (!sessionId) {
        const session = SessionService.create(db, {
          title: `Telegram ${new Date().toISOString().split("T")[0]}`,
          agent,
          providerId,
        });
        sessionId = session.id;
        this.activeSessions.set(chatId, sessionId);
        console.log(`[Telegram] Created session ${sessionId} for chat ${chatId}`);
      }

      // Resolve credentials
      const credentialResolver = new CredentialResolver(boticalUserId, providerId);

      // Run the agent
      let responseText = "";
      const result = await AgentOrchestrator.run({
        db,
        projectId,
        projectPath: process.cwd(),
        sessionId,
        userId: boticalUserId,
        canExecuteCode: true,
        content: text,
        credentialResolver,
        providerId,
        agentName: agent,
        onEvent: async (event) => {
          // Send typing indicator periodically during processing
          if (event.type === "step-start") {
            await this.sendTyping(chatId);
          }
        },
      });

      // Get the response from the assistant message
      const { MessagePartService } = await import("@/services/messages.ts");
      const parts = MessagePartService.listByMessage(db, result.messageId);
      const textParts = parts.filter(p => p.type === "text");
      responseText = textParts
        .map(p => extractTextContent(p.content))
        .join("");

      if (responseText) {
        await this.sendMessage(chatId, responseText);
      } else {
        await this.sendMessage(chatId, "✅ Done (no text response)");
      }

    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[Telegram] Agent error:`, errMsg);
      await this.sendMessage(chatId, `❌ Error: ${errMsg.substring(0, 500)}`);

      // Clear session on error so next message creates a fresh one
      this.activeSessions.delete(chatId);
    }
  }

  /**
   * Check if a systemd service is active
   */
  private async checkService(name: string): Promise<boolean> {
    try {
      const proc = Bun.spawn(["systemctl", "is-active", name], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const output = await new Response(proc.stdout).text();
      return output.trim() === "active";
    } catch {
      return false;
    }
  }

  /**
   * Split a long message into chunks
   */
  private splitMessage(text: string, maxLen: number): string[] {
    if (text.length <= maxLen) return [text];

    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (remaining.length <= maxLen) {
        chunks.push(remaining);
        break;
      }

      // Try to split at newline
      let splitIdx = remaining.lastIndexOf("\n", maxLen);
      if (splitIdx < maxLen * 0.5) {
        // No good newline, split at space
        splitIdx = remaining.lastIndexOf(" ", maxLen);
      }
      if (splitIdx < maxLen * 0.3) {
        // No good split point, hard split
        splitIdx = maxLen;
      }

      chunks.push(remaining.substring(0, splitIdx));
      remaining = remaining.substring(splitIdx).trimStart();
    }

    return chunks;
  }
}

// ============================================================================
// Singleton management
// ============================================================================

let botInstance: TelegramBot | null = null;

/**
 * Initialize and start the Telegram bot if configured
 */
export function startTelegramBot(): TelegramBot | null {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    console.log("[Telegram] No TELEGRAM_BOT_TOKEN set, skipping");
    return null;
  }

  const allowedUsers = (process.env.TELEGRAM_ALLOWED_USERS || "")
    .split(",")
    .map(s => parseInt(s.trim(), 10))
    .filter(n => !isNaN(n));

  if (allowedUsers.length === 0) {
    console.log("[Telegram] No TELEGRAM_ALLOWED_USERS set, skipping");
    return null;
  }

  const config: TelegramConfig = {
    botToken,
    allowedUsers,
    projectId: process.env.TELEGRAM_PROJECT_ID || "prj_2go5oq0sa9o-51985ca1",
    agent: process.env.TELEGRAM_AGENT || "leopard",
    providerId: (process.env.TELEGRAM_PROVIDER_ID || "anthropic-oauth") as ProviderId,
    boticalUserId: process.env.TELEGRAM_BOTICAL_USER_ID || "usr_mldu5ohe-94448ee0",
  };

  botInstance = new TelegramBot(config);
  botInstance.start();
  return botInstance;
}

/**
 * Stop the Telegram bot
 */
export function stopTelegramBot(): void {
  botInstance?.stop();
  botInstance = null;
}

/**
 * Get the running bot instance (for sending notifications)
 */
export function getTelegramBot(): TelegramBot | null {
  return botInstance;
}
