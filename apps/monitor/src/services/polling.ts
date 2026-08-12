import { env } from "../config/env.js";
import type { SlotState } from "../types.js";

/**
 * Adaptive polling policy — requirement #4.
 *  - normal: configured interval +/- jitter
 *  - transient errors (ERROR, MAINTENANCE): exponential backoff
 *  - RATE_LIMITED (403/429): significantly slower, capped high
 *  - HUMAN_ACTION_REQUIRED / SESSION_EXPIRED: provider pauses entirely
 *    (the monitor loop is responsible for pausing, not this module)
 */
export class AdaptivePoller {
  private consecutiveErrors = 0;
  private consecutiveRateLimits = 0;

  recordResult(state: SlotState): void {
    if (state === "ERROR" || state === "MAINTENANCE") {
      this.consecutiveErrors += 1;
      this.consecutiveRateLimits = 0;
    } else if (state === "RATE_LIMITED") {
      this.consecutiveRateLimits += 1;
      this.consecutiveErrors = 0;
    } else {
      this.consecutiveErrors = 0;
      this.consecutiveRateLimits = 0;
    }
  }

  /** Base interval in seconds before jitter, given current backoff state. */
  private baseIntervalSeconds(): number {
    const configured = env.checkIntervalSeconds;

    if (this.consecutiveRateLimits > 0) {
      // Rate limiting: back off hard — never race a server telling us to slow down.
      const backedOff = configured * Math.pow(3, Math.min(this.consecutiveRateLimits, 4));
      return Math.min(backedOff, 30 * 60); // cap at 30 minutes
    }

    if (this.consecutiveErrors > 0) {
      // Transient errors: standard exponential backoff.
      const backedOff = configured * Math.pow(2, Math.min(this.consecutiveErrors, 6));
      return Math.min(backedOff, 15 * 60); // cap at 15 minutes
    }

    return configured;
  }

  /** Next sleep duration in milliseconds, with +/- jitter applied. */
  nextDelayMs(): number {
    const baseSeconds = this.baseIntervalSeconds();
    const jitterFraction = env.checkJitterPercent / 100;
    const jitter = baseSeconds * jitterFraction * (Math.random() * 2 - 1);
    const finalSeconds = Math.max(1, baseSeconds + jitter);
    return Math.round(finalSeconds * 1000);
  }

  get isBackingOff(): boolean {
    return this.consecutiveErrors > 0 || this.consecutiveRateLimits > 0;
  }

  reset(): void {
    this.consecutiveErrors = 0;
    this.consecutiveRateLimits = 0;
  }
}
