import type { ProviderName, SlotState } from "../types.js";

const PAUSING_STATES: SlotState[] = ["HUMAN_ACTION_REQUIRED", "SESSION_EXPIRED"];

interface RuntimeState {
  paused: boolean;
  pauseReason?: SlotState;
  consecutiveFailures: number;
  lastErrorNotifiedAt?: number;
  lastState?: SlotState;
  recoveredNotifiedAt?: number;
}

/**
 * Tracks pause/resume + error-notification dedup per provider so we don't
 * spam email with the same failure every 30 seconds (requirement #37)
 * and so CAPTCHA/session-expiry correctly halts automated interaction with
 * just that provider (requirement #3/#7) without stopping the other one.
 */
export class ProviderRuntimeState {
  private state = new Map<ProviderName, RuntimeState>();

  private get(provider: ProviderName): RuntimeState {
    let s = this.state.get(provider);
    if (!s) {
      s = { paused: false, consecutiveFailures: 0 };
      this.state.set(provider, s);
    }
    return s;
  }

  isPaused(provider: ProviderName): boolean {
    return this.get(provider).paused;
  }

  pauseReason(provider: ProviderName): SlotState | undefined {
    return this.get(provider).pauseReason;
  }

  /** Returns true the first time this provider enters a pausing state (so caller sends one alert). */
  applyState(provider: ProviderName, state: SlotState): { shouldAlertPause: boolean; shouldAlertError: boolean; shouldAlertRecovery: boolean } {
    const s = this.get(provider);
    const wasPaused = s.paused;
    const wasFailing = s.consecutiveFailures >= 3;

    if (PAUSING_STATES.includes(state)) {
      s.paused = true;
      s.pauseReason = state;
      s.lastState = state;
      return { shouldAlertPause: !wasPaused, shouldAlertError: false, shouldAlertRecovery: false };
    }

    if (state === "ERROR" || state === "RATE_LIMITED" || state === "MAINTENANCE") {
      s.consecutiveFailures += 1;
      s.lastState = state;
      const nowFailing = s.consecutiveFailures >= 3;
      const shouldAlertError = nowFailing && !wasFailing;
      return { shouldAlertPause: false, shouldAlertError, shouldAlertRecovery: false };
    }

    // Healthy result — clear pause/failure state, notify recovery if we were down.
    const shouldAlertRecovery = wasPaused || wasFailing;
    s.paused = false;
    s.pauseReason = undefined;
    s.consecutiveFailures = 0;
    s.lastState = state;
    return { shouldAlertPause: false, shouldAlertError: false, shouldAlertRecovery };
  }

  /** Manual resume, e.g. after operator re-runs `npm run auth:bls`. */
  resume(provider: ProviderName): void {
    const s = this.get(provider);
    s.paused = false;
    s.pauseReason = undefined;
    s.consecutiveFailures = 0;
  }
}
