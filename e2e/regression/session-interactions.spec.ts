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

const desktopRecentlyActiveUsers = [
  ...remoteUsers,
  {
    ...remoteUsers[0],
    id: 'recently-active-4',
    name: 'Recent Four',
    display_name: 'Recent Four',
    lat: 40.7142,
    lng: -74.0032,
    lastActive: '1m ago',
  },
  {
    ...remoteUsers[1],
    id: 'recently-active-5',
    name: 'Recent Five',
    display_name: 'Recent Five',
    lat: 40.7112,
    lng: -74.0041,
    lastActive: '2m ago',
  },
  {
    ...remoteUsers[2],
    id: 'recently-active-6',
    name: 'Recent Six',
    display_name: 'Recent Six',
    lat: 40.7104,
    lng: -74.0074,
    lastActive: '3m ago',
  },
];

type MockOptions = {
  ghostOwner?: boolean;
  darkRoomOwner?: boolean;
  cruushPlus?: boolean;
  explicitOwnerPhoto?: boolean;
  users?: typeof remoteUsers;
};

async function installAppMocks(page: Page, options: MockOptions = {}) {
  const mockedRemoteUsers = options.users ?? remoteUsers;
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
      baseMode: options.darkRoomOwner ? 'STEALTH' : options.ghostOwner ? 'GHOST' : 'PUBLIC_PRECISE',
      ghostModeEnabled: options.darkRoomOwner ? false : options.ghostOwner === true,
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
    else if (url.pathname === '/api/users') data = mockedRemoteUsers;
    else if (url.pathname === '/api/cruush/mutual-map') data = [];
    else if (url.pathname === '/api/map-pings/status') data = {
      allowance: { limit: 1, used: 0, remaining: 1, nextEligibleAt: null },
      activePing: null,
      receivedPings: [],
    };
    else if (url.pathname === '/api/billing/me') data = {
      cruushPlus: options.cruushPlus === true,
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
    else if (url.pathname === '/api/privacy/travel-pin') data = { pin: null };
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
    else if (url.pathname === '/api/rewards/side-quests') data = {
      pingCredits: 0,
      claimingAvailable: true,
      cruushPlusClaimsThisWeek: 0,
      cruushPlusWeeklyLimit: 2,
      claimedToday: false,
      quests: [],
    };
    else if (url.pathname.startsWith('/api/admin/support-requests')) data = {
      requests: [],
      page: { limit: 25, offset: 0, total: 0, hasMore: false },
    };
    else if (url.pathname.startsWith('/api/users/me/notices/')) data = { dismissed: true, dismissedAt: now };
    else if (url.pathname.startsWith('/api/profiles/')) {
      const userId = url.pathname.split('/').pop() ?? 'nearby-ghost-no-photo';
      const remote = mockedRemoteUsers.find((user) => user.id === userId) ?? mockedRemoteUsers[0];
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

// Seeking and Visibility sit inside Map Controls, collapsed until it is opened.
async function openMapControls(page: Page) {
  const trigger = page.getByTestId('map-controls-trigger');
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') {
    await trigger.tap();
  }
  await expect(page.getByTestId('map-seeking-button')).toBeVisible();
}

async function expectTopActionSizing(
  page: Page,
  minimumBarHeight: number,
  minimumButtonSize: number,
  minimumIconSize: number,
  widthMode: 'mobile-full' | 'desktop-capped',
) {
  const topActions = page.getByTestId('map-top-actions');
  await expect(topActions).toBeVisible();
  const barBox = await topActions.boundingBox();
  expect(barBox).not.toBeNull();
  expect(barBox!.height).toBeGreaterThanOrEqual(minimumBarHeight);
  expect(barBox!.x).toBeGreaterThanOrEqual(0);
  const viewportWidth = await page.evaluate(() => window.innerWidth);
  expect(barBox!.x + barBox!.width).toBeLessThanOrEqual(viewportWidth);
  if (widthMode === 'mobile-full') {
    // The bar shares the row with the cruush+ pill and the bug button, so it
    // fills what is left rather than the viewport, and never spills past it.
    expect(barBox!.width).toBeGreaterThanOrEqual(minimumButtonSize * 5);
  } else {
    // On desktop the bar hugs its five icons and sits centred, rather than
    // stretching to a fixed width.
    expect(barBox!.width).toBeGreaterThanOrEqual(minimumButtonSize * 5);
    expect(barBox!.width).toBeLessThanOrEqual(832);
    // Centred in the space the cruush+ pill and the bug button leave it, which
    // sits a little left of the viewport centre because the pill is the wider
    // of the two.
    const pill = await page.getByRole('button', { name: 'cruush+ rewards' }).boundingBox();
    const bug = await page.getByRole('button', { name: 'Report alpha bug' }).boundingBox();
    expect(pill).not.toBeNull();
    expect(bug).not.toBeNull();
    const rowCentre = ((pill!.x + pill!.width) + bug!.x) / 2;
    expect(Math.abs(barBox!.x + barBox!.width / 2 - rowCentre)).toBeLessThanOrEqual(2);
  }

  const cruushPlusBox = await page.getByRole('button', { name: 'cruush+ rewards' }).boundingBox();
  await openMapControls(page);
  const pingBox = await page.getByRole('button', { name: 'Send a Pulse' }).boundingBox();
  expect(cruushPlusBox).not.toBeNull();
  expect(pingBox).not.toBeNull();
  expect(cruushPlusBox!.height).toBeGreaterThanOrEqual(minimumButtonSize);
  // The cruush+ pill leads the row and the bar follows it, so the two share a
  // row without either running under the other.
  expect(cruushPlusBox!.x).toBeGreaterThanOrEqual(0);
  expect(cruushPlusBox!.x + cruushPlusBox!.width).toBeLessThanOrEqual(barBox!.x);
  expect(cruushPlusBox!.y).toBeLessThan(barBox!.y + barBox!.height);
  expect(cruushPlusBox!.y + cruushPlusBox!.height).toBeGreaterThan(barBox!.y);
  expect(pingBox!.y).toBeGreaterThanOrEqual(cruushPlusBox!.y + cruushPlusBox!.height);
  expect(pingBox!.x).toBeGreaterThanOrEqual(0);
  expect(pingBox!.x + pingBox!.width).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));

  const cruushPlusSheen = await page.getByRole('button', { name: 'cruush+ rewards' }).evaluate((button) => {
    const buttonStyle = window.getComputedStyle(button);
    const sheenStyle = window.getComputedStyle(button, '::before');
    return {
      animationDuration: sheenStyle.animationDuration,
      animationName: sheenStyle.animationName,
      backgroundImage: sheenStyle.backgroundImage,
      isolation: buttonStyle.isolation,
      overflow: buttonStyle.overflow,
    };
  });
  expect(cruushPlusSheen).toMatchObject({
    animationDuration: '3.4s',
    animationName: 'cruush-plus-shimmer',
    isolation: 'isolate',
    overflow: 'hidden',
  });
  expect(cruushPlusSheen.backgroundImage).toContain('linear-gradient');

  const controls = [
    page.getByRole('button', { name: 'Cruise Carousel' }),
    page.getByRole('button', { name: 'Ghost Mode Settings' }),
    page.getByRole('button', { name: /Turn DL Mode/ }),
    page.getByRole('button', { name: 'Notifications' }),
    page.getByRole('button', { name: 'Settings', exact: true }),
    page.getByRole('button', { name: 'Report alpha bug' }),
  ];
  const controlBoxes: { label: string; x: number; y: number; width: number; height: number }[] = [];
  for (const control of controls) {
    const buttonBox = await control.boundingBox();
    expect(buttonBox).not.toBeNull();
    expect(buttonBox!.width).toBeGreaterThanOrEqual(minimumButtonSize);
    expect(buttonBox!.height).toBeGreaterThanOrEqual(minimumButtonSize);
    expect(buttonBox!.x).toBeGreaterThanOrEqual(0);
    expect(buttonBox!.x + buttonBox!.width).toBeLessThanOrEqual(viewportWidth);
    controlBoxes.push({
      label: await control.getAttribute('aria-label') ?? 'unlabeled control',
      ...buttonBox!,
    });
    const iconBox = await control.locator('img, svg').first().boundingBox();
    expect(iconBox).not.toBeNull();
    expect(iconBox!.width).toBeGreaterThanOrEqual(minimumIconSize);
    expect(iconBox!.height).toBeGreaterThanOrEqual(minimumIconSize);
  }
  for (let first = 0; first < controlBoxes.length; first += 1) {
    for (let second = first + 1; second < controlBoxes.length; second += 1) {
      const firstBox = controlBoxes[first];
      const secondBox = controlBoxes[second];
      const overlaps = firstBox.x < secondBox.x + secondBox.width
        && firstBox.x + firstBox.width > secondBox.x
        && firstBox.y < secondBox.y + secondBox.height
        && firstBox.y + firstBox.height > secondBox.y;
      expect(overlaps, `${firstBox.label} overlaps ${secondBox.label}`).toBe(false);
    }
  }
  const bugButtonBox = controlBoxes.find(({ label }) => label === 'Report alpha bug');
  expect(bugButtonBox).toBeDefined();
  // The cruush+ pill steps down to 44px on a phone 360px wide or narrower; the
  // bug button holds 48px there. Above that the two match.
  const narrowPhone = (await page.evaluate(() => window.innerWidth)) <= 360;
  expect(Math.abs(bugButtonBox!.height - cruushPlusBox!.height)).toBeLessThanOrEqual(narrowPhone ? 4 : 0);
}

async function expectSeekingTopSpacing(page: Page) {
  await openMapControls(page);
  const topActionsBox = await page.getByTestId('map-top-actions').boundingBox();
  const seekingBox = await page.getByTestId('map-seeking-button').boundingBox();
  const visibilityBox = await page.getByTestId('map-visibility-button').boundingBox();
  expect(topActionsBox).not.toBeNull();
  expect(seekingBox).not.toBeNull();
  expect(visibilityBox).not.toBeNull();

  const triggerBox = await page.getByTestId('map-controls-trigger').boundingBox();
  expect(triggerBox).not.toBeNull();
  // The menu hangs under its trigger, below the top bar, and its rows keep one
  // even rhythm.
  expect(triggerBox!.y).toBeGreaterThanOrEqual(topActionsBox!.y + topActionsBox!.height);
  expect(seekingBox!.y).toBeGreaterThanOrEqual(triggerBox!.y + triggerBox!.height);
  const seekingToVisibilityGap = visibilityBox!.y - (seekingBox!.y + seekingBox!.height);
  expect(seekingToVisibilityGap, `Seeking-to-Visibility gap ${seekingToVisibilityGap}px`).toBeGreaterThanOrEqual(4);
  expect(seekingToVisibilityGap, `Seeking-to-Visibility gap ${seekingToVisibilityGap}px`).toBeLessThanOrEqual(16);
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
      const message = error instanceof Error ? error.message : String(error);
      const intercept = message.split('\n').find((line) => /intercepts pointer events|not visible|outside of the viewport/.test(line));
      failures.push({
        label,
        reason: [message.split('\n')[0], intercept?.trim()].filter(Boolean).join(' | '),
      });
    }
  }

  expect(failures, `${route} has visible controls that cannot receive pointer input`).toEqual([]);
}

test('renders a full-width mobile top bar and a centered capped desktop top bar', async ({ page, browser }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await installAppMocks(page);
  await openMap(page);
  await expectTopActionSizing(page, 44, 36, 20, 'mobile-full');
  await expectSeekingTopSpacing(page);

  await page.setViewportSize({ width: 390, height: 844 });
  await expectTopActionSizing(page, 44, 36, 20, 'mobile-full');
  await expectSeekingTopSpacing(page);

  const desktopContext = await browser.newContext({
    baseURL: 'http://127.0.0.1:4173',
    serviceWorkers: 'block',
    viewport: { width: 1440, height: 900 },
  });
  const desktopPage = await desktopContext.newPage();
  try {
    await installAppMocks(desktopPage);
    await desktopPage.goto('/map');
    await expect(desktopPage.getByTestId('map-home-shell')).toBeVisible();
    await expect(desktopPage.locator('canvas.maplibregl-canvas')).toBeVisible();
    await expectTopActionSizing(desktopPage, 56, 44, 28, 'desktop-capped');
    await expectSeekingTopSpacing(desktopPage);
  } finally {
    await desktopContext.close();
  }
});

test('keeps the 1.6 mobile map, Pulse, Feed+, and Mile High Club controls in view', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 650 });
  await installAppMocks(page);
  await openMap(page);
  await expectSeekingTopSpacing(page);
  await expect(page.getByRole('button', { name: /^Open .* on map$/ })).toHaveCount(3);

  await page.getByRole('button', { name: 'Send a Pulse' }).tap();
  const pulseDialog = page.getByRole('dialog', { name: 'Send a Pulse' });
  const sendButton = pulseDialog.getByRole('button', { name: 'Send Pulse' });
  await expect(pulseDialog).toBeVisible();
  await page.waitForTimeout(550);
  await expect(sendButton).toBeInViewport();
  const pulseBox = await pulseDialog.boundingBox();
  const sendBox = await sendButton.boundingBox();
  expect(pulseBox).not.toBeNull();
  expect(sendBox).not.toBeNull();
  expect(pulseBox!.y).toBeGreaterThanOrEqual(0);
  expect(sendBox!.y + sendBox!.height).toBeLessThanOrEqual(650);
  await page.screenshot({ path: '/tmp/cruush-1.6-pulse-360x650.png' });

  await page.keyboard.press('Escape');
  await page.goto('/feed');
  await page.getByRole('button', { name: 'Feed settings' }).tap();
  await page.getByRole('button', { name: 'Specific Crowd +' }).tap();
  await expect(page.getByTestId('cruush-plus-card')).toBeVisible();
  await page.waitForTimeout(250);
  await page.screenshot({ path: '/tmp/cruush-1.6-feed-plus-360x650.png' });
  await page.getByRole('button', { name: 'Not now' }).tap();

  await page.goto('/settings/travel');
  await expect(page.getByRole('heading', { name: 'Mile High Club', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Mile High Club', level: 2 }).locator('xpath=..').locator('img'))
    .toHaveAttribute('src', /Mile%20High%20Club%20White/);
  // A free member is offered cruush+ here; a member who has it is offered the switch.
  await page.getByRole('button', { name: /^(Turn on|Get cruush\+)$/ }).tap();
  const mileHighDialog = page.getByRole('dialog');
  await expect(mileHighDialog.getByRole('heading', { name: 'Mile High Club' })).toBeVisible();
  await expect(mileHighDialog.getByTestId('cruush-plus-card')).toBeVisible();
  await page.waitForTimeout(250);
  await page.screenshot({ path: '/tmp/cruush-1.6-mile-high-club-360x650.png' });
});

test('uses the approved Dark Room name and icon', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await installAppMocks(page, { darkRoomOwner: true, cruushPlus: true });
  await openMap(page);

  const privacyButton = page.getByRole('button', { name: 'Ghost Mode Settings' });
  // The Dark Room mark is drawn, not loaded: an inline svg with no image asset.
  await expect(privacyButton.locator('svg')).toHaveCount(1);
  await expect(privacyButton.locator('img')).toHaveCount(0);
  await privacyButton.tap();
  await expect(page.getByRole('heading', { name: 'Dark Room' })).toBeVisible();
  await expect(page.getByText('Browse the map without appearing on it.', { exact: true })).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Toggle Dark Room' })).toBeChecked();
  await expect(page.getByText('Stealth Mode', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Lurker Mode', { exact: true })).toHaveCount(0);
  await page.screenshot({ path: '/tmp/cruush-1.6-dark-room-412x915.png' });
});

test('uses a pink-forward cruush gradient only while the profile nav icon is active', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installAppMocks(page);
  await page.goto('/profile');

  const profileButton = page.getByTestId('bottom-nav-pill').getByRole('button', {
    name: 'Profile',
    exact: true,
  });
  const activeIcon = page.getByTestId('bottom-nav-profile-icon');
  await expect(profileButton).toHaveAttribute('aria-current', 'page');
  await expect(activeIcon).toHaveAttribute('data-tone', 'gradient');
  const sharedCruushGradient = await page.evaluate(() => {
    const probe = document.createElement('span');
    probe.style.backgroundImage = 'var(--cruush-gradient)';
    document.body.appendChild(probe);
    const backgroundImage = window.getComputedStyle(probe).backgroundImage;
    probe.remove();
    return backgroundImage;
  });
  expect(sharedCruushGradient).toContain('rgb(255, 0, 114)');
  // The active icon ships as the gradient artwork itself, so assert the asset
  // rather than a CSS background on the image element.
  await expect(activeIcon).toHaveAttribute('src', /gradient/);
  await expect(activeIcon).toHaveCSS('width', '44px');
  await expect(activeIcon).toHaveCSS('height', '44px');

  await page.goto('/feed');
  const inactiveIcon = page.getByTestId('bottom-nav-profile-icon');
  await expect(inactiveIcon).toHaveAttribute('data-tone', 'white');
  await expect(inactiveIcon).toHaveCSS('width', '44px');
  await expect(inactiveIcon).toHaveCSS('height', '44px');
});

test('previews four enlarged recently active profiles before horizontal scrolling on desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await installAppMocks(page, { users: desktopRecentlyActiveUsers });
  await page.goto('/map');
  await expect(page.getByTestId('map-home-shell')).toBeVisible();
  await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible();

  // The tray is collapsed behind its own toggle until the user opens it.
  await page.getByRole('button', { name: 'Show recently active bar' }).click();

  const tray = page.getByTestId('recently-active-tray');
  const tiles = tray.locator('[data-testid^="recently-active-tile-"]');
  await expect(tiles).toHaveCount(6);

  const trayBox = await tray.boundingBox();
  expect(trayBox).not.toBeNull();
  for (let index = 0; index < 4; index += 1) {
    const tileBox = await tiles.nth(index).boundingBox();
    expect(tileBox).not.toBeNull();
    expect(tileBox!.x).toBeGreaterThanOrEqual(trayBox!.x);
    expect(tileBox!.x + tileBox!.width).toBeLessThanOrEqual(trayBox!.x + trayBox!.width);
  }

  const fifthTileBox = await tiles.nth(4).boundingBox();
  expect(fifthTileBox).not.toBeNull();
  expect(fifthTileBox!.x + fifthTileBox!.width).toBeGreaterThan(trayBox!.x + trayBox!.width);
  await expect(tiles.nth(3)).toBeInViewport();
  await tiles.nth(3).click();
  await expect(page.getByRole('heading', { name: /^Recent Four/ })).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).first().click();
  await expect(page.getByTestId('map-home-shell')).toBeVisible();
  await page.getByRole('button', { name: 'Show recently active bar' }).click();
  await expect(tray).toBeVisible();

  const scrollMetrics = await tray.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(scrollMetrics.scrollWidth).toBeGreaterThan(scrollMetrics.clientWidth);
  await tray.evaluate((element) => {
    element.style.scrollBehavior = 'auto';
    element.scrollLeft = element.scrollWidth;
  });
  await expect.poll(() => tray.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  const scrolledSixthTileBox = await tiles.nth(5).boundingBox();
  expect(scrolledSixthTileBox).not.toBeNull();
  expect(scrolledSixthTileBox!.x + scrolledSixthTileBox!.width).toBeLessThanOrEqual(trayBox!.x + trayBox!.width);
});

test('selects Seeking and Visibility menu options with real mobile taps', async ({ page }) => {
  const requests = await installAppMocks(page);
  await openMap(page);

  await openMapControls(page);
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

  await openMapControls(page);
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

  await page.getByRole('button', { name: 'Send a Pulse' }).tap();
  await expect(page.getByRole('dialog', { name: 'Send a Pulse' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'cruush+ rewards' }).tap();
  await expect(page.getByRole('heading', { name: 'Rewards & cruush+' })).toBeVisible();
  await page.goto('/map');
  await expect(page.getByRole('button', { name: 'Feed' })).toBeVisible();
  await page.getByRole('button', { name: 'Feed' }).tap();
  await expect(page.getByTestId('local-feed-header').getByRole('heading', { name: 'Feed', exact: true })).toBeVisible();
});

test('keeps the map and Seeking sheet aligned in a short desktop viewport', async ({ browser }) => {
  const desktopContext = await browser.newContext({
    baseURL: 'http://127.0.0.1:4173',
    hasTouch: false,
    isMobile: false,
    serviceWorkers: 'block',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 315 },
  });
  const desktopPage = await desktopContext.newPage();

  try {
    await installAppMocks(desktopPage);
    await openMap(desktopPage);
    await desktopPage.getByTestId('map-controls-trigger').click();
    await expect(desktopPage.getByTestId('map-seeking-button')).toBeVisible();
    await desktopPage.getByTestId('map-seeking-button').click();

    const sheet = desktopPage.getByRole('dialog', { name: 'Seeking Filter' });
    await expect(sheet).toBeVisible();
    await desktopPage.waitForTimeout(550);

    const geometry = await desktopPage.evaluate(() => {
      const bounds = (selector: string) => {
        const element = document.querySelector(selector);
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        return { height: rect.height, top: rect.top, bottom: rect.bottom };
      };

      return {
        viewportHeight: window.innerHeight,
        overlay: bounds('[data-slot="sheet-overlay"]'),
        sheet: bounds('[data-slot="sheet-content"]'),
        mapSurface: bounds('[data-map-gesture-surface]'),
        mapCanvas: bounds('canvas.maplibregl-canvas'),
      };
    });

    expect(geometry.overlay).toEqual({ height: 315, top: 0, bottom: 315 });
    expect(geometry.sheet).toEqual({ height: 315, top: 0, bottom: 315 });
    expect(geometry.mapSurface).toEqual({ height: 315, top: 0, bottom: 315 });
    expect(geometry.mapCanvas).toEqual({ height: 315, top: 0, bottom: 315 });
  } finally {
    await desktopContext.close();
  }
});

test('short tap opens the profile and press-and-hold reveals the signal', async ({ page, context }) => {
  const requests = await installAppMocks(page);
  await openMap(page);

  const marker = page.getByRole('button', { name: 'Open Nearby Ghost on map' });
  await marker.tap();
  await expect(page.getByRole('heading', { name: 'Nearby Ghost' })).toBeVisible();
  expect(requests.some((entry) => new URL(entry.url).pathname === '/api/profiles/nearby-ghost-no-photo')).toBe(true);

  await page.goto('/map');
  await expect(page.getByTestId('map-home-shell')).toBeVisible();
  await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible();
  // The map comes back at the last zoom, where the three neighbours sit in one
  // cluster. Opening it is what a member does to reach the pin.
  const cluster = page.getByRole('button', { name: /^Zoom into .* on map$/ });
  if (await cluster.isVisible({ timeout: 5000 }).catch(() => false)) {
    await cluster.tap();
  }
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
  await expect(marker).toHaveCSS('z-index', '110');
  await expect(page.getByTestId('marker-heart-layer-nearby-ghost-no-photo')).toHaveClass(/scale-\[1\.38\]/);
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
  await expect(ownerHeart.locator('path[stroke="#0BA8FF"]')).toHaveCount(0);
  await expect(page.getByTestId('marker-photo-fill-me')).toHaveCount(0);
  await expect(page.getByTestId('marker-heart-me-ghost-decoy')).toHaveCount(0);

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
  await expect(page.getByText('Ghost Mode Active', { exact: true })).toHaveCount(0);
});

test('resumes the map tutorial after Ghost and Feed route actions', async ({ page }) => {
  await installAppMocks(page);
  await page.goto('/map?replayTutorial=1');
  await expect(page.getByRole('dialog', { name: 'Map controls tutorial' })).toBeVisible();
  const tutorial = page.getByTestId('map-controls-tutorial-card');

  // install, notifications, map controls, seeking, visibility, cruush+,
  // mile high club, spots, crowd mode, then ghost.
  await page.getByTestId('tutorial-skip-step').tap();
  await page.getByTestId('tutorial-skip-step').tap();
  for (let step = 0; step < 7; step += 1) {
    await page.getByTestId('tutorial-next').tap();
  }
  await expect(tutorial.getByRole('heading', { name: 'Ghost Mode' })).toBeVisible();

  await page.getByTestId('tutorial-try-step').tap();
  await expect(page.getByRole('heading', { name: 'Ghost Mode & Dark Room Mode' })).toBeVisible();
  await page.getByRole('button', { name: 'Map', exact: true }).tap();
  await expect(tutorial.getByRole('heading', { name: 'Ghost Mode' })).toBeVisible();

  // ghost, then dl mode, pulse, profile pins, zoom, cruise carousel, your
  // profile, feed.
  for (let step = 0; step < 7; step += 1) {
    await page.getByTestId('tutorial-next').tap();
  }
  await expect(tutorial.getByRole('heading', { name: 'Feed' })).toBeVisible();

  await page.getByTestId('tutorial-try-step').tap();
  await expect(page.getByTestId('local-feed-header').getByRole('heading', { name: 'Feed', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Map', exact: true }).tap();
  await expect(tutorial.getByRole('heading', { name: 'Feed' })).toBeVisible();
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

test('keeps profile Block and Report dialogs inside the Android visual viewport', async ({ context, page }) => {
  await installAppMocks(page);
  await page.goto('/profile/nearby-ghost-photo');
  await expect(page.getByRole('button', { name: 'Block Nearby Photo' })).toBeVisible();

  const cdp = await context.newCDPSession(page);
  const expectInsideVisualViewport = async (selector: string) => {
    const readBounds = () => page.locator(selector).evaluate((node) => {
      const rect = node.getBoundingClientRect();
      const viewport = window.visualViewport;

      if (!viewport) {
        return { inside: true };
      }

      const inside = rect.left >= viewport.offsetLeft
        && rect.top >= viewport.offsetTop
        && rect.right <= viewport.offsetLeft + viewport.width
        && rect.bottom <= viewport.offsetTop + viewport.height;
      return {
        inside,
        dialog: { bottom: rect.bottom, left: rect.left, right: rect.right, top: rect.top },
        viewport: {
          bottom: viewport.offsetTop + viewport.height,
          left: viewport.offsetLeft,
          right: viewport.offsetLeft + viewport.width,
          top: viewport.offsetTop,
        },
      };
    });
    await expect.poll(readBounds).toMatchObject({ inside: true });
  };

  await page.getByRole('button', { name: 'Block Nearby Photo' }).tap();
  await expect(page.locator('[data-slot="alert-dialog-content"]')).toBeVisible();
  await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1.5 });
  await expectInsideVisualViewport('[data-slot="alert-dialog-content"]');

  await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
  await page.getByRole('button', { name: 'Cancel' }).tap();
  await page.getByRole('button', { name: 'Report profile' }).tap();
  await expect(page.locator('[data-slot="dialog-content"]')).toBeVisible();
  await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1.5 });
  await expectInsideVisualViewport('[data-slot="dialog-content"]');
});
