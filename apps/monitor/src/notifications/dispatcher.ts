import { EmailNotifier } from "./email.js";
import type { SlotAlertPayload, SystemAlertPayload, DigestProviderInfo } from "../types.js";
import { env } from "../config/env.js";
import type { VisaAlertDatabase } from "../database/db.js";

export interface DispatchResult {
  emailOk: boolean;
  internalNotificationLatencyMs: number;
}

/**
 * Fast-path dispatcher — requirement #34. Email is the sole notification
 * channel (Telegram was removed at the user's request) and fires
 * immediately on a confirmed slot, ahead of any secondary bookkeeping.
 */
export class NotificationDispatcher {
  email = new EmailNotifier();

  constructor(private db: VisaAlertDatabase) {}

  async dispatchConfirmedSlot(payload: SlotAlertPayload, slotId: number): Promise<DispatchResult> {
    const notificationStartedAt = Date.now();

    const emailOk = await this.email.sendSlotAlert(payload);
    const notificationSentAt = Date.now();
    const internalNotificationLatencyMs = notificationSentAt - notificationStartedAt;

    if (env.debugMonitor) {
      // eslint-disable-next-line no-console
      console.log(`[dispatch] internalNotificationLatencyMs=${internalNotificationLatencyMs}`);
    }

    this.db.recordAlert(slotId, "email", new Date(notificationSentAt).toISOString(), emailOk, undefined, internalNotificationLatencyMs);

    return { emailOk, internalNotificationLatencyMs };
  }

  async dispatchPossibleSlot(payload: SlotAlertPayload): Promise<void> {
    if (!env.systemAlertsEnabled) return;
    await this.email.sendPossibleSlotAlert(payload);
  }

  async dispatchSlotClosed(payload: SlotAlertPayload): Promise<void> {
    await this.email.sendSlotClosedAlert(payload);
  }

  async dispatchSystemAlert(payload: SystemAlertPayload): Promise<void> {
    // Always recorded (dashboard/logs/digest all read this), but only
    // emailed when SYSTEM_ALERTS_ENABLED=true — see env.ts for why this
    // defaults to off. Confirmed slot alerts never go through this path.
    this.db.recordSystemEvent(payload.severity, payload.message);
    if (!env.systemAlertsEnabled) return;
    await this.email.sendSystemAlert(payload);
  }

  async dispatchDailyDigest(
    providers: DigestProviderInfo[],
    target: { region: string; category: string; visaType: string; purpose: string },
  ): Promise<void> {
    await this.email.sendDailyDigest(providers, target);
  }
}
