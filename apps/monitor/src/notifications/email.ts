import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../config/env.js";
import type { NotificationProvider, SlotAlertPayload, SystemAlertPayload, DigestProviderInfo } from "../types.js";
import { confirmedSlotEmailHtml, dailyDigestMessage, possibleSlotMessage, slotClosedMessage, systemAlertMessage } from "./templates.js";

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

  /** Explains why `configured` is false, for startup/diagnostic logging. */
  private explainUnconfigured(): string {
    if (!env.alertEmail) return "ALERT_EMAIL is not set";
    if (!this.useResend && !(env.smtpHost && env.smtpUser)) {
      return "neither RESEND_API_KEY nor SMTP_HOST+SMTP_USER are set";
    }
    return "unknown reason";
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
    return this.sendEmail(
      "🚨 Slovakia D Study Visa Slot Open — Delhi",
      confirmedSlotEmailHtml(payload),
    );
  }

  async sendPossibleSlotAlert(payload: SlotAlertPayload): Promise<boolean> {
    return this.sendEmail(
      "⚠️ Possible Slovakia D Study Visa Slot — Verify Now",
      `<pre style="white-space:pre-wrap;font-family:sans-serif;">${possibleSlotMessage(payload)}</pre>`,
    );
  }

  async sendSlotClosedAlert(payload: SlotAlertPayload): Promise<boolean> {
    return this.sendEmail(
      "🔴 Slovakia D Study Visa Slot Closed",
      `<pre style="white-space:pre-wrap;font-family:sans-serif;">${slotClosedMessage(payload)}</pre>`,
    );
  }

  async sendSystemAlert(payload: SystemAlertPayload): Promise<boolean> {
    return this.sendEmail(`[Slovakia Visa Alert] ${payload.title}`, `<pre style="white-space:pre-wrap;font-family:sans-serif;">${systemAlertMessage(payload)}</pre>`);
  }

  async sendDailyDigest(
    providers: DigestProviderInfo[],
    target: { region: string; category: string; visaType: string; purpose: string },
  ): Promise<boolean> {
    const anySlots = providers.some((p) => p.enabled && p.activeSlotCount > 0);
    const subject = anySlots
      ? `📊 Daily Status — Slots open (${providers.filter((p) => p.enabled && p.activeSlotCount > 0).map((p) => p.provider).join(", ")})`
      : "📊 Daily Status — Slovakia Visa Alert";
    return this.sendEmail(subject, `<pre style="white-space:pre-wrap;font-family:sans-serif;">${dailyDigestMessage(providers, target)}</pre>`);
  }

  private async sendEmail(subject: string, html: string): Promise<boolean> {
    if (!this.configured) {
      // eslint-disable-next-line no-console
      console.warn(`[email] SKIPPED "${subject}" — not configured: ${this.explainUnconfigured()}`);
      return false;
    }

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
        if (!res.ok) {
          const body = await res.text().catch(() => "<no body>");
          // eslint-disable-next-line no-console
          console.error(`[email] Resend rejected "${subject}" (HTTP ${res.status}) to ${env.alertEmail}: ${body}`);
          return false;
        }
        // eslint-disable-next-line no-console
        console.log(`[email] sent "${subject}" to ${env.alertEmail} via Resend`);
        return true;
      }

      await this.getTransporter().sendMail({
        from: env.smtpFrom,
        to: env.alertEmail,
        subject,
        html,
      });
      // eslint-disable-next-line no-console
      console.log(`[email] sent "${subject}" to ${env.alertEmail} via SMTP (${env.smtpHost})`);
      return true;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[email] send error for "${subject}" to ${env.alertEmail}:`, err instanceof Error ? err.message : err);
      return false;
    }
  }
}
