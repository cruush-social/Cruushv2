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
const ONBOARDING_DRAFT_VERSION = 5;

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
    const previousStep = (parsed.version != null && parsed.version >= 2) || savedStep <= 4
      ? savedStep
      : savedStep - 1;
    // Version 3 moves Pronouns into Gender. Resume that combined step for
    // either old step, and shift each later rite back by one.
    const combinedGenderStep = (parsed.version != null && parsed.version >= 3) || previousStep <= 1
      ? previousStep
      : previousStep - 1;
    // Version 4 removes badge selection at index 6. Resume 2FA for that
    // removed step and keep later drafts on their corresponding rite.
    const badgeStepRemoved = (parsed.version != null && parsed.version >= 4) || combinedGenderStep <= 6
      ? combinedGenderStep
      : combinedGenderStep - 1;
    // Version 5 removes Bio/Signal at index 4 and Role/Position at index 5.
    // Either removed rite and the old 2FA index continue at 2FA; later rites
    // retain their meaning after shifting back by two positions.
    const step = (parsed.version != null && parsed.version >= 5) || badgeStepRemoved <= 4
      ? badgeStepRemoved
      : badgeStepRemoved <= 6
        ? 4
        : badgeStepRemoved - 2;
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
