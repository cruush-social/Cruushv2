/**
 * Onboarding used to hold every answer in memory alone, so anything that
 * reloaded the tab sent people back to the first step with nothing kept. The
 * 2FA step is where that bit hardest, since setting up or skipping 2FA is
 * exactly where a session is most likely to bounce.
 *
 * The draft is a convenience, never a source of truth: the profile is only
 * real once the server has it. Every accessor swallows its own failure so a
 * private window or a full quota costs the restore and nothing else.
 */
const ONBOARDING_DRAFT_KEY = 'cruush:onboarding-draft';
const ONBOARDING_DRAFT_VERSION = 2;

export type OnboardingDraft<TProfile> = { step: number; profile: Partial<TProfile> };

export function readOnboardingDraft<TProfile>(): OnboardingDraft<TProfile> | null {
  try {
    const raw = window.localStorage.getItem(ONBOARDING_DRAFT_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<OnboardingDraft<TProfile>> & { version?: number };
    if (!parsed || typeof parsed !== 'object' || typeof parsed.profile !== 'object' || !parsed.profile) {
      return null;
    }

    const savedStep = typeof parsed.step === 'number' ? parsed.step : 0;
    // Version 1 included Looking for at index 4. Preserve the current rite
    // after removing it; a draft on that removed rite continues with Vibes.
    const step = parsed.version === ONBOARDING_DRAFT_VERSION || savedStep <= 4
      ? savedStep
      : savedStep - 1;
    return { step, profile: parsed.profile };
  } catch {
    return null;
  }
}

export function writeOnboardingDraft<TProfile>(draft: OnboardingDraft<TProfile>) {
  try {
    window.localStorage.setItem(ONBOARDING_DRAFT_KEY, JSON.stringify({ ...draft, version: ONBOARDING_DRAFT_VERSION }));
  } catch {
    // Onboarding still works without a draft.
  }
}

/**
 * Called when onboarding finishes and again on sign-out, so a half-finished
 * flow can never reappear inside somebody else's session on a shared browser.
 */
export function clearOnboardingDraft() {
  try {
    window.localStorage.removeItem(ONBOARDING_DRAFT_KEY);
  } catch {
    // Nothing to recover.
  }
}
