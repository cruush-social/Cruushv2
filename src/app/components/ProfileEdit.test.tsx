import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProfileEdit from './ProfileEdit';

const { getMyProfile, saveMyProfile } = vi.hoisted(() => ({
  getMyProfile: vi.fn(),
  saveMyProfile: vi.fn(),
}));

vi.mock('../lib/profileApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/profileApi')>('../lib/profileApi');

  return {
    ...actual,
    getMyProfile,
    saveMyProfile,
  };
});

describe('ProfileEdit', () => {
  beforeEach(async () => {
    getMyProfile.mockReset();
    saveMyProfile.mockReset();

    const { emptyProfilePayload } = await import('../lib/profileApi');
    const profile = {
      ...emptyProfilePayload,
      id: 'user-1',
      display_name: 'Jordan',
      year_of_birth: 1998,
      position: [],
      role: [],
      kinks: ['leather'],
      kink_interests: [{
        kink_id: 'leather',
        label: 'leather',
      }],
      kinks_visibility: 'public',
      updated_at: '2026-04-29T12:00:00.000Z',
    };

    getMyProfile.mockResolvedValue(profile);
    saveMyProfile.mockResolvedValue(profile);
  });

  it('lets users set master position, master role, and field-level kink visibility', async () => {
    render(
      <MemoryRouter>
        <ProfileEdit />
      </MemoryRouter>
    );

    const intimacyTab = await screen.findByRole('tab', { name: 'Intimacy' });
    fireEvent.pointerDown(intimacyTab, { button: 0, ctrlKey: false });
    fireEvent.click(intimacyTab);

    await waitFor(() => expect(intimacyTab).toHaveAttribute('aria-selected', 'true'));

    expect(await screen.findAllByText('leather')).not.toHaveLength(0);
    expect(screen.queryByLabelText('leather seeking')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('leather receive')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Position' }));
    expect(screen.getByRole('option', { name: 'pillow princess' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'stone top' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'vers bottom' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('option', { name: 'vers top' }));

    fireEvent.click(screen.getByRole('button', { name: 'Role' }));
    fireEvent.click(screen.getByRole('option', { name: 'service' }));

    fireEvent.click(screen.getByRole('button', { name: 'Kinks & Fetishes' }));
    expect(screen.getByRole('group', { name: 'Body & Touch' })).toBeInTheDocument();
    const gearGroup = screen.getByRole('group', { name: 'Gear' });
    expect(within(gearGroup).getByRole('option', { name: 'leather' })).toBeInTheDocument();

    expect(screen.queryByRole('combobox', { name: 'Kinks & Fetishes visibility' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Kinks & Fetishes visibility' }));
    fireEvent.click(screen.getByRole('option', { name: 'Mutual Crowds' }));

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(saveMyProfile).toHaveBeenCalledWith(expect.objectContaining({
      position: ['vers top'],
      role: ['service'],
      kinks_visibility: 'mutual_crowds',
      kink_interests: [expect.objectContaining({
        kink_id: 'leather',
      })],
    })));
    const savedPayload = saveMyProfile.mock.calls[0]?.[0];
    expect(savedPayload).not.toHaveProperty('id');
    expect(savedPayload).not.toHaveProperty('updated_at');
    expect(savedPayload.kink_interests[0]).not.toHaveProperty('roles');
    expect(savedPayload.kink_interests[0]).not.toHaveProperty('is_seeking');
    expect(savedPayload.kink_interests[0]).not.toHaveProperty('visibility');
  });
});
