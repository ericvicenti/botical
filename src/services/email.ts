/**
 * Email Service
 *
 * Sends emails via:
 * 1. SMTP (nodemailer) if SMTP_HOST is configured
 * 2. Resend API if RESEND_API_KEY is configured
 * 3. Console logging in dev mode (neither configured)
 */

import { z } from "zod";
import nodemailer from "nodemailer";

const EmailConfigSchema = z.object({
  resendApiKey: z.string().optional(),
  smtpHost: z.string().optional(),
  smtpPort: z.coerce.number().optional().default(465),
  smtpUser: z.string().optional(),
  smtpPass: z.string().optional(),
  fromEmail: z.string().default("noreply@botical.local"),
  appUrl: z.string().url().default("http://localhost:6001"),
});

type EmailConfig = z.infer<typeof EmailConfigSchema>;

class EmailServiceClass {
  private config: EmailConfig | null = null;
  private transporter: nodemailer.Transporter | null = null;

  private getConfig(): EmailConfig {
    if (!this.config) {
      this.config = EmailConfigSchema.parse({
        resendApiKey: process.env.RESEND_API_KEY,
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

  // For testing: reset cached config
  resetConfig(): void {
    this.config = null;
    this.transporter = null;
  }

  private getTransporter(): nodemailer.Transporter {
    if (!this.transporter) {
      const config = this.getConfig();
      this.transporter = nodemailer.createTransport({
        host: config.smtpHost,
        port: config.smtpPort,
        secure: config.smtpPort === 465,
        auth: config.smtpUser
          ? { user: config.smtpUser, pass: config.smtpPass }
          : undefined,
        tls: { rejectUnauthorized: false },
      });
    }
    return this.transporter;
  }

  isDevMode(): boolean {
    // Force dev mode during tests
    if (process.env.NODE_ENV === "test" || process.env.BUN_ENV === "test") {
      return true;
    }
    
    const config = this.getConfig();
    return !config.resendApiKey && !config.smtpHost;
  }

  getAppUrl(): string {
    return this.getConfig().appUrl;
  }

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

    await this.send(email, "Your Botical Login Link", html, text);
  }

  async send(to: string, subject: string, html: string, text: string): Promise<void> {
    const config = this.getConfig();

    if (this.isDevMode()) {
      console.log("\n========================================");
      console.log("EMAIL (dev mode)");
      console.log(`To: ${to}`);
      console.log(`Subject: ${subject}`);
      console.log("--------");
      console.log(text);
      console.log("========================================\n");
      return;
    }

    if (config.smtpHost) {
      await this.sendViaSMTP(to, subject, html, text);
    } else if (config.resendApiKey) {
      await this.sendViaResend(to, subject, html, text);
    }
  }

  private async sendViaSMTP(to: string, subject: string, html: string, text: string): Promise<void> {
    const config = this.getConfig();
    const transporter = this.getTransporter();

    await transporter.sendMail({
      from: config.fromEmail,
      to,
      subject,
      html,
      text,
    });
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
