import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LOGIN_POPUP_GAP_MS, resetExclusivePopupsForTest, useExclusivePopup, type ExclusivePopupId } from './popupQueue';

function Prompt({ id, wants }: { id: ExclusivePopupId; wants: boolean }) {
  const showing = useExclusivePopup(id, wants);
  return showing ? <div data-testid={id}>{id}</div> : null;
}

describe('useExclusivePopup', () => {
  beforeEach(() => {
    resetExclusivePopupsForTest();
  });

  it('shows only the highest priority prompt when several want the screen', () => {
    render(
      <>
        <Prompt id="first-feed-post" wants />
        <Prompt id="push-permission" wants />
        <Prompt id="dl-mode-default" wants />
        <Prompt id="mobile-install" wants />
        <Prompt id="pulse-gesture" wants />
      </>,
    );

    expect(screen.getByTestId('push-permission')).toBeInTheDocument();
    expect(screen.queryByTestId('dl-mode-default')).not.toBeInTheDocument();
    expect(screen.queryByTestId('first-feed-post')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mobile-install')).not.toBeInTheDocument();
    expect(screen.queryByTestId('pulse-gesture')).not.toBeInTheDocument();
  });

  it('shows push permission after the map tutorial releases the slot', () => {
    render(
      <>
        <Prompt id="push-permission" wants />
        <Prompt id="map-tutorial" wants />
      </>,
    );

    expect(screen.getByTestId('map-tutorial')).toBeInTheDocument();
    expect(screen.queryByTestId('push-permission')).not.toBeInTheDocument();
  });

  it('keeps the existing first-entry order after push permission', () => {
    render(
      <>
        <Prompt id="push-permission" wants />
        <Prompt id="dl-mode-default" wants />
      </>,
    );

    expect(screen.getByTestId('push-permission')).toBeInTheDocument();
    expect(screen.queryByTestId('dl-mode-default')).not.toBeInTheDocument();
  });

  it('keeps lower-priority prompts queued behind the restored prompt', () => {
    render(
      <>
        <Prompt id="push-permission" wants />
        <Prompt id="first-feed-post" wants />
        <Prompt id="mobile-install" wants />
        <Prompt id="pulse-gesture" wants />
      </>,
    );

    expect(screen.getByTestId('push-permission')).toBeInTheDocument();
    expect(screen.queryByTestId('first-feed-post')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mobile-install')).not.toBeInTheDocument();
    expect(screen.queryByTestId('pulse-gesture')).not.toBeInTheDocument();
  });

  it('hands the screen to the next prompt once the holder stops wanting it', () => {
    const view = render(
      <>
        <Prompt id="dl-mode-default" wants />
        <Prompt id="first-feed-post" wants />
      </>,
    );

    expect(screen.getByTestId('dl-mode-default')).toBeInTheDocument();

    view.rerender(
      <>
        <Prompt id="dl-mode-default" wants={false} />
        <Prompt id="first-feed-post" wants />
      </>,
    );

    expect(screen.queryByTestId('dl-mode-default')).not.toBeInTheDocument();
    expect(screen.getByTestId('first-feed-post')).toBeInTheDocument();
  });

  afterEach(() => { vi.useRealTimers(); });

  it('spaces push and install by thirty seconds', () => {
    vi.useFakeTimers();
    const view = render(
      <>
        <Prompt id="mobile-install" wants />
        <Prompt id="push-permission" wants />
      </>,
    );

    expect(screen.getByTestId('push-permission')).toBeInTheDocument();
    expect(screen.queryByTestId('mobile-install')).not.toBeInTheDocument();

    view.rerender(
      <>
        <Prompt id="mobile-install" wants />
        <Prompt id="push-permission" wants={false} />
      </>,
    );

    expect(screen.queryByTestId('push-permission')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mobile-install')).not.toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(LOGIN_POPUP_GAP_MS - 1); });
    expect(screen.queryByTestId('mobile-install')).not.toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(1); });
    expect(screen.getByTestId('mobile-install')).toBeInTheDocument();
  });

  it('keeps the map tutorial and a dialog prompt from running together', () => {
    // The tutorial portals above the dialogs rather than being one, so while a
    // dialog was open its buttons sat inside that dialog's outside-click layer
    // and did nothing when tapped.
    render(
      <>
        <Prompt id="first-feed-post" wants />
        <Prompt id="map-tutorial" wants />
      </>,
    );

    expect(screen.getByTestId('map-tutorial')).toBeInTheDocument();
    expect(screen.queryByTestId('first-feed-post')).not.toBeInTheDocument();
  });

  it('releases the screen when the holder unmounts', () => {
    const view = render(
      <>
        <Prompt id="dl-mode-default" wants />
        <Prompt id="first-feed-post" wants />
      </>,
    );

    expect(screen.getByTestId('dl-mode-default')).toBeInTheDocument();

    view.rerender(<Prompt id="first-feed-post" wants />);

    expect(screen.getByTestId('first-feed-post')).toBeInTheDocument();
  });
});
