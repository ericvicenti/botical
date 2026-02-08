/**
 * Email Service
 *
 * Sends emails via SMTP in production, logs to console in development.
 * See: docs/knowledge-base/01-architecture.md
 *
 * Configuration:
 * - SMTP_HOST: SMTP server hostname
 * - SMTP_PORT: SMTP port (default: 465 for SMTPS)
 * - SMTP_USER: SMTP username
 * - SMTP_PASS: SMTP password
 * - EMAIL_FROM: From address for emails
 * - APP_URL: Base URL for magic links
 */

import { z } from "zod";
import * as net from "net";
import * as tls from "tls";

const EmailConfigSchema = z.object({
  smtpHost: z.string().optional(),
  smtpPort: z.coerce.number().default(465),
  smtpUser: z.string().optional(),
  smtpPass: z.string().optional(),
  fromEmail: z.string().default("noreply@botical.local"),
  appUrl: z.string().url().default("http://localhost:6001"),
});

type EmailConfig = z.infer<typeof EmailConfigSchema>;

/**
 * Minimal SMTP client for sending emails over TLS (SMTPS port 465).
 * No external dependencies required.
 */
async function sendSmtp(config: {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("SMTP connection timed out"));
    }, 30000);

    const socket = tls.connect(
      { host: config.host, port: config.port, rejectUnauthorized: false },
      () => {
        // connected
      }
    );

    let buffer = "";
    let step = 0;

    const boundary = `----=_Part_${Date.now().toString(36)}`;
    const message = [
      `From: ${config.from}`,
      `To: ${config.to}`,
      `Subject: ${config.subject}`,
      `MIME-Version: 1.0`,
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      ``,
      `--${boundary}`,
      `Content-Type: text/plain; charset=utf-8`,
      `Content-Transfer-Encoding: 7bit`,
      ``,
      config.text,
      ``,
      `--${boundary}`,
      `Content-Type: text/html; charset=utf-8`,
      `Content-Transfer-Encoding: 7bit`,
      ``,
      config.html,
      ``,
      `--${boundary}--`,
    ].join("\r\n");

    const steps = [
      // 0: greeting → EHLO
      () => socket.write(`EHLO botical\r\n`),
      // 1: EHLO response → AUTH LOGIN
      () => socket.write(`AUTH LOGIN\r\n`),
      // 2: username prompt → send username
      () => socket.write(Buffer.from(config.user).toString("base64") + "\r\n"),
      // 3: password prompt → send password
      () => socket.write(Buffer.from(config.pass).toString("base64") + "\r\n"),
      // 4: auth success → MAIL FROM
      () => socket.write(`MAIL FROM:<${config.from}>\r\n`),
      // 5: MAIL FROM ok → RCPT TO
      () => socket.write(`RCPT TO:<${config.to}>\r\n`),
      // 6: RCPT TO ok → DATA
      () => socket.write(`DATA\r\n`),
      // 7: DATA ready → send message
      () => socket.write(message + "\r\n.\r\n"),
      // 8: message accepted → QUIT
      () => {
        socket.write(`QUIT\r\n`);
        clearTimeout(timeout);
        resolve();
      },
    ];

    socket.on("data", (data) => {
      buffer += data.toString();
      const lines = buffer.split("\r\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line) continue;
        const code = parseInt(line.substring(0, 3));

        // Multi-line responses (e.g., 250-STARTTLS) - wait for final line
        if (line[3] === "-") continue;

        // Check for errors
        if (code >= 400) {
          clearTimeout(timeout);
          socket.destroy();
          reject(new Error(`SMTP error at step ${step}: ${line}`));
          return;
        }

        if (step < steps.length) {
          steps[step]();
          step++;
        }
      }
    });

    socket.on("error", (err) => {
      clearTimeout(timeout);
      reject(new Error(`SMTP connection error: ${err.message}`));
    });

    socket.on("close", () => {
      clearTimeout(timeout);
    });
  });
}

/**
 * Email Service for sending transactional emails
 *
 * In development mode (no SMTP configured), magic links are logged to console.
 * In production mode, emails are sent via SMTP.
 */
class EmailServiceClass {
  private config: EmailConfig | null = null;

  /**
   * Get or initialize configuration
   */
  private getConfig(): EmailConfig {
    if (!this.config) {
      this.config = EmailConfigSchema.parse({
        smtpHost: process.env.SMTP_HOST,
        smtpPort: process.env.SMTP_PORT,
        smtpUser: process.env.SMTP_USER,
        smtpPass: process.env.SMTP_PASS,
        fromEmail: process.env.EMAIL_FROM,
        appUrl: process.env.APP_URL,
      });
    }
    return this.config;
  }

  /**
   * Check if running in dev mode (no email provider configured)
   */
  isDevMode(): boolean {
    const config = this.getConfig();
    return !config.smtpHost;
  }

  /**
   * Get the app URL for building links
   */
  getAppUrl(): string {
    return this.getConfig().appUrl;
  }

  /**
   * Send an email via SMTP or log to console in dev mode
   */
  private async sendEmail(to: string, subject: string, html: string, text: string): Promise<void> {
    const config = this.getConfig();

    if (!config.smtpHost || !config.smtpUser || !config.smtpPass) {
      console.log("\n========================================");
      console.log("EMAIL (dev mode)");
      console.log(`To: ${to}`);
      console.log(`Subject: ${subject}`);
      console.log("--------");
      console.log(text);
      console.log("========================================\n");
      return;
    }

    await sendSmtp({
      host: config.smtpHost,
      port: config.smtpPort,
      user: config.smtpUser,
      pass: config.smtpPass,
      from: config.fromEmail,
      to,
      subject,
      html,
      text,
    });
  }

  /**
   * Send a magic link email for authentication
   */
  async sendMagicLink(email: string, token: string): Promise<void> {
    const config = this.getConfig();
    const magicLink = `${config.appUrl}/auth/verify?token=${token}`;

    if (this.isDevMode()) {
      console.log("\n========================================");
      console.log("MAGIC LINK (dev mode)");
      console.log(`Email: ${email}`);
      console.log(`Link: ${magicLink}`);
      console.log("========================================\n");
      return;
    }

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px 20px; background: #f5f5f5;">
  <div style="max-width: 480px; margin: 0 auto; background: white; border-radius: 8px; padding: 40px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
    <h1 style="margin: 0 0 24px; font-size: 24px; color: #111;">Login to Botical</h1>
    <p style="margin: 0 0 24px; color: #444; line-height: 1.5;">
      Click the button below to log in to your Botical account. This link will expire in 15 minutes.
    </p>
    <a href="${magicLink}" style="display: inline-block; padding: 12px 24px; background: #111; color: white; text-decoration: none; border-radius: 6px; font-weight: 500;">
      Log in to Botical
    </a>
    <p style="margin: 24px 0 0; color: #888; font-size: 14px; line-height: 1.5;">
      If you didn't request this email, you can safely ignore it.
    </p>
  </div>
</body>
</html>`.trim();

    const text = `Login to Botical\n\nClick this link to log in: ${magicLink}\n\nThis link expires in 15 minutes.\n\nIf you didn't request this, ignore this email.`;

    await this.sendEmail(email, "Your Botical Login Link", html, text);
  }

  /**
   * Send a generic email
   */
  async send(to: string, subject: string, html: string, text: string): Promise<void> {
    await this.sendEmail(to, subject, html, text);
  }
}

export const EmailService = new EmailServiceClass();
