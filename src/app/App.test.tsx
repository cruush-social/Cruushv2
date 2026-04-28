import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

vi.mock('./components/MapHome', () => ({
  default: () => <div>Mock Map</div>
}));

vi.mock('./components/LocalFeed', () => ({
  default: () => <div>Mock Feed</div>
}));

vi.mock('./components/ProfileView', () => ({
  default: () => <div>Mock Profile</div>
}));

vi.mock('./components/ProfileEdit', () => ({
  default: () => <div>Mock Profile Edit</div>
}));

vi.mock('./components/ProfileOnboarding', () => ({
  default: () => <div>Mock Onboarding</div>
}));

vi.mock('./components/FiltersPanel', () => ({
  default: () => <div>Mock Filters</div>
}));

vi.mock('./components/SafetyCenter', () => ({
  default: () => <div>Mock Safety</div>
}));

vi.mock('./components/GroupDetail', () => ({
  default: () => <div>Mock Group</div>
}));

vi.mock('./components/EventDetail', () => ({
  default: () => <div>Mock Event</div>
}));

vi.mock('./components/PlaceDetail', () => ({
  default: () => <div>Mock Place</div>
}));

vi.mock('./components/PrivateGroupChat', () => ({
  default: () => <div>Mock Group Chat</div>
}));

vi.mock('./components/DirectMessages', () => ({
  default: () => <div>Mock Messages</div>
}));

vi.mock('./components/CruushActivity', () => ({
  default: () => <div>Mock Cruush</div>
}));

vi.mock('./components/Auth', () => ({
  default: () => <div>Mock Auth</div>
}));

vi.mock('./components/Settings', () => ({
  default: () => <div>Mock Settings</div>
}));

vi.mock('./components/FeelingLucky', () => ({
  default: () => <div>Mock Lucky</div>
}));

vi.mock('./components/RequestsDashboard', () => ({
  default: () => <div>Mock Requests</div>
}));

vi.mock('./components/BottomNav', () => ({
  default: () => <nav aria-label="Bottom Navigation">Mock Bottom Nav</nav>
}));

describe('App', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState({}, '', '/');
    localStorage.setItem('cruush_auth', 'true');
    localStorage.setItem('cruush_user', JSON.stringify({ name: 'Test User', age: 28 }));
  });

  it('renders the authenticated shell without crashing', async () => {
    render(<App />);

    expect(await screen.findByText('Mock Feed')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Bottom Navigation' })).toBeInTheDocument();
  });
});
