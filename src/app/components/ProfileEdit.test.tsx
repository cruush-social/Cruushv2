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
    localStorage.clear();
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
      is_trans: false,
      trans_status_visibility: 'public',
      crowds: [],
      kinks: ['leather'],
      kink_interests: [{
        kink_id: 'leather',
        label: 'leather',
        roles: ['give'],
        is_seeking: true,
        visibility: 'public',
      }],
      kinks_visibility: 'public',
      scenes: [],
      archetypes: [],
      hiv_status: [],
      hiv_status_visibility: 'public',
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
    expect(screen.getByRole('tablist', { name: 'Kinks & Fetishes categories' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Body & Touch' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Gear' }));
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

  it('lets users set trans status, crowds, categorized vibes, and HIV visibility', async () => {
    render(
      <MemoryRouter>
        <ProfileEdit />
      </MemoryRouter>
    );

    const profileTab = await screen.findByRole('tab', { name: 'Profile' });
    fireEvent.click(profileTab);

    fireEvent.click(screen.getByRole('button', { name: 'Vibes' }));
    expect(screen.getByRole('tablist', { name: 'Vibes categories' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Style & Energy' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Scenes' }));
    const scenesGroup = screen.getByRole('group', { name: 'Scenes' });
    fireEvent.click(within(scenesGroup).getByRole('option', { name: 'Bear' }));

    fireEvent.click(screen.getByRole('tab', { name: 'Archetypes' }));
    const archetypesGroup = screen.getByRole('group', { name: 'Archetypes' });

    fireEvent.click(within(archetypesGroup).getByRole('option', { name: 'Daddy' }));

    const basicsTab = screen.getByRole('tab', { name: 'Basics' });
    fireEvent.click(basicsTab);
    fireEvent.click(screen.getByRole('checkbox', { name: 'I am trans' }));

    fireEvent.click(screen.getByRole('button', { name: 'Trans status visibility' }));
    fireEvent.click(screen.getByRole('option', { name: 'Mutual Crowds' }));

    fireEvent.click(screen.getByRole('button', { name: 'Crowds' }));
    fireEvent.click(screen.getByRole('option', { name: 'T4T' }));
    fireEvent.click(screen.getByRole('option', { name: 'Sapphic' }));

    const healthTab = screen.getByRole('tab', { name: 'Health' });
    fireEvent.click(healthTab);

    fireEvent.click(screen.getByRole('button', { name: 'HIV Status' }));
    fireEvent.click(screen.getByRole('option', { name: 'undetectable' }));

    fireEvent.click(screen.getByRole('button', { name: 'HIV status visibility' }));
    fireEvent.click(screen.getByRole('option', { name: 'Mutual Cruushes' }));

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(saveMyProfile).toHaveBeenCalledWith(expect.objectContaining({
      is_trans: true,
      trans_status_visibility: 'mutual_crowds',
      crowds: ['T4T', 'Sapphic'],
      vibes: ['Bear', 'Daddy'],
      scenes: [],
      archetypes: [],
      hiv_status: ['undetectable'],
      hiv_status_visibility: 'mutual_cruushes',
    })));
  });

  it('drops stale T4T crowd membership when trans status is not selected', async () => {
    const { emptyProfilePayload } = await import('../lib/profileApi');

    getMyProfile.mockResolvedValueOnce({
      ...emptyProfilePayload,
      id: 'user-1',
      display_name: 'Jordan',
      year_of_birth: 1998,
      is_trans: false,
      crowds: ['T4T', 'Sapphic'],
      visibility_rules: {
        ...emptyProfilePayload.visibility_rules,
        active_crowd_modes: ['T4T', 'Sapphic'],
        looking_for: ['hookup'],
      },
      updated_at: '2026-04-29T12:00:00.000Z',
    });

    render(
      <MemoryRouter>
        <ProfileEdit />
      </MemoryRouter>
    );

    expect(await screen.findByRole('tab', { name: 'Profile' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(saveMyProfile).toHaveBeenCalledWith(expect.objectContaining({
      is_trans: false,
      crowds: ['Sapphic'],
      visibility_rules: expect.objectContaining({
        active_crowd_modes: ['Sapphic'],
        looking_for: ['hookup'],
      }),
    })));
  });

  it('preserves existing visibility rules while saving profile edits', async () => {
    const { emptyProfilePayload } = await import('../lib/profileApi');

    getMyProfile.mockResolvedValueOnce({
      ...emptyProfilePayload,
      id: 'user-1',
      display_name: 'Jordan',
      year_of_birth: 1998,
      is_trans: true,
      crowds: ['T4T', 'Sapphic'],
      visibility_rules: {
        ...emptyProfilePayload.visibility_rules,
        active_crowd_modes: ['T4T'],
        distance: 10,
        looking_for: ['hookup'],
        kinks: ['leather'],
      },
      updated_at: '2026-04-29T12:00:00.000Z',
    });

    render(
      <MemoryRouter>
        <ProfileEdit />
      </MemoryRouter>
    );

    expect(await screen.findByRole('tab', { name: 'Profile' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(saveMyProfile).toHaveBeenCalledWith(expect.objectContaining({
      visibility_rules: expect.objectContaining({
        active_crowd_modes: ['T4T'],
        distance: 10,
        looking_for: ['hookup'],
        kinks: ['leather'],
      }),
    })));
  });

  it('uses the stored session display name when saving a fresh empty profile', async () => {
    const { emptyProfilePayload } = await import('../lib/profileApi');

    localStorage.setItem('cruush_user', JSON.stringify({
      display_name: 'River Local',
    }));
    getMyProfile.mockResolvedValueOnce({
      ...emptyProfilePayload,
      id: 'user-1',
      display_name: '',
      updated_at: '2026-04-29T12:00:00.000Z',
    });

    render(
      <MemoryRouter>
        <ProfileEdit />
      </MemoryRouter>
    );

    expect(await screen.findByRole('tab', { name: 'Profile' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(saveMyProfile).toHaveBeenCalledWith(expect.objectContaining({
      display_name: 'River Local',
    })));
  });
});
