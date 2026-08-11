import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const baseURL = process.env.CRUUSH_SCREENSHOT_BASE_URL ?? 'http://127.0.0.1:4173';
const outputRoot = join(process.cwd(), 'docs', 'branch-screenshots');
const now = '2026-08-11T18:00:00.000Z';
const photoUrl = `data:image/svg+xml,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
    <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ff0072"/><stop offset="1" stop-color="#6f00ff"/></linearGradient></defs>
    <rect width="512" height="512" fill="url(#bg)"/>
    <circle cx="256" cy="205" r="105" fill="#f2b994"/>
    <path d="M145 211c4-105 54-151 116-151 77 0 121 61 113 166-25-58-59-80-105-80-40 0-83 21-124 65Z" fill="#231632"/>
    <circle cx="216" cy="211" r="9" fill="#241923"/><circle cx="296" cy="211" r="9" fill="#241923"/>
    <path d="M218 268c23 20 53 20 76 0" fill="none" stroke="#9d3f5c" stroke-width="10" stroke-linecap="round"/>
    <path d="M78 512c16-121 87-188 178-188s162 67 178 188" fill="#15101d"/>
  </svg>
`)}`;

const authenticatedRoutes = [
  ['map', '/map'],
  ['feed', '/feed'],
  ['profile-self', '/profile'],
  ['profile-member', '/profile/member-1'],
  ['profile-edit', '/profile/edit'],
  ['filters', '/filters'],
  ['group', '/groups/group-1'],
  ['event-pass-guide', '/events/event-1/pass-guide'],
  ['event', '/events/event-1'],
  ['place', '/places/place-1'],
  ['chat', '/chat/chat-1'],
  ['group-chat', '/chat/group/chat-1'],
  ['messages', '/messages'],
  ['notifications', '/notifications'],
  ['report', '/report'],
  ['moderation', '/admin/moderation'],
  ['cruush-activity', '/cruush'],
  ['cruush-settings', '/cruush/settings'],
  ['settings', '/settings'],
  ['blocked-users', '/settings/blocked-users'],
  ['notification-settings', '/settings/notifications'],
  ['two-factor', '/settings/2fa'],
  ['tutorial', '/settings/tutorial'],
  ['changelog', '/settings/changelog'],
  ['support', '/support'],
  ['ghost-mode', '/privacy/ghost-mode'],
  ['dl-mode', '/privacy/dl-mode'],
  ['map-presence', '/privacy/map-presence'],
  ['privacy-audit', '/privacy/audit'],
  ['cruise', '/lucky'],
  ['requests', '/requests'],
  ['rewards', '/rewards'],
  ['verify-email', '/verify-email'],
  ['reset-password', '/reset-password'],
].map(([slug, path]) => ({ slug, path, authenticated: true }));

const publicRoutes = [
  ['sign-in', '/'],
  ['about', '/about'],
  ['terms', '/terms'],
  ['privacy', '/privacy'],
  ['safety', '/safety'],
  ['security', '/security'],
  ['billing-policy', '/billing-policy'],
  ['content-removal', '/content-removal'],
  ['human-trafficking-policy', '/human-trafficking-policy'],
  ['takedown-policy', '/takedown-policy'],
  ['2257', '/2257'],
].map(([slug, path]) => ({ slug, path, authenticated: false }));

const routes = [...authenticatedRoutes, ...publicRoutes];
const modes = [
  { slug: 'ghost-off__dl-off', ghost: false, dl: false },
  { slug: 'ghost-off__dl-on', ghost: false, dl: true },
  { slug: 'ghost-on__dl-off', ghost: true, dl: false },
  { slug: 'ghost-on__dl-on', ghost: true, dl: true },
];

const profile = {
  id: 'owner',
  display_name: 'Branch Preview',
  photos: [photoUrl],
  photo_metadata: [{ url: photoUrl, explicit: true }],
  bio: 'Deterministic branch screenshot profile.',
  signal: 'Exploring nearby',
  pronouns: ['they/them'],
  custom_pronouns: '',
  year_of_birth: 1994,
  ethnicity: '',
  identities: ['non-binary'],
  presentation: ['androgynous'],
  sexuality: ['queer'],
  body_type: [],
  height: '',
  weight: '',
  position: ['Vers'],
  role: [],
  is_trans: null,
  trans_status_visibility: 'mutual_cruushes',
  crowds: ['T4T'],
  availability: ['Now'],
  hosting_travel: [],
  kinks: [],
  kink_interests: [],
  kinks_visibility: 'public',
  vibes: ['Coffee'],
  scenes: [],
  archetypes: [],
  hobbies: ['Art'],
  custom_hobby: '',
  looking_for: ['Friends'],
  hiv_status: [],
  hiv_status_visibility: 'mutual_cruushes',
  custom_hiv_status: '',
  condoms: [],
  custom_condoms: '',
  prep: [],
  custom_prep: '',
  doxypep: [],
  custom_doxypep: '',
  covid_vaccine: [],
  custom_covid_vaccine: '',
  mpox_vaccine: [],
  custom_mpox_vaccine: '',
  substance_boundaries: [],
  visibility_rules: {
    active_crowd_modes: [],
    age_range: null,
    distance: null,
    identities: [],
    presentations: [],
    looking_for: [],
    timing: [],
    hosting: [],
    vibes: [],
    crowds: [],
    hobbies: [],
    positions: [],
    roles: [],
    kinks: [],
    body_types: [],
    sexuality: [],
    substance_boundaries: [],
  },
  location: {
    id: 'owner',
    lat: 40.7128,
    lng: -74.006,
    fuzzy_lat: 40.7128,
    fuzzy_lng: -74.006,
    fuzz_radius_meters: 1609,
    location_updated_at: now,
  },
  updated_at: now,
};

const memberProfile = {
  ...profile,
  id: 'member-1',
  display_name: 'Nearby Member',
  signal: 'Open to meeting',
  location: { ...profile.location, id: 'member-1', lat: 40.716, lng: -74.001 },
};

const session = {
  user: {
    id: 'owner',
    email: 'preview@cruush.local',
    displayName: 'Branch Preview',
    emailVerifiedAt: now,
    createdAt: now,
    accountStatus: 'active',
    moderatorRole: 'admin',
  },
  profile: { displayName: 'Branch Preview', yearOfBirth: 1994 },
  needsOnboarding: false,
  needsCodeOfConduct: false,
  codeOfConductVersion: '2026-08-01',
  acceptedCodeOfConductVersion: '2026-08-01',
  codeOfConductAcceptedAt: now,
};

const notificationPreferences = {
  pushEnabled: false,
  cruushEnabled: true,
  messagesEnabled: true,
  groupsEnabled: true,
  nearbyEnabled: true,
  rewardsEnabled: true,
  soundEnabled: true,
};

function dataFor(pathname, mode) {
  if (pathname === '/api/meta') return {
    service: 'cruush-server',
    auth: 'session-cookie',
    storage: 'postgres',
    migratedFromSupabase: true,
    alphaTest: { enabled: true, active: true, endsAt: null, ended: false },
    betaAccess: { enabled: false },
    photoUploads: { profilePhotos: true, messagePhotos: true },
  };
  if (pathname === '/api/auth/me') return session;
  if (pathname === '/api/profiles/me') return profile;
  if (pathname === '/api/profiles/me/visibility-rules') return profile;
  if (pathname === '/api/profiles/member-1') return memberProfile;
  if (pathname === '/api/profiles/me/privacy-settings') return {
    baseMode: mode.ghost ? 'GHOST' : 'PUBLIC_PRECISE',
    ghostModeEnabled: mode.ghost,
    ghostRadiusMeters: 1609,
    ghostRadiusLabel: '1 mi',
    preciseToMutualCruushes: true,
    preciseToMutualCrowds: [],
    preciseLocationVisibility: 'mutual_cruushes',
    updatedAtMs: Date.parse(now),
  };
  if (pathname === '/api/privacy/map-presence') return { days: 7, minDays: 1, maxDays: 30 };
  if (pathname === '/api/privacy/audit') return { exact_location_access: [] };
  if (pathname === '/api/profiles/me/visibility-sets') return [];
  if (pathname === '/api/users') return [];
  if (pathname === '/api/cruush/mutual-map') return [];
  if (pathname === '/api/cruush/me') return {
    entitlement: { cruushPlus: false, expiresAt: null },
    counts: { incoming: 1, sent: 0, mutual: 0, views: 0 },
    incoming: [{ id: 'locked-1', createdAt: now, mutual: false, locked: true, user: null }],
    sent: [],
    mutual: [],
    views: [],
  };
  if (pathname === '/api/cruush/settings') return {
    messageVisibility: 'mutual_cruushes',
    nsfwMessageVisibility: 'public',
    nsfwSendVisibility: 'public',
    updatedAt: now,
  };
  if (pathname === '/api/posts') return [];
  if (pathname === '/api/feed/settings') return {
    locationPinVisibility: 'off',
    showDistanceLabels: true,
    postExpiryDefault: '24h',
  };
  if (pathname === '/api/conversations') return [];
  if (pathname.startsWith('/api/messages/')) return {
    conversation: {
      id: 'chat-1',
      kind: 'dm',
      user: { id: 'member-1', name: 'Nearby Member', pronouns: 'they/them', photo: photoUrl, photoExplicit: true },
      distance: '0.4 mi',
      updatedAt: now,
      lastMessage: '',
      unreadCount: 0,
      pinned: false,
      mutual: true,
      canMessage: true,
      tags: [],
    },
    messages: [],
  };
  if (pathname.endsWith('/members')) return [];
  if (pathname === '/api/notifications/summary') return { unreadCount: 0 };
  if (pathname === '/api/notifications') return { notifications: [], nextCursor: null };
  if (pathname === '/api/notification-preferences') return notificationPreferences;
  if (pathname === '/api/push/vapid-public-key') return { enabled: false, publicKey: '' };
  if (pathname === '/api/map-pings/status') return {
    allowance: { limit: 1, used: 0, remaining: 1, nextEligibleAt: null },
    activePing: null,
    receivedPings: [],
  };
  if (pathname === '/api/billing/me') return {
    cruushPlus: false,
    expiresAt: null,
    badges: [],
    processor: 'fake',
    testCheckout: true,
  };
  if (pathname === '/api/rewards/summary') return {
    streak: { current: 2, longest: 5, todayQualified: true, nextRecurringInDays: 5, nextLongBonusInDays: 5, nextLoginBonusAtDays: 7 },
    promotionalAccess: { active: false, activeUntil: null, bankedDays: 0, effectiveCruushPlus: false },
    referrals: { pending: 0, qualified: 0, underReview: 0, code: 'branchpreview', link: 'https://cruush.app/?ref=branchpreview' },
    recentGrants: [],
    timezone: 'America/New_York',
    rules: { recurringStreakDays: 7, recurringStreakRewardDays: 7, longStreakDays: 1, longStreakBonusDays: 1, referralRewardDays: 7, referralMinAccountAgeDays: 0, maxBankedPromotionalDays: 90 },
  };
  if (pathname === '/api/rewards/timezone') return { timezone: 'America/New_York' };
  if (pathname === '/api/auth/2fa') return { enabled: false, enabledAt: null, recoveryCodesRemaining: 0 };
  if (pathname === '/api/blocks') return { blockedUsers: [] };
  if (pathname === '/api/events/active') return [];
  if (pathname.endsWith('/pass-guide')) return {
    eventSlug: 'event-1',
    venueName: 'Preview Venue',
    startsAt: now,
    endsAt: now,
    current: { iconName: 'cruush', validFrom: now, validUntil: now, hourIndex: 0 },
    guide: [],
  };
  if (pathname === '/api/dev/cruush-plus') return { enabled: false };
  if (pathname === '/api/profiles/me/location') return profile.location;
  if (pathname.startsWith('/api/users/me/notices/')) return { dismissed: true, dismissedAt: now };
  if (pathname.startsWith('/api/admin/moderation/reports')) return { reports: [], nextCursor: null };
  if (pathname.startsWith('/api/admin/moderation/queue')) return {
    items: [],
    page: { limit: 25, offset: 0, total: 0, hasMore: false },
  };
  if (pathname.startsWith('/api/admin/moderation/notifications')) return {
    notifications: [],
    page: { limit: 25, offset: 0, total: 0, hasMore: false },
  };
  if (pathname.startsWith('/api/admin/moderation/system-errors')) return { errors: [], nextCursor: null };
  if (pathname.startsWith('/api/admin/moderation/support-requests')) return {
    requests: [],
    page: { limit: 25, offset: 0, total: 0, hasMore: false },
  };
  if (pathname.startsWith('/api/admin/moderation/users')) return {
    users: [],
    page: { limit: 25, offset: 0, total: 0, hasMore: false },
  };
  if (pathname.startsWith('/api/admin/support-requests')) return {
    requests: [],
    page: { limit: 25, offset: 0, total: 0, hasMore: false },
  };
  return undefined;
}

await mkdir(outputRoot, { recursive: true });
const browser = await chromium.launch({ headless: true });
const captures = [];
const interactionChecks = [];
const unmatched = new Set();

try {
  for (const mode of modes) {
    const modeDirectory = join(outputRoot, mode.slug);
    await mkdir(modeDirectory, { recursive: true });
    const context = await browser.newContext({
      baseURL,
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 1,
      hasTouch: true,
      serviceWorkers: 'block',
    });
    await context.addInitScript(({ dl }) => {
      localStorage.setItem('cruush:dl-mode-enabled', dl ? 'true' : 'false');
      localStorage.setItem('cruush:tutorial-v4-seen', 'true');
      localStorage.setItem('cruush:dl-mode-default-notice-seen', 'true');
      localStorage.setItem('cruush:ghost-mode-intro-seen', 'true');
    }, { dl: mode.dl });

    for (const routeDescriptor of routes) {
      const page = await context.newPage();
      const consoleErrors = [];
      page.on('pageerror', (error) => consoleErrors.push(error.message));
      page.on('console', (message) => {
        const messageText = message.text();
        const expectedSignedOutResponse = !routeDescriptor.authenticated && messageText.includes('401 (Unauthorized)');
        if (message.type() === 'error' && !messageText.includes('favicon') && !expectedSignedOutResponse) {
          consoleErrors.push(messageText);
        }
      });
      await page.route('**/api/**', async (route) => {
        const pathname = new URL(route.request().url()).pathname;
        if (pathname === '/api/auth/me' && !routeDescriptor.authenticated) {
          await route.fulfill({
            status: 401,
            contentType: 'application/json',
            body: JSON.stringify({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required' } }),
          });
          return;
        }
        const data = dataFor(pathname, mode);
        if (data === undefined) unmatched.add(`${route.request().method()} ${pathname}`);
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: data ?? {} }) });
      });

      await page.goto(routeDescriptor.path, { waitUntil: 'domcontentloaded' });
      if (routeDescriptor.slug === 'map') {
        await page.locator('canvas.maplibregl-canvas').waitFor({ state: 'visible', timeout: 15_000 });
        await page.waitForTimeout(700);
      } else {
        await page.waitForFunction(() => document.body.textContent?.trim() !== 'Loading...');
        await page.waitForTimeout(350);
      }
      const errorBoundary = await page.getByText('Something went wrong').count();
      const outputPath = join(modeDirectory, `${routeDescriptor.slug}.jpg`);
      await page.screenshot({ path: outputPath, type: 'jpeg', quality: 78, animations: 'disabled' });
      if (routeDescriptor.slug === 'map') {
        await page.getByRole('button', { name: /^seeking$/i }).tap();
        const seekingDialog = page.getByRole('dialog', { name: 'Seeking' });
        await seekingDialog.getByRole('button', { name: 'Gender Identities' }).tap();
        const seekingOption = page.getByRole('option', { name: 'man', exact: true });
        await seekingOption.scrollIntoViewIfNeeded();
        await seekingOption.tap();
        if (!(await seekingDialog.getByRole('button', { name: 'Gender Identities' }).textContent())?.includes('1 selected')) {
          throw new Error(`Seeking menu touch selection failed in ${mode.slug}`);
        }
        await seekingDialog.getByRole('button', { name: 'Apply' }).tap();

        await page.getByRole('button', { name: /^visibility$/i }).tap();
        const visibilityDialog = page.getByRole('dialog', { name: 'Visibility' });
        await visibilityDialog.getByRole('button', { name: 'Gender Identities' }).tap();
        const visibilityOption = page.getByRole('option', { name: 'man', exact: true });
        await visibilityOption.scrollIntoViewIfNeeded();
        await visibilityOption.tap();
        if (!(await visibilityDialog.getByRole('button', { name: 'Gender Identities' }).textContent())?.includes('1 selected')) {
          throw new Error(`Visibility menu touch selection failed in ${mode.slug}`);
        }
        await visibilityDialog.getByRole('button', { name: 'Apply' }).tap();
        interactionChecks.push({ mode: mode.slug, seekingTouchSelection: true, visibilityTouchSelection: true });
      }
      captures.push({
        mode: mode.slug,
        route: routeDescriptor.path,
        page: routeDescriptor.slug,
        file: outputPath.slice(process.cwd().length + 1),
        errorBoundary: errorBoundary > 0,
        consoleErrors,
      });
      await page.close();
    }
    await context.close();
  }
} finally {
  await browser.close();
}

const manifest = {
  generatedAt: new Date().toISOString(),
  baseURL,
  viewport: { width: 390, height: 844 },
  modes,
  routeCount: routes.length,
  screenshotCount: captures.length,
  captures,
  interactionChecks,
  unmatchedRequests: [...unmatched].sort(),
};
await writeFile(join(outputRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

const failures = captures.filter((capture) => capture.errorBoundary || capture.consoleErrors.length > 0);
process.stdout.write(`${JSON.stringify({
  routeCount: routes.length,
  screenshotCount: captures.length,
  failures,
  interactionChecks,
  unmatchedRequests: manifest.unmatchedRequests,
}, null, 2)}\n`);
if (failures.length > 0) process.exitCode = 1;
