import { useState } from 'react';
import { CruushIcon, type CruushIconName } from './CruushIconImage';
import './FrostedGlassPreview.css';

type PreviewScreen = 'map' | 'feed' | 'profile' | 'messages' | 'settings';

const PREVIEW_SCREENS: Array<{
  id: PreviewScreen;
  label: string;
  icon: CruushIconName;
}> = [
  { id: 'map', label: 'Map', icon: 'map' },
  { id: 'feed', label: 'Feed', icon: 'feed' },
  { id: 'profile', label: 'Profile', icon: 'profile' },
  { id: 'messages', label: 'Messages', icon: 'messages' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];

function getInitialPreviewScreen(): PreviewScreen {
  const screen = new URLSearchParams(window.location.search).get('screen');
  return PREVIEW_SCREENS.some((option) => option.id === screen)
    ? (screen as PreviewScreen)
    : 'map';
}

function setPreviewQuery(screen: PreviewScreen) {
  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set('screen', screen);
  window.history.replaceState({}, '', nextUrl);
}

function HeartMapPin({
  className,
  testId,
}: {
  className: string;
  testId: string;
}) {
  return (
    <div className={`frosted-preview-heart-pin ${className}`} data-testid={testId}>
      <svg aria-hidden="true" focusable="false" viewBox="0 0 112 100">
        <path
          className="frosted-preview-heart-pin-shape"
          d="M56 91C50 82 40 75 30 68C18 60 8 49 8 33C8 17 20 7 35 7C44 7 52 12 56 20C60 12 68 7 77 7C92 7 104 17 104 33C104 49 94 60 82 68C72 75 62 82 56 91Z"
        />
        <circle className="frosted-preview-heart-pin-halo" cx="56" cy="52" r="23" />
        <circle className="frosted-preview-heart-pin-person-ring" cx="56" cy="51" r="12" />
        <circle className="frosted-preview-heart-pin-person-head" cx="56" cy="46" r="4" />
        <path className="frosted-preview-heart-pin-person-body" d="M47 60C49 54 52 52 56 52C60 52 63 54 65 60" />
      </svg>
    </div>
  );
}

function PreviewMap() {
  return (
    <div className="frosted-preview-map-screen" data-testid="frosted-preview-map-screen">
      <div className="frosted-preview-pill-row frosted-preview-pill-row-top">
        <div className="frosted-preview-chip frosted-preview-chip-small">NYC BETA</div>
        <div className="frosted-preview-chip frosted-preview-chip-wide">
          <CruushIcon className="frosted-preview-chip-icon" name="ghost" variant="colored" />
          <span>GHOST MODE ACTIVE</span>
        </div>
      </div>

      <div className="frosted-preview-pill-row frosted-preview-pill-row-action">
        <button className="frosted-preview-glass-button" type="button">
          <CruushIcon className="frosted-preview-button-icon" name="safety" variant="white" />
          <span>SEEKING</span>
        </button>
        <button className="frosted-preview-gradient-button" type="button">
          <CruushIcon className="frosted-preview-button-icon" name="visibility" variant="colored" />
          <span>VISIBILITY</span>
        </button>
      </div>

      <div className="frosted-preview-radius-ring" aria-hidden="true" />
      <div className="frosted-preview-radius-core" aria-hidden="true" />

      <HeartMapPin
        className="frosted-preview-heart-pin-primary"
        testId="frosted-preview-heart-pin-primary"
      />
      <HeartMapPin
        className="frosted-preview-heart-pin-secondary"
        testId="frosted-preview-heart-pin-secondary"
      />

      <div className="frosted-preview-zoom-stack" aria-label="Map controls">
        <button aria-label="Locate" className="frosted-preview-round-button" type="button">
          <CruushIcon className="frosted-preview-round-icon" name="map" variant="white" />
        </button>
        <button aria-label="Zoom in" className="frosted-preview-round-button" type="button">+</button>
        <button aria-label="Zoom out" className="frosted-preview-round-button" type="button">-</button>
      </div>
    </div>
  );
}

function PreviewFeed() {
  return (
    <div className="frosted-preview-content-screen" data-testid="frosted-preview-feed-screen">
      <section className="frosted-preview-panel frosted-preview-panel-feature">
        <div className="frosted-preview-panel-kicker">LOCAL PULSE</div>
        <h2>Tonight feels close.</h2>
        <p>Nearby signals sit on clear glass while the map stays visible behind the feed.</p>
      </section>

      <section className="frosted-preview-panel frosted-preview-feed-grid">
        <div>
          <span className="frosted-preview-count">12</span>
          <span className="frosted-preview-label">live signals</span>
        </div>
        <div>
          <span className="frosted-preview-count">4</span>
          <span className="frosted-preview-label">nearby circles</span>
        </div>
      </section>

      <section className="frosted-preview-panel frosted-preview-event-card">
        <div className="frosted-preview-panel-kicker">AFTER DARK</div>
        <h3>Frosted event card</h3>
        <div className="frosted-preview-event-meter">
          <span />
        </div>
      </section>
    </div>
  );
}

function PreviewProfile() {
  return (
    <div className="frosted-preview-content-screen" data-testid="frosted-preview-profile-screen">
      <section className="frosted-preview-panel frosted-preview-profile-card">
        <div className="frosted-preview-avatar-shell">
          <CruushIcon className="frosted-preview-avatar-icon" name="cruush" variant="white" />
        </div>
        <div>
          <div className="frosted-preview-panel-kicker">YOUR PROFILE</div>
          <h2>Glass identity</h2>
          <p>Profile details read like etched labels over a luminous, code-rendered surface.</p>
        </div>
      </section>

      <section className="frosted-preview-panel frosted-preview-tag-panel">
        <span>SAFE</span>
        <span>VISIBLE</span>
        <span>NEARBY</span>
        <span>GHOST READY</span>
      </section>

      <section className="frosted-preview-panel frosted-preview-preview-card">
        <div className="frosted-preview-mini-map" aria-hidden="true" />
        <div>
          <h3>Map preview</h3>
          <p>Your card can preview radius and visibility without losing the frosted style.</p>
        </div>
      </section>
    </div>
  );
}

function PreviewMessages() {
  return (
    <div className="frosted-preview-content-screen" data-testid="frosted-preview-messages-screen">
      <section className="frosted-preview-panel frosted-preview-message-header">
        <CruushIcon className="frosted-preview-message-icon" name="messages" variant="white" />
        <div>
          <div className="frosted-preview-panel-kicker">MESSAGES</div>
          <h2>Soft glass inbox</h2>
        </div>
      </section>

      <section className="frosted-preview-panel frosted-preview-thread-card">
        <span className="frosted-preview-thread-dot" />
        <div>
          <h3>New cruush request</h3>
          <p>Incoming states can glow without exposing private content in the preview.</p>
        </div>
      </section>

      <section className="frosted-preview-panel frosted-preview-thread-card frosted-preview-thread-card-muted">
        <span className="frosted-preview-thread-dot" />
        <div>
          <h3>Muted thread state</h3>
          <p>Lower contrast glass keeps inactive rows calm and scannable.</p>
        </div>
      </section>
    </div>
  );
}

function PreviewSettings() {
  return (
    <div className="frosted-preview-content-screen" data-testid="frosted-preview-settings-screen">
      <section className="frosted-preview-panel frosted-preview-settings-panel">
        <div>
          <div className="frosted-preview-panel-kicker">PRIVACY</div>
          <h2>Glass controls</h2>
        </div>
        <label className="frosted-preview-toggle">
          <input defaultChecked type="checkbox" />
          <span />
        </label>
      </section>

      <section className="frosted-preview-panel frosted-preview-slider-panel">
        <div>
          <h3>Map clarity</h3>
          <p>After onboarding, only the controls stay frosted.</p>
        </div>
        <input aria-label="Map clarity" defaultValue="86" max="100" min="0" type="range" />
      </section>

      <section className="frosted-preview-panel frosted-preview-setting-row">
        <span>Turnstile surface</span>
        <strong>Hidden until needed</strong>
      </section>
    </div>
  );
}

function PreviewScreen({ screen }: { screen: PreviewScreen }) {
  if (screen === 'feed') {
    return <PreviewFeed />;
  }

  if (screen === 'profile') {
    return <PreviewProfile />;
  }

  if (screen === 'messages') {
    return <PreviewMessages />;
  }

  if (screen === 'settings') {
    return <PreviewSettings />;
  }

  return <PreviewMap />;
}

export default function FrostedGlassPreview() {
  const [activeScreen, setActiveScreen] = useState<PreviewScreen>(getInitialPreviewScreen);

  const handleScreenChange = (screen: PreviewScreen) => {
    setActiveScreen(screen);
    setPreviewQuery(screen);
  };

  return (
    <section className="frosted-preview-shell" data-testid="frosted-preview-shell">
      <div className="frosted-preview-device">
        <div className="frosted-preview-background" aria-hidden="true">
          <span className="frosted-preview-road frosted-preview-road-1" />
          <span className="frosted-preview-road frosted-preview-road-2" />
          <span className="frosted-preview-road frosted-preview-road-3" />
          <span className="frosted-preview-road frosted-preview-road-4" />
          <span className="frosted-preview-road frosted-preview-road-5" />
          <span className="frosted-preview-street frosted-preview-street-1">Atlantic Avenue</span>
          <span className="frosted-preview-street frosted-preview-street-2">Franklin Avenue</span>
          <span className="frosted-preview-street frosted-preview-street-3">Bedford Avenue</span>
          <span className="frosted-preview-street frosted-preview-street-4">Fulton Street</span>
        </div>

        <header className="frosted-preview-header">
          <div className="frosted-preview-logo-lockup">
            <CruushIcon className="frosted-preview-logo-icon" name="cruush" variant="white" />
            <span className="cruush-logo-font frosted-preview-logo-text">cruush</span>
          </div>
          <div className="frosted-preview-status-strip" aria-hidden="true">
            <CruushIcon className="frosted-preview-status-icon" name="ghost" variant="colored" />
            <CruushIcon className="frosted-preview-status-icon" name="safety" variant="white" />
            <CruushIcon className="frosted-preview-status-icon" name="lucky" variant="white" />
          </div>
        </header>

        <main className={`frosted-preview-main frosted-preview-main-${activeScreen}`}>
          <PreviewScreen screen={activeScreen} />
        </main>

        <nav className="frosted-preview-dock" aria-label="Frosted preview screens">
          {PREVIEW_SCREENS.map((screen) => (
            <button
              aria-label={`${screen.label} preview`}
              aria-pressed={activeScreen === screen.id}
              className="frosted-preview-dock-button"
              data-active={activeScreen === screen.id ? 'true' : 'false'}
              key={screen.id}
              onClick={() => handleScreenChange(screen.id)}
              type="button"
            >
              <CruushIcon
                className="frosted-preview-dock-icon"
                name={screen.icon}
                variant={activeScreen === screen.id ? 'colored' : 'white'}
              />
            </button>
          ))}
        </nav>
      </div>
    </section>
  );
}
