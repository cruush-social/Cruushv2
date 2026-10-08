# First-Entry Install and Push Prompts Implementation Plan

**Goal:** Increase engagement by showing each eligible signed-in member two compact, sequential, one-time prompts: install cruush, then enable push notifications.

**Architecture:** Keep the existing PWA install capture, push subscription API, Settings fallbacks, and exclusive popup queue. Refactor the existing install prompt into the same compact modal shell used by a new push-permission prompt, make both account-and-browser scoped, and let the queue show only one at a time. Browser permission APIs remain behind explicit button taps.

**Tech Stack:** React 18, TypeScript, Radix Dialog, Tailwind/theme CSS, Vitest, Testing Library, existing service worker and Web Push helpers.

**Estimated Time:** 16 tasks × 5 minutes = 80 minutes, plus rendered browser verification.

---

## Prerequisites

- [x] Work from `/Volumes/good/cruush-first-entry-prompts-plan-20261008`.
- [x] Confirm `git rev-parse HEAD` is production SHA `2bbe72fd2b7835d5de0d64231b1006c5f8637619`.
- [x] Read `AGENTS.md`, `HANDOFF.md`, `docs/CRUUSH-RULES.md`, `DESIGN_DECISIONS.md`, and `docs/design-master.md`.
- [x] Julien approved implementation and the proposed copy with: "okay implement plan".
- [x] Record the implementation turn's exact UI scope and starting state in that turn's `.ai-queues/<session-id>.md` before editing. Production was signed out, so no authenticated production prompt was available to capture.
- [x] Use the existing dependencies. Install no package and add no environment variable.

## Recommended Product Decisions

1. **Meaning of first entry:** the first eligible signed-in app-shell entry on a browser after this feature ships. It includes existing members once, not only newly created accounts.
2. **Eligibility boundary:** wait until the member is verified, has completed onboarding and the Code of Conduct gate, and reaches the normal signed-in app shell. Do not show either prompt on sign-in, signup, email verification, onboarding, admin onboarding replay, or public routes.
3. **Order:** install first, push second. Both join the existing exclusive popup queue, so they never stack with each other or with the DL Mode or Pulse notices.
4. **Platform rule:**
   - Installed/standalone app: skip install; offer push if the browser permission is still `default` and push is supported.
   - iPhone/iPad browser: show install instructions first. Do not offer push until cruush is reopened from the Home Screen, because the current push helper requires the installed/service-worker context.
   - Android/mobile browser with `beforeinstallprompt`: invoke the native install prompt only from the `Install cruush` tap. After install resolves or the member chooses `Not now`, the queue may show push if supported.
   - Unsupported browser: skip the unsupported prompt. Core cruush use remains available.
5. **Frequency:** once per member per browser/device for each explanatory prompt. `Not now`, closing, accepting, or a browser denial marks that prompt handled. Settings remains the permanent manual path.
6. **No surprise permission request:** remove the current automatic `enablePushNotifications()` call at onboarding completion and the install-success call that immediately requests push. The system notification permission prompt is shown only after `Enable notifications` is tapped.
7. **No required installation:** install and push remain optional. Declining either cannot block the map or any core feature.

## Proposed Copy for Approval

No copy below is authorized for implementation until Julien approves it.

### Install prompt

- Title: `Install cruush`
- Browser-install body: `Add cruush to your Home Screen.`
- iPhone/iPad body: `Use Safari Share, then Add to Home Screen.`
- Primary button: `Install cruush` (or `Got it` for manual iOS instructions)
- Secondary button: `Not now`

### Push prompt

- Title: `Enable notifications`
- Body: `Get alerts for cruushes, messages, and activity.`
- Primary button: `Enable notifications`
- Secondary button: `Not now`

If different wording is wanted, change only these strings. Do not add another tagline, helper paragraph, or benefits list.

## Geometry Contract

The two prompts use one shared compact surface and identical geometry.

- Width: `min(22rem, calc(100vw - 2rem - env(safe-area-inset-left) - env(safe-area-inset-right)))`.
- Position: centered inside the actual visible app area above the bottom navigation, not inside a page's scrolling content.
- Maximum height: `calc(100dvh - var(--cruush-nav-clearance, 6rem) - 2rem - env(safe-area-inset-top) - env(safe-area-inset-bottom))`.
- Internal padding: exactly `1rem` (16px). No 100px+ padding, spacer, min-height, or empty reserved band.
- Internal gaps: existing `gap-2`/`gap-3`/`gap-4` values only.
- Buttons: minimum 44px touch height; stack only when the available width cannot hold both labels.
- Overflow: the surface may scroll vertically only if dynamic text scaling makes its content exceed the computed maximum height. The title and action buttons must remain reachable.
- Safe areas: top, left, right, bottom, browser chrome, and the measured bottom-nav clearance are included in the constraint.
- Z-order: above the page/map and bottom navigation, below the bug reporter. The exclusive queue prevents another intro prompt from opening over it.
- Presentation to preserve: current dark card, border, icon/title/body/action hierarchy, cruush-gradient primary action, bordered secondary action, existing colors, radius, and shadow. This plan does not authorize a redesign.

## Allowed Implementation Files

Only these product files may change during implementation:

- Modify `src/app/App.tsx`: pass the signed-in member ID to the install prompt and mount the push prompt in the same app-shell location.
- Modify `src/app/components/ProfileOnboarding.tsx`: remove only the automatic push-permission request and its now-unused import.
- Modify `src/app/components/ProfileOnboarding.test.tsx`: prove onboarding completion no longer requests browser notification permission.
- Modify `src/app/components/MobileInstallPrompt.tsx`: account-scoped handled key, compact shared surface, standalone/platform eligibility, and removal of install-to-push coupling.
- Modify `src/app/components/MobileInstallPrompt.test.tsx`: install eligibility, account isolation, ordering signal, dismissal, iOS/manual, standalone, and viewport classes.
- Create `src/app/components/PushPermissionPrompt.tsx`: explicit push explainer and button-driven call to the existing push helper.
- Create `src/app/components/PushPermissionPrompt.test.tsx`: permission/support/preference/dismissal/error/queue tests.
- Create `src/app/components/FirstEntryPromptSurface.tsx`: shared compact UI shell only.
- Create `src/app/components/FirstEntryPromptSurface.test.tsx`: accessible naming and constrained geometry contract.
- Modify `src/app/lib/popupQueue.ts`: add `push-permission` immediately after `mobile-install` and before `pulse-gesture`.
- Modify `src/app/lib/popupQueue.test.tsx`: prove install wins, push follows, and only one prompt renders.
- Modify `src/styles/theme.css`: add only the `.cruush-first-entry-prompt` viewport/safe-area rule and the narrow selector exemptions it needs from global full-screen/map dialog positioning.
- Modify `src/app/App.test.tsx`: prove prompts mount only in the completed signed-in app shell with the current member ID.
- Modify `DESIGN_DECISIONS.md`: retain the already-recorded October 8 prompt rule if implementation details require a short clarification; do not add unrelated decisions.
- Modify `.ai-queues/<implementation-session-id>.md`: task-owned scope and proof record.

No server, SQL, manifest, service worker, notification delivery, Settings, analytics, dependency, environment, or other UI file is allowed without a new explicit approval.

## Explicit Non-Goals

- Do not change notification categories, Site reminders, quiet hours, notification text, or delivery cadence.
- Do not change the PWA manifest, icons, start URL, service worker release, or install assets unless verification proves an existing defect and Julien separately approves it.
- Do not add PostHog or other analytics events in this slice.
- Do not revive the removed tutorial, first Feed post prompt, affiliate popup, or any other onboarding prompt.
- Do not add banners, toasts, badges, celebration, animation, glow, or a third prompt.
- Do not alter Settings' existing `Install cruush` or `Enable push` recovery paths.
- Do not require either permission for core use.

---

## Task 1: Capture the starting UI and exact scope

**Files:**
- Modify: `.ai-queues/<implementation-session-id>.md`

**Step 1: Record the authorization**

Quote the approved request and this plan. List the exact allowed product/test files above and state that all other presentation is preserved.

**Step 2: Capture starting state**

Render production and the untouched local base at 375×667, 390×844, 430×932, and 1440×900. Capture the current install card when possible and record its bounding rectangle, computed padding, bottom-nav rectangle, and bug-control rectangle.

**Step 3: Confirm scope**

Expected: no task-owned product diff exists before implementation.

---

## Task 2: Add the push slot to the popup queue

**Files:**
- Modify: `src/app/lib/popupQueue.ts`
- Test: `src/app/lib/popupQueue.test.tsx`

**Step 1: Write the failing test**

```tsx
it('shows install before push and hands the slot to push', () => {
  const view = render(
    <>
      <Prompt id="mobile-install" wants />
      <Prompt id="push-permission" wants />
    </>,
  );
  expect(screen.getByTestId('mobile-install')).toBeInTheDocument();
  expect(screen.queryByTestId('push-permission')).not.toBeInTheDocument();

  view.rerender(
    <>
      <Prompt id="mobile-install" wants={false} />
      <Prompt id="push-permission" wants />
    </>,
  );
  expect(screen.getByTestId('push-permission')).toBeInTheDocument();
});
```

**Step 2: Run the focused test and see it fail**

```bash
pnpm vitest run src/app/lib/popupQueue.test.tsx
```

Expected: TypeScript rejects `push-permission` because it is not yet an `ExclusivePopupId`.

**Step 3: Add the minimal slot**

```ts
const PRIORITY = [
  'map-tutorial',
  'dl-mode-default',
  'first-feed-post',
  'mobile-install',
  'push-permission',
  'pulse-gesture',
] as const;
```

**Step 4: Run the focused test**

Expected: the queue test passes and renders only one prompt.

---

## Task 3: Build the shared compact prompt surface

**Files:**
- Create: `src/app/components/FirstEntryPromptSurface.tsx`
- Create: `src/app/components/FirstEntryPromptSurface.test.tsx`
- Modify: `src/styles/theme.css`

**Step 1: Write the failing surface test**

```tsx
it('uses the compact viewport-constrained first-entry frame', () => {
  render(
    <FirstEntryPromptSurface
      open
      icon={<span aria-hidden="true" />}
      title="Install cruush"
      description="Add cruush to your Home Screen."
      primary={<button type="button">Install cruush</button>}
      secondary={<button type="button">Not now</button>}
      onDismiss={() => undefined}
    />,
  );

  const dialog = screen.getByRole('dialog', { name: 'Install cruush' });
  expect(dialog).toHaveClass('cruush-first-entry-prompt', 'p-4');
  expect(dialog).toHaveAttribute('data-dialog-framing', 'first-entry');
});
```

**Step 2: Implement the shared shell**

```tsx
import type { ReactNode } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';

type Props = {
  open: boolean;
  icon: ReactNode;
  title: string;
  description: string;
  primary: ReactNode;
  secondary: ReactNode;
  onDismiss: () => void;
  testId: string;
};

export default function FirstEntryPromptSurface(props: Props) {
  return (
    <Dialog open={props.open} onOpenChange={(open) => { if (!open) props.onDismiss(); }}>
      <DialogContent
        floating
        data-dialog-framing="first-entry"
        data-testid={props.testId}
        className="cruush-first-entry-prompt max-w-[22rem] gap-4 overflow-y-auto rounded-2xl border-white/10 bg-card/95 p-4"
      >
        <DialogHeader bugButton={false} className="gap-2 text-left">
          {props.icon}
          <DialogTitle>{props.title}</DialogTitle>
          <DialogDescription>{props.description}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          {props.secondary}
          {props.primary}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

**Step 3: Add the scoped geometry rule**

```css
.cruush-first-entry-prompt {
  position: fixed !important;
  inset: auto !important;
  top: calc((100dvh - var(--cruush-nav-clearance, 6rem)) / 2) !important;
  left: 50% !important;
  width: min(
    22rem,
    calc(100vw - 2rem - env(safe-area-inset-left) - env(safe-area-inset-right))
  ) !important;
  height: auto !important;
  max-height: calc(
    100dvh - var(--cruush-nav-clearance, 6rem) - 2rem -
    env(safe-area-inset-top) - env(safe-area-inset-bottom)
  ) !important;
  transform: translate(-50%, -50%) !important;
}
```

Add `.cruush-first-entry-prompt` exclusions to only the global selectors that currently force all dialogs to full-screen or offset all map dialogs. Do not change the default behavior of any other dialog.

**Step 4: Run the focused test**

```bash
pnpm vitest run src/app/components/FirstEntryPromptSurface.test.tsx
```

Expected: accessible dialog name and compact classes pass.

---

## Task 4: Make install state account-and-browser scoped

**Files:**
- Modify: `src/app/components/MobileInstallPrompt.tsx`
- Test: `src/app/components/MobileInstallPrompt.test.tsx`

**Step 1: Add a failing key test**

```tsx
expect(installPromptHandledKey('member-1')).toBe('cruush:first-entry-install:v1:member-1');
expect(installPromptHandledKey('member-2')).not.toBe(installPromptHandledKey('member-1'));
```

**Step 2: Add the exported key helper**

```ts
const INSTALL_PROMPT_VERSION = 'v1';

export function installPromptHandledKey(userId: string) {
  return `cruush:first-entry-install:${INSTALL_PROMPT_VERSION}:${userId}`;
}
```

**Step 3: Replace the global dismissal check**

Change `MobileInstallPrompt` to accept `{ userId: string }` and read/write only `installPromptHandledKey(userId)`. Do not clear the key at logout; it describes this account on this browser.

**Step 4: Run the focused install tests**

Expected: one account's dismissal does not hide the prompt for another account.

---

## Task 5: Convert install to the compact shared surface

**Files:**
- Modify: `src/app/components/MobileInstallPrompt.tsx`
- Test: `src/app/components/MobileInstallPrompt.test.tsx`

**Step 1: Write failing presentation assertions**

Assert that the prompt has role `dialog`, accessible name `Install cruush`, the shared `cruush-first-entry-prompt` class, `p-4`, and no old fixed bottom-card classes (`bottom-24`, `right-[4.5rem]`).

**Step 2: Render `FirstEntryPromptSurface`**

Keep the existing Download icon, dark surface, existing radius/border/shadow language, primary gradient button, secondary bordered button, and platform-specific body. Do not add new decoration.

**Step 3: Remove the iOS 1.2-second timer**

Once the signed-in shell is mounted, eligible iOS members may enter the queue immediately. The queue, not an arbitrary timer, controls overlap.

**Step 4: Run the focused install tests**

Expected: the prompt is compact and queued, not an edge-positioned toast.

---

## Task 6: Remove install-to-push coupling

**Files:**
- Modify: `src/app/components/MobileInstallPrompt.tsx`
- Test: `src/app/components/MobileInstallPrompt.test.tsx`

**Step 1: Write the failing separation test**

Mock `enablePushNotifications`, accept the native install prompt, and assert it is never called from `MobileInstallPrompt`.

**Step 2: Remove only the coupling**

Delete the `enablePushNotifications` import and the accepted-choice call. Preserve `installEvent.prompt()`, `userChoice`, `clearInstallPrompt()`, and the existing manual instructions.

**Step 3: Mark install handled on every resolution**

Set the account/browser key on `Not now`, close, manual `Got it`, accepted install, or dismissed native install. If `appinstalled` fires, close and mark handled immediately.

**Step 4: Run the focused install tests**

Expected: installation never opens the browser notification permission prompt.

---

## Task 7: Define push eligibility without requesting permission

**Files:**
- Create: `src/app/components/PushPermissionPrompt.tsx`
- Test: `src/app/components/PushPermissionPrompt.test.tsx`

**Step 1: Write the eligibility table tests**

Cover:

- `Notification.permission === 'default'`, service worker and PushManager supported: prompt wants the queue.
- Permission `granted`: skip the explanatory prompt and let existing subscription refresh remain authoritative.
- Permission `denied`: skip; Settings remains the recovery explanation.
- Missing Notification, service worker, or PushManager: skip.
- iOS browser not in standalone mode: skip until installed launch.
- Existing handled key for this member: skip.

**Step 2: Add the handled key**

```ts
const PUSH_PROMPT_VERSION = 'v1';

export function pushPromptHandledKey(userId: string) {
  return `cruush:first-entry-push:${PUSH_PROMPT_VERSION}:${userId}`;
}
```

**Step 3: Compute eligibility synchronously**

The eligibility check must inspect capability and permission only. It must not call `Notification.requestPermission()` or any API endpoint.

**Step 4: Run the new focused tests**

Expected: the prompt is requested only in a supported `default` permission state.

---

## Task 8: Implement the push explainer action

**Files:**
- Create: `src/app/components/PushPermissionPrompt.tsx`
- Test: `src/app/components/PushPermissionPrompt.test.tsx`

**Step 1: Write the user-gesture test**

```tsx
fireEvent.click(screen.getByRole('button', { name: 'Enable notifications' }));
expect(enablePushNotifications).toHaveBeenCalledTimes(1);
```

Also prove the helper is not called merely by rendering.

**Step 2: Render the shared surface**

Use the approved title/body, Bell icon, `Enable notifications`, and `Not now`. Join `useExclusivePopup('push-permission', wantsToShow)`.

**Step 3: Handle success and error**

- Success: mark handled and close.
- Browser denial: mark handled and close; do not immediately re-prompt.
- Subscription/config failure after a granted permission: keep the compact prompt open and show the existing error text within the same surface. Do not open a toast or second dialog.
- `Not now` or close: mark handled and close.

**Step 4: Run the focused push tests**

Expected: only the explicit primary-button tap requests notification permission.

---

## Task 9: Remove the onboarding permission surprise

**Files:**
- Modify: `src/app/components/ProfileOnboarding.tsx`
- Test: `src/app/components/ProfileOnboarding.test.tsx`

**Step 1: Add or adjust one focused assertion**

The onboarding completion test must assert `enablePushNotifications` is not called while the profile is saved and the member enters the app shell.

**Step 2: Remove the automatic request**

Delete only:

```ts
void enablePushNotifications().catch(() => undefined);
```

and its unused import. Preserve draft clearing, saved profile data, Code of Conduct handling, rewards, destination, and all onboarding presentation.

**Step 3: Run the focused onboarding test**

Expected: onboarding completes unchanged without opening a browser permission prompt.

---

## Task 10: Mount prompts only in the completed signed-in shell

**Files:**
- Modify: `src/app/App.tsx`
- Test: `src/app/App.test.tsx`

**Step 1: Update component mocks to record props**

Assert both prompts receive `session.user.id` only in the branch that already renders the authenticated routes and bottom navigation.

**Step 2: Mount the prompts**

```tsx
<MobileInstallPrompt userId={session.user.id} />
<PushPermissionPrompt userId={session.user.id} />
```

Keep them beside the existing post-onboarding prompt components. Do not mount them in public, auth, age, conduct, onboarding, or admin replay branches.

**Step 3: Run the focused app test**

```bash
pnpm vitest run src/app/App.test.tsx
```

Expected: completed signed-in shell mounts both; guarded branches mount neither.

---

## Task 11: Verify prompt ordering and no stacking

**Files:**
- Test: `src/app/lib/popupQueue.test.tsx`
- Test: `src/app/components/MobileInstallPrompt.test.tsx`
- Test: `src/app/components/PushPermissionPrompt.test.tsx`

**Step 1: Render install and push together**

Assert exactly one dialog exists and it is `Install cruush`.

**Step 2: Dismiss install**

Assert the same queue hands the slot to `Enable notifications`, with no frame where both dialogs exist.

**Step 3: Add an existing higher-priority notice**

Assert DL Mode remains first, then install, then push. This preserves current privacy-notice priority while still making the two engagement prompts the next first-entry sequence.

**Step 4: Run the three focused files**

Expected: no stacked prompts.

---

## Task 12: Verify compact geometry in the browser

**Files:**
- No source change unless an allowed geometry defect is found.

**Step 1: Start a separate local server**

Use an unused port. Do not take over another session's server.

**Step 2: Render actual states**

Use representative signed-in data and force only browser capability state, not CSS. Check install, iOS manual install, push, push error, and 200% text-scale states.

**Step 3: Measure at required viewports**

At 320×568, 375×667, 390×844, 430×932, 768×1024, and 1440×900, record:

- prompt top/right/bottom/left
- computed width/height
- computed internal padding (must be 16px)
- bottom-nav bounds
- bug-control bounds
- button bounds and 44px minimum touch size
- document horizontal overflow (must be zero)

Expected: every prompt edge is inside the visible viewport and safe area; every action is reachable without page scroll; no intersection with nav or bug control; no internal padding exceeds 16px.

**Step 4: Inspect screenshots**

Open uncropped screenshots for mobile and desktop. Compare surrounding app geometry with the starting screenshots.

---

## Task 13: Exercise real browser outcomes

**Files:**
- No source change unless an allowed behavioral defect is found.

Test these paths:

1. Chrome/Android-compatible `beforeinstallprompt`: accept install.
2. Same path: dismiss native install.
3. iPhone Safari browser: manual Add to Home Screen instructions.
4. Standalone launch: install skipped, push offered.
5. Push permission allowed: subscription endpoint succeeds and prompt stays gone after reload.
6. Push permission denied: prompt stays gone; app remains usable.
7. `Not now`: prompt stays gone for that member/browser; Settings actions still work.
8. Second account in the same browser: receives its own first-entry prompts.
9. Existing DL Mode/Pulse prompt eligibility: only one prompt is visible at a time.

Label any physical iPhone/Android outcome not actually tested as `unverified`; emulation is not physical-device proof.

---

## Task 14: Run focused automated verification

**Files:**
- No new files.

```bash
pnpm vitest run \
  src/app/lib/popupQueue.test.tsx \
  src/app/components/FirstEntryPromptSurface.test.tsx \
  src/app/components/MobileInstallPrompt.test.tsx \
  src/app/components/PushPermissionPrompt.test.tsx \
  src/app/App.test.tsx
pnpm build
pnpm check:cruush-casing
pnpm check:layout
```

Do not run the full test suite unless Julien requests it.

Expected: focused tests, build, casing, and layout checks pass.

---

## Task 15: Perform the task-owned scope audit

**Files:**
- Modify: `.ai-queues/<implementation-session-id>.md`

For every actual changed property, record the authorizing quote:

- first-entry appearance and two requested purposes
- sequential queue behavior needed to prevent stacked popups
- viewport and safe-area constraints needed to prevent off-screen rendering
- 16px internal padding needed to avoid excessive padding
- removal of automatic push permission needed to make the requested push popup truthful

Inspect the complete diff for deleted controls, altered shared-dialog behavior, conditional visibility, copy, colors, borders, spacing, and inherited effects. Revert any task-owned change not listed in the allowed-file contract. Preserve concurrent or pre-existing work.

---

## Task 16: Stop at the requested gate

Implementation completion is local and verified only. Do not commit, push, merge, or deploy unless Julien separately requests that exact action.

Report:

- exact changed files
- focused test/build/layout results
- measured mobile/desktop geometry
- rendered screenshots inspected
- physical-device checks completed or explicitly unverified
- environment-variable changes (`none` expected)
- git status

## Approval Gate

Before implementation, Julien only needs to approve or change:

1. The proposed install and notification copy.
2. The recommended order: install first, push second.
3. The frequency: once per member per browser/device, including existing members once after release.
