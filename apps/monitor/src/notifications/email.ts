import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../config/env.js";
import type { NotificationProvider, SlotAlertPayload, SystemAlertPayload } from "../types.js";
import { confirmedSlotEmailHtml, possibleSlotMessage, slotClosedMessage, systemAlertMessage } from "./templates.js";

/**
 * Generic transactional-email interface. Supports either:
 *  - Resend HTTP API (if RESEND_API_KEY is set), or
 *  - Any standard SMTP provider via nodemailer (Proton Bridge, Gmail, etc.)
 * Requirement #11: not tied to Proton SMTP specifically.
 *
 * Email is the sole notification channel — Telegram was removed at the
 * user's request. This is still the "fast path" channel referred to
 * elsewhere (requirement #34): it fires immediately on a confirmed slot,
 * ahead of secondary bookkeeping like history/dashboard updates.
 */
export class EmailNotifier implements NotificationProvider {
  name = "email";
  private transporter: Transporter | null = null;

  private get useResend(): boolean {
    return Boolean(env.resendApiKey);
  }

  get configured(): boolean {
    if (!env.alertEmail) return false;
    return this.useResend || Boolean(env.smtpHost && env.smtpUser);
  }

  private getTransporter(): Transporter {
    if (!this.transporter) {
      this.transporter = nodemailer.createTransport({
        host: env.smtpHost,
        port: env.smtpPort,
        secure: env.smtpSecure,
        auth: env.smtpUser ? { user: env.smtpUser, pass: env.smtpPassword } : undefined,
      });
    }
    return this.transporter;
  }

  async sendSlotAlert(payload: SlotAlertPayload): Promise<boolean> {
    if (!this.configured) return false;
    return this.sendEmail(
      "🚨 Slovakia D Study Visa Slot Open — Delhi",
      confirmedSlotEmailHtml(payload),
    );
  }

  async sendPossibleSlotAlert(payload: SlotAlertPayload): Promise<boolean> {
    if (!this.configured) return false;
    return this.sendEmail(
      "⚠️ Possible Slovakia D Study Visa Slot — Verify Now",
      `<pre style="white-space:pre-wrap;font-family:sans-serif;">${possibleSlotMessage(payload)}</pre>`,
    );
  }

  async sendSlotClosedAlert(payload: SlotAlertPayload): Promise<boolean> {
    if (!this.configured) return false;
    return this.sendEmail(
      "🔴 Slovakia D Study Visa Slot Closed",
      `<pre style="white-space:pre-wrap;font-family:sans-serif;">${slotClosedMessage(payload)}</pre>`,
    );
  }

  async sendSystemAlert(payload: SystemAlertPayload): Promise<boolean> {
    if (!this.configured) return false;
    return this.sendEmail(`[Slovakia Visa Alert] ${payload.title}`, `<pre style="white-space:pre-wrap;font-family:sans-serif;">${systemAlertMessage(payload)}</pre>`);
  }

  private async sendEmail(subject: string, html: string): Promise<boolean> {
    try {
      if (this.useResend) {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            authorization: `Bearer ${env.resendApiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            from: env.smtpFrom,
            to: [env.alertEmail],
            subject,
            html,
          }),
        });
        return res.ok;
      }

      await this.getTransporter().sendMail({
        from: env.smtpFrom,
        to: env.alertEmail,
        subject,
        html,
      });
      return true;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[email] send error:", err instanceof Error ? err.message : err);
      return false;
    }
  }
}
