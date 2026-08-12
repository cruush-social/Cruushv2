import { expect, test, type Page } from '@playwright/test';

const now = '2026-08-11T22:00:00.000Z';
const ownerLocation = { lat: 40.7128, lng: -74.006 };
const photoUrl = '/icons/icon-512.png';
const transparentPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLqWQAAAABJRU5ErkJggg==',
  'base64',
);

const emptyVisibilityRules = {
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
};

const emptyProfile = {
  bio: '',
  signal: '',
  pronouns: [],
  custom_pronouns: '',
  year_of_birth: 1994,
  ethnicity: '',
  identities: [],
  presentation: [],
  sexuality: [],
  body_type: [],
  height: '',
  weight: '',
  position: [],
  role: [],
  is_trans: null,
  trans_status_visibility: 'mutual_cruushes',
  crowds: [],
  availability: [],
  hosting_travel: [],
  kinks: [],
  kink_interests: [],
  kinks_visibility: 'public',
  vibes: [],
  scenes: [],
  archetypes: [],
  hobbies: [],
  custom_hobby: '',
  looking_for: [],
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
  visibility_rules: emptyVisibilityRules,
};

const session = {
  user: {
    id: 'owner',
    email: 'owner@cruush.local',
    displayName: 'Owner',
    emailVerifiedAt: now,
    createdAt: now,
    accountStatus: 'active',
    moderatorRole: null,
  },
  profile: { displayName: 'Owner', yearOfBirth: 1994 },
  needsOnboarding: false,
  needsCodeOfConduct: false,
  codeOfConductVersion: '2026-08-01',
  acceptedCodeOfConductVersion: '2026-08-01',
  codeOfConductAcceptedAt: now,
};

const remoteUsers = [
  {
    id: 'nearby-ghost-no-photo',
    name: 'Nearby Ghost',
    display_name: 'Nearby Ghost',
    signal: 'Nearby signal',
    age: 30,
    pronouns: 'they/them',
    lat: 40.7161,
    lng: -74.0008,
    lastActive: 'Now',
    distance: '0.4 mi',
    lookingFor: [],
    vibes: [],
    identities: [],
    presentation: [],
    scenes: [],
    archetypes: [],
    position: ['top'],
    role: [],
    hostingTravel: [],
    photo: null,
    photoExplicit: false,
    displayMode: 'GHOST',
    privacyRadiusMeters: 1609,
    relationship: null,
  },
  {
    id: 'nearby-ghost-photo',
    name: 'Nearby Photo',
    display_name: 'Nearby Photo',
    signal: 'Photo signal',
    age: 31,
    pronouns: 'she/her',
    lat: 40.7092,
    lng: -74.0095,
    lastActive: 'Now',
    distance: '0.5 mi',
    lookingFor: [],
    vibes: [],
    identities: [],
    presentation: [],
    scenes: [],
    archetypes: [],
    position: ['bottom'],
    role: [],
    hostingTravel: [],
    photo: photoUrl,
    photoExplicit: false,
    displayMode: 'GHOST',
    privacyRadiusMeters: 1609,
    relationship: null,
  },
  {
    id: 'mutual-ghost-photo',
    name: 'Mutual Ghost',
    display_name: 'Mutual Ghost',
    signal: 'Mutual signal',
    age: 32,
    pronouns: 'he/him',
    lat: 40.7095,
    lng: -74.0018,
    lastActive: 'Now',
    distance: '0.6 mi',
    lookingFor: [],
    vibes: [],
    identities: [],
    presentation: [],
    scenes: [],
    archetypes: [],
    position: ['versatile'],
    role: [],
    hostingTravel: [],
    photo: photoUrl,
    photoExplicit: false,
    displayMode: 'GHOST',
    privacyRadiusMeters: 1609,
    relationship: {
      mutualCruush: true,
      canMessage: true,
      precision: 'fuzzy',
    },
  },
];

type MockOptions = {
  ghostOwner?: boolean;
  explicitOwnerPhoto?: boolean;
};

async function installAppMocks(page: Page, options: MockOptions = {}) {
  let ownerProfile = {
    ...emptyProfile,
    id: 'owner',
    display_name: 'Owner',
    photos: [photoUrl],
    photo_metadata: [{ url: photoUrl, explicit: options.explicitOwnerPhoto === true }],
    location: {
      id: 'owner',
      lat: ownerLocation.lat,
      lng: ownerLocation.lng,
      fuzzy_lat: ownerLocation.lat,
      fuzzy_lng: ownerLocation.lng,
      fuzz_radius_meters: 1609,
      location_updated_at: now,
    },
    updated_at: now,
  };
  const requests: Array<{ method: string; url: string; body: unknown }> = [];

  await page.addInitScript(() => {
    localStorage.setItem('cruush:tutorial-v4-seen', 'true');
    localStorage.setItem('cruush:ghost-mode-intro-seen', 'true');
  });
  await page.route('https://*.basemaps.cartocdn.com/**', async (route) => {
    await route.fulfill({ body: transparentPng, contentType: 'image/png', status: 200 });
  });
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    let body: unknown = null;
    try {
      body = request.postDataJSON();
    } catch {
      body = request.postData();
    }
    requests.push({ method: request.method(), url: url.toString(), body });

    let data: unknown = {};
    if (url.pathname === '/api/auth/me') data = session;
    else if (url.pathname === '/api/profiles/me' && request.method() === 'GET') data = ownerProfile;
    else if (url.pathname === '/api/profiles/me/privacy-settings') data = {
      baseMode: options.ghostOwner ? 'GHOST' : 'PUBLIC_PRECISE',
      ghostModeEnabled: options.ghostOwner === true,
      ghostRadiusMeters: 1609,
      ghostRadiusLabel: '1 mi',
      preciseToMutualCruushes: false,
      preciseToMutualCrowds: [],
      preciseLocationVisibility: 'none',
      updatedAtMs: Date.parse(now),
    };
    else if (url.pathname === '/api/profiles/me/visibility-sets') data = [];
    else if (url.pathname === '/api/profiles/me/visibility-rules' && request.method() === 'PUT') {
      const visibilityRules = (body as { visibility_rules?: typeof emptyVisibilityRules })?.visibility_rules
        ?? emptyVisibilityRules;
      ownerProfile = { ...ownerProfile, visibility_rules: visibilityRules };
      data = ownerProfile;
    } else if (url.pathname === '/api/profiles/me/location') data = ownerProfile.location;
    else if (url.pathname === '/api/users') data = remoteUsers;
    else if (url.pathname === '/api/cruush/mutual-map') data = [];
    else if (url.pathname === '/api/map-pings/status') data = {
      allowance: { limit: 1, used: 0, remaining: 1, nextEligibleAt: null },
      activePing: null,
      receivedPings: [],
    };
    else if (url.pathname === '/api/billing/me') data = {
      cruushPlus: false,
      expiresAt: null,
      badges: [],
      processor: 'fake',
      testCheckout: true,
    };
    else if (url.pathname === '/api/notifications/summary') data = { unreadCount: 0 };
    else if (url.pathname === '/api/notifications') data = { notifications: [], nextCursor: null };
    else if (url.pathname === '/api/notification-preferences') data = {
      pushEnabled: false,
      cruushEnabled: true,
      messagesEnabled: true,
      groupsEnabled: true,
      nearbyEnabled: true,
      rewardsEnabled: true,
      soundEnabled: false,
    };
    else if (url.pathname === '/api/push/vapid-public-key') data = { enabled: false, publicKey: '' };
    else if (url.pathname === '/api/conversations') data = [];
    else if (url.pathname.startsWith('/api/messages/')) data = {
      conversation: {
        id: 'chat-1',
        kind: 'dm',
        user: { id: 'nearby-ghost-photo', name: 'Nearby Photo', pronouns: 'she/her', photo: photoUrl, photoExplicit: false },
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
    else if (url.pathname.endsWith('/members')) data = [];
    else if (url.pathname === '/api/cruush/me') data = {
      entitlement: { cruushPlus: false, expiresAt: null },
      counts: { incoming: 1, sent: 0, mutual: 0, views: 0 },
      incoming: [{ id: 'locked-1', createdAt: now, mutual: false, locked: true, user: null }],
      sent: [],
      mutual: [],
      views: [],
    };
    else if (url.pathname === '/api/cruush/settings') data = {
      messageVisibility: 'mutual_cruushes',
      nsfwMessageVisibility: 'public',
      nsfwSendVisibility: 'public',
      updatedAt: now,
    };
    else if (url.pathname === '/api/auth/2fa') data = {
      enabled: false,
      enabledAt: null,
      recoveryCodesRemaining: 0,
    };
    else if (url.pathname === '/api/blocks') data = { blockedUsers: [] };
    else if (url.pathname === '/api/privacy/map-presence') data = { days: 7, minDays: 1, maxDays: 30 };
    else if (url.pathname === '/api/privacy/audit') data = { exact_location_access: [] };
    else if (url.pathname === '/api/events/active' || url.pathname === '/api/posts') data = [];
    else if (url.pathname === '/api/feed/settings') data = {
      locationPinVisibility: 'off',
      showDistanceLabels: true,
      postExpiryDefault: '24h',
    };
    else if (url.pathname === '/api/dev/cruush-plus') data = { enabled: false };
    else if (url.pathname === '/api/rewards/summary') data = {
      streak: {
        current: 2,
        longest: 5,
        todayQualified: true,
        nextRecurringInDays: 5,
        nextLongBonusInDays: 5,
        nextLoginBonusAtDays: 7,
      },
      promotionalAccess: {
        active: false,
        activeUntil: null,
        bankedDays: 0,
        effectiveCruushPlus: false,
      },
      referrals: {
        pending: 0,
        qualified: 0,
        underReview: 0,
        code: 'regression',
        link: 'https://cruush.app/?ref=regression',
      },
      recentGrants: [],
      timezone: 'America/New_York',
      rules: {
        recurringStreakDays: 7,
        recurringStreakRewardDays: 1,
        longStreakDays: 1,
        longStreakBonusDays: 1,
        referralRewardDays: 7,
        referralMinAccountAgeDays: 0,
        maxBankedPromotionalDays: 90,
      },
    };
    else if (url.pathname === '/api/rewards/timezone') data = { timezone: 'America/New_York' };
    else if (url.pathname.startsWith('/api/admin/support-requests')) data = {
      requests: [],
      page: { limit: 25, offset: 0, total: 0, hasMore: false },
    };
    else if (url.pathname.startsWith('/api/users/me/notices/')) data = { dismissed: true, dismissedAt: now };
    else if (url.pathname.startsWith('/api/profiles/')) {
      const userId = url.pathname.split('/').pop() ?? 'nearby-ghost-no-photo';
      const remote = remoteUsers.find((user) => user.id === userId) ?? remoteUsers[0];
      data = {
        ...emptyProfile,
        id: remote.id,
        display_name: remote.display_name,
        photos: remote.photo ? [remote.photo] : [],
        photo_metadata: remote.photo ? [{ url: remote.photo, explicit: remote.photoExplicit }] : [],
        signal: remote.signal,
        pronouns: [remote.pronouns],
        year_of_birth: 1994,
        updated_at: now,
      };
    }

    await route.fulfill({
      body: JSON.stringify({ data }),
      contentType: 'application/json',
      status: 200,
    });
  });

  return requests;
}

async function openMap(page: Page) {
  await page.goto('/map');
  await expect(page.getByTestId('map-home-shell')).toBeVisible();
  await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open Nearby Ghost on map' })).toBeVisible();
}

async function expectTopActionSizing(
  page: Page,
  minimumBarHeight: number,
  minimumButtonSize: number,
  minimumIconSize: number,
) {
  const topActions = page.getByTestId('map-top-actions');
  await expect(topActions).toBeVisible();
  const barBox = await topActions.boundingBox();
  expect(barBox).not.toBeNull();
  expect(barBox!.height).toBeGreaterThanOrEqual(minimumBarHeight);
  expect(barBox!.x).toBeGreaterThanOrEqual(0);
  expect(barBox!.x + barBox!.width).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));

  const controls = [
    page.getByRole('button', { name: 'Cruise Carousel' }),
    page.getByRole('button', { name: 'Ghost Mode Settings' }),
    page.getByRole('button', { name: /Turn DL Mode/ }),
    page.getByRole('button', { name: 'Notifications' }),
    page.getByRole('button', { name: 'Settings', exact: true }),
    page.getByRole('button', { name: 'Report alpha bug' }),
  ];
  for (const control of controls) {
    const buttonBox = await control.boundingBox();
    expect(buttonBox).not.toBeNull();
    expect(buttonBox!.width).toBeGreaterThanOrEqual(minimumButtonSize);
    expect(buttonBox!.height).toBeGreaterThanOrEqual(minimumButtonSize);
    const iconBox = await control.locator('img, svg').first().boundingBox();
    expect(iconBox).not.toBeNull();
    expect(iconBox!.width).toBeGreaterThanOrEqual(minimumIconSize);
    expect(iconBox!.height).toBeGreaterThanOrEqual(minimumIconSize);
  }
}

async function expectViewportControlsToReceivePointerInput(page: Page, route: string) {
  const controls = page.locator([
    'button:not(:disabled)',
    'a[href]',
    'input:not([type="file"]):not(:disabled)',
    'select:not(:disabled)',
    'textarea:not(:disabled)',
    '[role="button"]:not([aria-disabled="true"])',
    '[role="switch"]:not([aria-disabled="true"])',
    '[role="combobox"]:not([aria-disabled="true"])',
  ].join(','));
  const failures: Array<{ label: string; reason: string }> = [];
  const controlCount = await controls.count();

  for (let index = 0; index < controlCount; index += 1) {
    const control = controls.nth(index);
    if (!await control.isVisible()) {
      continue;
    }

    const label = await control.getAttribute('aria-label')
      || (await control.textContent())?.trim().slice(0, 80)
      || await control.getAttribute('data-testid')
      || `control ${index + 1}`;
    try {
      await control.click({ trial: true, timeout: 3_000 });
    } catch (error) {
      failures.push({
        label,
        reason: error instanceof Error ? error.message.split('\n')[0] : String(error),
      });
    }
  }

  expect(failures, `${route} has visible controls that cannot receive pointer input`).toEqual([]);
}

test('renders a taller top action bar with larger icons on mobile and desktop', async ({ page, browser }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installAppMocks(page);
  await openMap(page);
  await expectTopActionSizing(page, 44, 36, 20);

  const desktopContext = await browser.newContext({
    baseURL: 'http://127.0.0.1:4173',
    serviceWorkers: 'block',
    viewport: { width: 1440, height: 900 },
  });
  const desktopPage = await desktopContext.newPage();
  try {
    await installAppMocks(desktopPage);
    await openMap(desktopPage);
    await expectTopActionSizing(desktopPage, 52, 40, 22);
  } finally {
    await desktopContext.close();
  }
});

test('selects Seeking and Visibility menu options with real mobile taps', async ({ page }) => {
  const requests = await installAppMocks(page);
  await openMap(page);

  await page.getByTestId('map-seeking-button').tap();
  const seeking = page.getByRole('dialog', { name: 'Seeking' });
  await expect(seeking).toBeVisible();
  await seeking.getByRole('button', { name: 'Gender Identities' }).tap();
  const seekingOption = page.getByRole('option', { name: 'man', exact: true });
  await seekingOption.scrollIntoViewIfNeeded();
  await seekingOption.tap();
  await expect(seeking.getByRole('button', { name: 'Gender Identities' })).toHaveText('1 selected');
  await seeking.getByRole('button', { name: 'Apply', exact: true }).tap();
  await expect.poll(() => requests.some((entry) => {
    const url = new URL(entry.url);
    return entry.method === 'GET' && url.pathname === '/api/users' && url.searchParams.getAll('identities').includes('man');
  })).toBe(true);

  await page.getByTestId('map-visibility-button').tap();
  const visibility = page.getByRole('dialog', { name: 'Visibility' });
  await expect(visibility).toBeVisible();
  await visibility.getByRole('button', { name: 'Gender Identities' }).tap();
  const visibilityOption = page.getByRole('option', { name: 'man', exact: true });
  await visibilityOption.scrollIntoViewIfNeeded();
  await visibilityOption.tap();
  await expect(visibility.getByRole('button', { name: 'Gender Identities' })).toHaveText('1 selected');
  await visibility.getByRole('button', { name: 'Apply', exact: true }).tap();
  await expect.poll(() => requests.some((entry) => (
    entry.method === 'PUT'
      && new URL(entry.url).pathname === '/api/profiles/me/visibility-rules'
      && (entry.body as { visibility_rules?: { identities?: string[] } })?.visibility_rules?.identities?.includes('man')
  ))).toBe(true);

  await page.getByRole('button', { name: 'Send a Ping' }).tap();
  await expect(page.getByRole('dialog', { name: 'Send a Ping' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'cruush+ rewards' }).tap();
  await expect(page.getByRole('heading', { name: 'Rewards & cruush+' })).toBeVisible();
  await page.goto('/map');
  await expect(page.getByRole('button', { name: 'Feed' })).toBeVisible();
  await page.getByRole('button', { name: 'Feed' }).tap();
  await expect(page.getByRole('heading', { name: 'Local Feed' })).toBeVisible();
});

test('short tap opens the profile and press-and-hold reveals the signal', async ({ page, context }) => {
  const requests = await installAppMocks(page);
  await openMap(page);

  const marker = page.getByRole('button', { name: 'Open Nearby Ghost on map' });
  await marker.tap();
  await expect(page.getByRole('heading', { name: 'Nearby Ghost' })).toBeVisible();
  expect(requests.some((entry) => new URL(entry.url).pathname === '/api/profiles/nearby-ghost-no-photo')).toBe(true);

  await page.goto('/map');
  await expect(marker).toBeVisible();
  const box = await marker.boundingBox();
  expect(box).not.toBeNull();
  const x = box!.x + box!.width / 2;
  const y = box!.y + box!.height / 2;
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x, y }],
  });
  await page.waitForTimeout(500);
  await expect(marker).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('marker-heart-layer-nearby-ghost-no-photo')).toHaveClass(/scale-\[1\.16\]/);
  await expect(page.getByTestId('marker-signal-stack-nearby-ghost-no-photo')).toHaveClass(/opacity-100/);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  await expect(page.getByTestId('map-home-shell')).toBeVisible();
});

test('keeps Ghost location styling separate from profile-photo and DL rendering', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('cruush:dl-mode-enabled', 'true');
  });
  await installAppMocks(page, { ghostOwner: true, explicitOwnerPhoto: true });
  await openMap(page);

  const ownerHeart = page.getByTestId('marker-heart-me');
  await expect(ownerHeart).toHaveAttribute('data-has-photo', 'false');
  await expect(ownerHeart.locator('path[stroke="#0BA8FF"]')).toHaveCount(1);
  await expect(ownerHeart.locator('path[fill="#0BA8FF"]')).toHaveCount(0);
  await expect(page.getByTestId('marker-photo-fill-me')).toHaveCount(0);

  const nearbyNoPhoto = page.getByTestId('marker-heart-nearby-ghost-no-photo');
  await expect(nearbyNoPhoto).toHaveAttribute('data-marker-theme', 'nearby');
  await expect(nearbyNoPhoto).toHaveAttribute('data-has-photo', 'false');
  await expect(nearbyNoPhoto.locator('path[stroke="#FF0072"]')).toHaveCount(1);
  await expect(nearbyNoPhoto.locator('path[fill="#0BA8FF"]')).toHaveCount(0);
  await expect(nearbyNoPhoto.locator('path[fill^="url("]')).toHaveCount(1);

  const nearbyPhoto = page.getByTestId('marker-heart-nearby-ghost-photo');
  await expect(nearbyPhoto).toHaveAttribute('data-has-photo', 'true');
  await expect(page.getByTestId('marker-photo-fill-nearby-ghost-photo')).toHaveCount(1);
  await expect(nearbyPhoto.locator('path[fill="none"][stroke="#FF0072"]')).toHaveCount(1);
  await expect(nearbyPhoto.locator('path[fill="#0BA8FF"]')).toHaveCount(0);

  const mutualPhoto = page.getByTestId('marker-heart-mutual-ghost-photo');
  await expect(mutualPhoto).toHaveAttribute('data-has-photo', 'true');
  await expect(mutualPhoto.locator('path[fill="none"][stroke="#6f00ff"]')).toHaveCount(1);
  await expect(mutualPhoto.locator('path[fill="#0BA8FF"]')).toHaveCount(0);
  await expect(page.getByText('Ghost Mode Active', { exact: true })).toBeVisible();
});

test('resumes the map tutorial after Ghost and Feed route actions', async ({ page }) => {
  await installAppMocks(page);
  await page.goto('/map?replayTutorial=1');
  await expect(page.getByRole('dialog', { name: 'Map controls tutorial' })).toBeVisible();

  await page.getByTestId('tutorial-skip-step').tap();
  await page.getByTestId('tutorial-skip-step').tap();
  await page.getByTestId('tutorial-next').tap();
  await page.getByTestId('tutorial-next').tap();
  await page.getByTestId('tutorial-next').tap();
  await expect(page.getByRole('heading', { name: 'Ghost Mode' })).toBeVisible();

  await page.getByTestId('tutorial-try-step').tap();
  await expect(page.getByText('Shifting public map location')).toBeVisible();
  await page.getByRole('button', { name: 'Map', exact: true }).tap();
  await expect(page.getByRole('heading', { name: 'Ghost Mode' })).toBeVisible();

  await page.getByTestId('tutorial-next').tap();
  await page.getByTestId('tutorial-next').tap();
  await page.getByTestId('tutorial-next').tap();
  await page.getByTestId('tutorial-next').tap();
  await expect(page.getByRole('heading', { name: 'Feed' })).toBeVisible();

  await page.getByTestId('tutorial-try-step').tap();
  await expect(page.getByRole('heading', { name: 'Local Feed' })).toBeVisible();
  await page.getByRole('button', { name: 'Map', exact: true }).tap();
  await expect(page.getByRole('heading', { name: 'Feed' })).toBeVisible();
});

test('keeps visible controls pointer-reachable across routed user pages', async ({ page }) => {
  test.setTimeout(180_000);
  await installAppMocks(page);
  const routes = [
    '/map',
    '/feed',
    '/profile',
    '/profile/nearby-ghost-photo',
    '/profile/edit',
    '/filters',
    '/groups/group-1',
    '/events/event-1/pass-guide',
    '/events/event-1',
    '/places/place-1',
    '/chat/chat-1',
    '/chat/group/chat-1',
    '/messages',
    '/notifications',
    '/report',
    '/cruush',
    '/cruush/settings',
    '/settings',
    '/settings/blocked-users',
    '/settings/notifications',
    '/settings/2fa',
    '/settings/tutorial',
    '/settings/changelog',
    '/support',
    '/privacy/ghost-mode',
    '/privacy/dl-mode',
    '/privacy/map-presence',
    '/privacy/audit',
    '/lucky',
    '/requests',
    '/rewards',
    '/about',
    '/terms',
    '/privacy',
    '/safety',
    '/security',
    '/billing-policy',
    '/content-removal',
    '/human-trafficking-policy',
    '/takedown-policy',
    '/2257',
  ];

  for (const route of routes) {
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Something went wrong')).toHaveCount(0);
    await page.waitForFunction(() => document.body.textContent?.trim() !== 'Loading...');
    if (route === '/map') {
      await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible();
    }
    await expectViewportControlsToReceivePointerInput(page, route);
  }
});
