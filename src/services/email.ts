/**
 * Email Service
 *
 * Sends emails via Resend API in production, logs to console in development.
 * Uses Resend for reliable delivery (good IP reputation with Gmail etc).
 * Stalwart handles inbound email only.
 *
 * Configuration:
 * - RESEND_API_KEY: Resend API key (required for production)
 * - EMAIL_FROM: From address for emails
 * - APP_URL: Base URL for magic links
 */

import { z } from "zod";

const EmailConfigSchema = z.object({
  resendApiKey: z.string().optional(),
  fromEmail: z.string().default("noreply@botical.local"),
  appUrl: z.string().url().default("http://localhost:6001"),
});

type EmailConfig = z.infer<typeof EmailConfigSchema>;

/**
 * Email Service for sending transactional emails
 *
 * In development mode (no RESEND_API_KEY), magic links are logged to console.
 * In production mode, emails are sent via Resend API (good deliverability).
 */
class EmailServiceClass {
  private config: EmailConfig | null = null;

  private getConfig(): EmailConfig {
    if (!this.config) {
      this.config = EmailConfigSchema.parse({
        resendApiKey: process.env.RESEND_API_KEY,
        fromEmail: process.env.EMAIL_FROM,
        appUrl: process.env.APP_URL,
      });
    }
    return this.config;
  }

  isDevMode(): boolean {
    return !this.getConfig().resendApiKey;
  }

  getAppUrl(): string {
    return this.getConfig().appUrl;
  }

  async sendMagicLink(email: string, token: string): Promise<void> {
    const config = this.getConfig();
    const magicLink = `${config.appUrl}/auth/verify?token=${token}`;

    if (!config.resendApiKey) {
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

    await this.sendViaResend(email, "Your Botical Login Link", html, text);
  }

  async send(to: string, subject: string, html: string, text: string): Promise<void> {
    const config = this.getConfig();

    if (!config.resendApiKey) {
      console.log("\n========================================");
      console.log("EMAIL (dev mode)");
      console.log(`To: ${to}`);
      console.log(`Subject: ${subject}`);
      console.log("--------");
      console.log(text);
      console.log("========================================\n");
      return;
    }

    await this.sendViaResend(to, subject, html, text);
  }

  private async sendViaResend(to: string, subject: string, html: string, text: string): Promise<void> {
    const config = this.getConfig();

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: config.fromEmail,
        to,
        subject,
        html,
        text,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Failed to send email: ${response.status} ${response.statusText} - ${errorBody}`);
    }
  }
}

export const EmailService = new EmailServiceClass();
