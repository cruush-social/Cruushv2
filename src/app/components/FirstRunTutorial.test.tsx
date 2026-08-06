import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FirstRunTutorial, { FIRST_RUN_TUTORIAL_KEY } from './FirstRunTutorial';

const { markNoticeDismissed, resolveNoticeDismissal } = vi.hoisted(() => ({
  markNoticeDismissed: vi.fn(),
  resolveNoticeDismissal: vi.fn(),
}));

vi.mock('../lib/userNoticesApi', () => ({ markNoticeDismissed, resolveNoticeDismissal }));
vi.mock('../lib/rewardsApi', () => ({ claimBetaLaunchCruushPlus: vi.fn().mockResolvedValue({}) }));

function renderTutorial(pathname = '/map') {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <FirstRunTutorial />
    </MemoryRouter>
  );
}

describe('FirstRunTutorial', () => {
  beforeEach(() => {
    markNoticeDismissed.mockReset();
    resolveNoticeDismissal.mockReset();
    resolveNoticeDismissal.mockResolvedValue({ dismissed: false, offline: false });
  });

  it('holds the screen until it is answered', async () => {
    renderTutorial();

    const content = await screen.findByTestId('first-run-tutorial');
    // No X, no click-away, no Esc: it is a tutorial, not a notice to scroll past.
    expect(content).toHaveAttribute('data-dismissible', 'false');
    expect(content.querySelector('[data-slot="dialog-close"]')).toBeNull();
    expect(document.querySelector('[data-slot="dialog-overlay"]')).toBeInTheDocument();
  });

  it('steps through every stage and ends on the cruush+ offer', async () => {
    renderTutorial();

    expect(await screen.findByText('DL Mode is on')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('tutorial-next'));
    expect(screen.getByText('The map is the app')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('tutorial-next'));
    expect(screen.getByText('Say something to the block')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('tutorial-next'));
    expect(screen.getByText('Something broken?')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('tutorial-next'));
    expect(screen.getByRole('button', { name: 'Activate' })).toBeInTheDocument();
    expect(screen.queryByTestId('tutorial-next')).not.toBeInTheDocument();
  });

  // The step that says "tap the bug icon" has to point at the bug icon.
  it('rings the bug button on the step that describes it', async () => {
    const slot = document.createElement('div');
    slot.dataset.testid = 'alpha-bug-button';
    slot.getBoundingClientRect = () => ({ x: 8, y: 8, left: 8, top: 8, width: 44, height: 44, right: 52, bottom: 52, toJSON: () => ({}) }) as DOMRect;
    document.body.appendChild(slot);

    renderTutorial();
    await screen.findByText('DL Mode is on');

    expect(screen.queryByTestId('tutorial-spotlight')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('tutorial-next'));
    fireEvent.click(screen.getByTestId('tutorial-next'));
    fireEvent.click(screen.getByTestId('tutorial-next'));

    expect(await screen.findByTestId('tutorial-spotlight')).toBeInTheDocument();
    slot.remove();
  });

  it('records the dismissal only once the user skips or finishes', async () => {
    renderTutorial();
    await screen.findByText('DL Mode is on');

    // Showing it is not the same as acknowledging it.
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

    await screen.findByText('DL Mode is on');
    fireEvent.click(screen.getByTestId('skip-tutorial'));

    expect(markNoticeDismissed).toHaveBeenCalledWith(FIRST_RUN_TUTORIAL_KEY, { offline: true });
  });

  it('does not fire away from the map', async () => {
    renderTutorial('/messages');

    await waitFor(() => expect(resolveNoticeDismissal).not.toHaveBeenCalled());
    expect(screen.queryByTestId('first-run-tutorial')).not.toBeInTheDocument();
  });
});
