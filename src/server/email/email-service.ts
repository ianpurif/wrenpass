import "server-only";

import nodemailer, { type SendMailOptions } from "nodemailer";
import { z } from "zod";

import { getServerEnv } from "@/server/env";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface MailTransport {
  verify(): Promise<true>;
  sendMail(options: SendMailOptions): Promise<{ messageId: string }>;
}

const notificationEmailInputSchema = z.object({
  to: z.email(),
  subject: z.string().trim().min(1).max(160),
  heading: z.string().trim().min(1).max(160),
  body: z.string().trim().min(1).max(5_000),
});

export function resolveSenderAddress(configuredFrom: string, smtpUser: string): string {
  if (z.email().safeParse(configuredFrom).success) {
    return configuredFrom;
  }

  const mailboxMatch = configuredFrom.match(/^(.+?)\s*<([^<>]+)>$/);
  if (mailboxMatch) {
    z.email().parse(mailboxMatch[2]?.trim());
    return configuredFrom;
  }

  if (!/^[\p{L}\p{N} ._'&-]+$/u.test(configuredFrom)) {
    throw new Error("EMAIL_FROM must be an email address or a safe display name");
  }

  return `${configuredFrom} <${smtpUser}>`;
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[character] ?? character,
  );
}

export function buildNotificationEmail(input: {
  to: string;
  subject: string;
  heading: string;
  body: string;
}): EmailMessage {
  const validated = notificationEmailInputSchema.parse(input);
  const safeHeading = escapeHtml(validated.heading);
  const safeBody = escapeHtml(validated.body);

  return {
    to: validated.to,
    subject: validated.subject,
    text: `${validated.heading}\n\n${validated.body}\n\n— WrenPass`,
    html: `<!doctype html><html lang="en"><body style="margin:0;background:#fbfaf6;color:#17241f;font-family:Arial,sans-serif"><main style="max-width:560px;margin:0 auto;padding:32px 20px"><div style="background:#ffffff;border:1px solid #dfe5df;border-radius:20px;padding:28px"><p style="margin:0 0 18px;color:#236347;font-size:14px;font-weight:700">WrenPass</p><h1 style="margin:0;font-size:24px;line-height:1.25">${safeHeading}</h1><p style="margin:16px 0 0;color:#5c6963;font-size:16px;line-height:1.7">${safeBody}</p></div></main></body></html>`,
  };
}

export class EmailService {
  constructor(
    private readonly transport: MailTransport,
    private readonly from: string,
  ) {}

  async verifyConnection(): Promise<void> {
    await this.transport.verify();
  }

  async send(message: EmailMessage): Promise<string> {
    const result = await this.transport.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      disableFileAccess: true,
      disableUrlAccess: true,
    });

    return result.messageId;
  }
}

export function createEmailService(): EmailService {
  const env = getServerEnv();
  const transport = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user: env.GMAIL_SMTP_USER,
      pass: env.GMAIL_SMTP_APP_PASSWORD,
    },
    tls: {
      minVersion: "TLSv1.2",
    },
  });

  return new EmailService(
    transport,
    resolveSenderAddress(env.EMAIL_FROM, env.GMAIL_SMTP_USER),
  );
}
