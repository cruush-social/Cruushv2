import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MapPresenceSettings from './MapPresenceSettings';

const { getMapPresence, saveMapPresence } = vi.hoisted(() => ({
  getMapPresence: vi.fn(),
  saveMapPresence: vi.fn(),
}));

vi.mock('../lib/privacyApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/privacyApi')>('../lib/privacyApi');
  return {
    ...actual,
    getMapPresence,
    saveMapPresence,
  };
});

describe('MapPresenceSettings', () => {
  beforeEach(() => {
    window.localStorage.clear();
    getMapPresence.mockReset();
    saveMapPresence.mockReset();
    getMapPresence.mockResolvedValue({ hours: 168, minHours: 1, maxHours: 168 });
    saveMapPresence.mockImplementation(async (hours: number) => ({ hours, minHours: 1, maxHours: 168 }));
  });

  it('offers explicit hour and day stops through seven days', async () => {
    render(
      <MemoryRouter>
        <MapPresenceSettings />
      </MemoryRouter>,
    );

    expect(await screen.findByText('7 days')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Set map presence to 1 hour' })).toHaveTextContent('1h');
    expect(screen.getByRole('button', { name: 'Set map presence to 48 hours' })).toHaveTextContent('48h');
    expect(screen.getByRole('button', { name: 'Set map presence to 7 days' })).toHaveTextContent('7d');

    fireEvent.click(screen.getByRole('button', { name: 'Set map presence to 3 hours' }));
    expect(screen.getByText('You stay on the map for 3 hours after you were last active.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(saveMapPresence).toHaveBeenCalledWith(3));
  });

  it('keeps no-label behavior out of Map presence', async () => {
    render(
      <MemoryRouter>
        <MapPresenceSettings />
      </MemoryRouter>,
    );

    await screen.findByText('Distance labels');
    expect(screen.queryByText('No labels')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Approximate/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Precise/i })).toBeInTheDocument();
  });
});
