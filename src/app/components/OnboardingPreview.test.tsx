import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OnboardingPreview from './OnboardingPreview';

const { getCurrentUserId } = vi.hoisted(() => ({
  getCurrentUserId: vi.fn(),
}));

const { previewableNotices, resetPreviewableNotices } = vi.hoisted(() => ({
  previewableNotices: vi.fn(),
  resetPreviewableNotices: vi.fn(),
}));

vi.mock('../lib/sessionUser', () => ({
  getCurrentUserId,
}));

vi.mock('../lib/onboardingPreview', () => ({
  previewableNotices,
  resetPreviewableNotices,
}));

vi.mock('./ProfileOnboarding', () => ({
  default: ({ onComplete }: { onComplete: () => void }) => (
    <div>
      <div>Mock full tutorial</div>
      <button type="button" onClick={onComplete}>Complete full tutorial</button>
    </div>
  ),
}));

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-probe">{location.pathname}</div>;
}

function renderPreview() {
  return render(
    <MemoryRouter initialEntries={['/dev/onboarding-preview']}>
      <Routes>
        <Route path="/dev/onboarding-preview" element={<OnboardingPreview />} />
        <Route path="/map" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('OnboardingPreview', () => {
  beforeEach(() => {
    getCurrentUserId.mockReset();
    previewableNotices.mockReset();
    resetPreviewableNotices.mockReset();

    getCurrentUserId.mockResolvedValue('user-123');
    previewableNotices.mockReturnValue([
      { key: 'notice-one', label: 'Notice one', description: 'First notice.' },
      { key: 'notice-two:user-123', label: 'Notice two', description: 'Second notice.' },
    ]);
    resetPreviewableNotices.mockResolvedValue(undefined);
  });

  it('replays the whole tutorial instead of exposing individual dialog resets', async () => {
    renderPreview();

    expect(screen.queryByText('Explainer dialogs')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reset all' })).not.toBeInTheDocument();

    const replayButton = screen.getByRole('button', { name: 'Replay tutorial' });
    expect(replayButton).toBeDisabled();

    await waitFor(() => expect(replayButton).not.toBeDisabled());
    fireEvent.click(replayButton);

    await waitFor(() => expect(resetPreviewableNotices).toHaveBeenCalledWith([
      'notice-one',
      'notice-two:user-123',
    ]));
    expect(await screen.findByText('Mock full tutorial')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Complete full tutorial' }));

    expect(screen.getByTestId('location-probe')).toHaveTextContent('/map');
  });
});
