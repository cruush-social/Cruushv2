import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetExclusivePopupsForTest, useExclusivePopup, type ExclusivePopupId } from '../lib/popupQueue';

const { getMyProfile } = vi.hoisted(() => ({ getMyProfile: vi.fn() }));
vi.mock('../lib/profileApi', () => ({ getMyProfile, PROFILE_CHANGED_EVENT: 'cruush:profile-changed' }));
import PurgatoryInfoPrompt, { purgatoryPromptHandledKey } from './PurgatoryInfoPrompt';

function EarlierPrompt({ id, wants }: { id: ExclusivePopupId; wants: boolean }) {
  return useExclusivePopup(id, wants) ? <div data-testid={id} /> : null;
}
const dialog = () => screen.queryByRole('dialog', { name: 'Purgatory' });

describe('PurgatoryInfoPrompt', () => {
  beforeEach(() => {
    localStorage.clear();
    resetExclusivePopupsForTest();
    getMyProfile.mockReset();
    getMyProfile.mockResolvedValue({ outOfSight: true });
  });

  it('still opens and dismisses when browser storage reads and writes throw', async () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Storage blocked'); });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage blocked'); });
    try {
      render(<PurgatoryInfoPrompt userId="storage-blocked" />);
      fireEvent.click(await screen.findByRole('button', { name: 'Got it' }));
      expect(dialog()).not.toBeInTheDocument();
      await act(async () => { window.dispatchEvent(new Event('cruush:profile-changed')); });
      expect(dialog()).not.toBeInTheDocument();
    } finally { get.mockRestore(); set.mockRestore(); }
  });

  it('explains Purgatory to an outside member', async () => {
    render(<PurgatoryInfoPrompt userId="outside" />);
    expect(await screen.findByRole('dialog', { name: 'Purgatory' })).toBeInTheDocument();
    expect(screen.getByText('Purgatory is for members outside cruush’s service area. You can still post, message, and connect on cruush.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Got it' })).toHaveFocus();
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'This is a Purgatory member.' }));
    expect(await screen.findByRole('tooltip')).toBeInTheDocument();
  });

  it('defers during active MHC without marking handled, then appears after MHC ends', async () => {
    getMyProfile.mockResolvedValue({ outOfSight: true, travelling: true });
    await act(async () => { render(<PurgatoryInfoPrompt userId="travelling" />); });
    expect(dialog()).not.toBeInTheDocument();
    expect(localStorage.getItem(purgatoryPromptHandledKey('travelling'))).toBeNull();
    getMyProfile.mockResolvedValue({ outOfSight: true, travelling: false });
    await act(async () => { window.dispatchEvent(new Event('cruush:profile-changed')); });
    expect(dialog()).toBeInTheDocument();
  });

  it.each([false, undefined])('does not show without confirmed Purgatory membership (%s)', async (outOfSight) => {
    getMyProfile.mockResolvedValue({ outOfSight });
    await act(async () => { render(<PurgatoryInfoPrompt userId="inside" />); });
    expect(dialog()).not.toBeInTheDocument();
  });

  it('fails closed when membership cannot be loaded', async () => {
    getMyProfile.mockRejectedValue(new Error('Offline'));
    await act(async () => { render(<PurgatoryInfoPrompt userId="unknown" />); });
    expect(dialog()).not.toBeInTheDocument();
  });

  it('dismisses once per account and does not suppress another account', async () => {
    const first = render(<PurgatoryInfoPrompt userId="first" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Got it' }));
    expect(localStorage.getItem(purgatoryPromptHandledKey('first'))).toBe('true');
    first.unmount();
    const same = render(<PurgatoryInfoPrompt userId="first" />);
    expect(dialog()).not.toBeInTheDocument();
    same.unmount();
    render(<PurgatoryInfoPrompt userId="second" />);
    expect(await screen.findByRole('dialog', { name: 'Purgatory' })).toBeInTheDocument();
  });

  it('waits for both earlier prompts to release the screen', async () => {
    const prompts = (push: boolean, install: boolean) => <>
      <PurgatoryInfoPrompt userId="outside" />
      <EarlierPrompt id="mobile-install" wants={install} />
      <EarlierPrompt id="push-permission" wants={push} />
    </>;
    const view = render(prompts(true, true));
    await act(async () => {});
    expect(screen.getByTestId('push-permission')).toBeInTheDocument();
    expect(dialog()).not.toBeInTheDocument();
    view.rerender(prompts(false, true));
    expect(screen.getByTestId('mobile-install')).toBeInTheDocument();
    expect(dialog()).not.toBeInTheDocument();
    view.rerender(prompts(false, false));
    expect(dialog()).toBeInTheDocument();
  });

  it('ignores membership from a previous account after account changes', async () => {
    let resolveOld!: (profile: { outOfSight: boolean }) => void;
    getMyProfile.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
    const view = render(<PurgatoryInfoPrompt userId="old" />);
    getMyProfile.mockResolvedValue({ outOfSight: false });
    await act(async () => { view.rerender(<PurgatoryInfoPrompt userId="new" />); });
    await act(async () => { resolveOld({ outOfSight: true }); });
    expect(dialog()).not.toBeInTheDocument();
  });

  it('refreshes eligibility and ignores a stale earlier response', async () => {
    let resolveOld!: (profile: { outOfSight: boolean }) => void;
    getMyProfile.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
    render(<PurgatoryInfoPrompt userId="member" />);
    getMyProfile.mockResolvedValue({ outOfSight: false });
    await act(async () => { window.dispatchEvent(new Event('cruush:profile-changed')); });
    await act(async () => { resolveOld({ outOfSight: true }); });
    expect(dialog()).not.toBeInTheDocument();
    getMyProfile.mockResolvedValue({ outOfSight: true });
    await act(async () => { window.dispatchEvent(new Event('cruush:profile-changed')); });
    expect(dialog()).toBeInTheDocument();
  });
});
