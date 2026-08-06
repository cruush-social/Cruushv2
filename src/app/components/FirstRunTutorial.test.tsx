import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FirstRunTutorial, { FIRST_RUN_TUTORIAL_KEY } from './FirstRunTutorial';
import { FEED_POST_CREATED_EVENT } from './LocalFeed';

const { markNoticeDismissed, resolveNoticeDismissal } = vi.hoisted(() => ({
  markNoticeDismissed: vi.fn(),
  resolveNoticeDismissal: vi.fn(),
}));

vi.mock('../lib/userNoticesApi', () => ({ markNoticeDismissed, resolveNoticeDismissal }));
vi.mock('./LocalFeed', () => ({
  FEED_POST_CREATED_EVENT: 'cruush:feed-post-created',
  default: () => <div />,
}));

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-probe">{location.pathname}</div>;
}

function renderTutorial(pathname = '/map') {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <Routes>
        <Route path="*" element={<LocationProbe />} />
      </Routes>
      <FirstRunTutorial />
    </MemoryRouter>
  );
}

const first = () => screen.findByText('Your link earns you');

describe('FirstRunTutorial', () => {
  beforeEach(() => {
    markNoticeDismissed.mockReset();
    resolveNoticeDismissal.mockReset();
    resolveNoticeDismissal.mockResolvedValue({ dismissed: false, offline: false });
  });

  it('holds the screen until it is answered', async () => {
    renderTutorial();

    const content = await screen.findByTestId('first-run-tutorial');
    expect(content).toHaveAttribute('data-dismissible', 'false');
    expect(content.querySelector('[data-slot="dialog-close"]')).toBeNull();
    expect(document.querySelector('[data-slot="dialog-overlay"]')).toBeInTheDocument();
  });

  // Every step is about a screen, so the tutorial takes the user there first.
  it('navigates to the screen each step is about', async () => {
    renderTutorial();

    await first();
    await waitFor(() => expect(screen.getByTestId('location-probe')).toHaveTextContent('/rewards'));

    fireEvent.click(screen.getByTestId('tutorial-next'));
    expect(screen.getByText('Who can see you')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('location-probe')).toHaveTextContent('/map'));

    fireEvent.click(screen.getByTestId('tutorial-next'));
    expect(screen.getByText('Who you see')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('tutorial-next'));
    expect(screen.getByText('Ghost Mode')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('tutorial-next'));
    expect(screen.getByText('DL Mode')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('tutorial-next'));
    expect(screen.getByText('Say something to the block')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('location-probe')).toHaveTextContent('/feed'));
  });

  it('will not leave the feed step until a post is actually made', async () => {
    renderTutorial();
    await first();

    for (let step = 0; step < 5; step += 1) {
      fireEvent.click(screen.getByTestId('tutorial-next'));
    }

    expect(screen.getByText('Say something to the block')).toBeInTheDocument();
    expect(screen.getByTestId('tutorial-next')).toBeDisabled();
    expect(screen.getByTestId('tutorial-next')).toHaveTextContent('Post to continue');
    // Nobody is trapped: skip is still there.
    expect(screen.getByTestId('skip-tutorial')).toBeEnabled();

    window.dispatchEvent(new CustomEvent(FEED_POST_CREATED_EVENT));

    await waitFor(() => expect(screen.getByTestId('tutorial-next')).toBeEnabled());
    fireEvent.click(screen.getByTestId('tutorial-next'));
    expect(screen.getByText('Something broken?')).toBeInTheDocument();
  });

  // The card has to dodge the thing it is pointing at, and it must never clip.
  it('puts the card opposite the control and caps its height', async () => {
    const target = document.createElement('div');
    target.dataset.testid = 'map-visibility-button';
    // Near the top of the viewport, so the card belongs at the bottom.
    target.getBoundingClientRect = () => ({ x: 8, y: 20, left: 8, top: 20, width: 90, height: 32, right: 98, bottom: 52, toJSON: () => ({}) }) as DOMRect;
    document.body.appendChild(target);

    renderTutorial();
    await first();
    fireEvent.click(screen.getByTestId('tutorial-next'));

    await screen.findByTestId('tutorial-spotlight');
    const card = screen.getByTestId('first-run-tutorial');
    expect(card.className).toContain('bottom-6');
    expect(card.className).toContain('max-h-[calc(100dvh-3rem)]');
    expect(card.className).toContain('overflow-y-auto');
    target.remove();
  });

  it('rings the control each step describes', async () => {
    const target = document.createElement('div');
    target.dataset.testid = 'map-visibility-button';
    target.getBoundingClientRect = () => ({ x: 8, y: 8, left: 8, top: 8, width: 90, height: 32, right: 98, bottom: 40, toJSON: () => ({}) }) as DOMRect;
    document.body.appendChild(target);

    renderTutorial();
    await first();

    fireEvent.click(screen.getByTestId('tutorial-next'));

    expect(await screen.findByTestId('tutorial-spotlight')).toBeInTheDocument();
    target.remove();
  });

  it('records the dismissal only once the user skips or finishes', async () => {
    renderTutorial();
    await first();

    expect(markNoticeDismissed).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('skip-tutorial'));

    expect(markNoticeDismissed).toHaveBeenCalledWith(FIRST_RUN_TUTORIAL_KEY, { offline: false });
    expect(screen.queryByTestId('first-run-tutorial')).not.toBeInTheDocument();
  });

  it('stays closed once it has been seen', async () => {
    resolveNoticeDismissal.mockResolvedValue({ dismissed: true, offline: false });
    renderTutorial();

    await waitFor(() => expect(resolveNoticeDismissal).toHaveBeenCalled());
    expect(screen.queryByTestId('first-run-tutorial')).not.toBeInTheDocument();
  });

  // Regression: a notices-API error used to suppress first-run popups outright.
  it('still runs when the notices API is unreachable, without a server write', async () => {
    resolveNoticeDismissal.mockResolvedValue({ dismissed: false, offline: true });
    renderTutorial();

    await first();
    fireEvent.click(screen.getByTestId('skip-tutorial'));

    expect(markNoticeDismissed).toHaveBeenCalledWith(FIRST_RUN_TUTORIAL_KEY, { offline: true });
  });

  it('does not start away from the map', async () => {
    renderTutorial('/messages');

    await waitFor(() => expect(resolveNoticeDismissal).not.toHaveBeenCalled());
    expect(screen.queryByTestId('first-run-tutorial')).not.toBeInTheDocument();
  });
});
