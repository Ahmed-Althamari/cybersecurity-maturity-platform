import { Injectable, Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';

export interface SendMailInput {
  to: string[];
  subject: string;
  text: string;
}

export interface SendMailResult {
  sent: boolean;
  reason?: string;
}

/**
 * Thin SMTP wrapper — SMTP_HOST/PORT/USER/PASS have existed in .env.example since Phase 1 marked
 * "for future use", with no code ever reading them. This is that code, kept deliberately
 * best-effort: every caller (see AssistantDigestService) treats a failed or unconfigured send as
 * "logged, not fatal" — the same convention as LlmSettingsService.recordUsage — so a tenant
 * without SMTP configured still gets full digest generation, just without the email leg.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  isConfigured(): boolean {
    return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
  }

  async send(input: SendMailInput): Promise<SendMailResult> {
    if (input.to.length === 0) {
      return { sent: false, reason: 'no_recipients' };
    }
    if (!this.isConfigured()) {
      this.logger.warn(`SMTP is not configured — skipping email "${input.subject}" to ${input.to.length} recipient(s).`);
      return { sent: false, reason: 'not_configured' };
    }

    try {
      const port = Number(process.env.SMTP_PORT) || 587;
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure: port === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });
      await transporter.sendMail({
        from: process.env.MAIL_FROM || process.env.SMTP_USER,
        to: input.to,
        subject: input.subject,
        text: input.text,
      });
      return { sent: true };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to send email "${input.subject}": ${reason}`);
      return { sent: false, reason };
    }
  }
}
