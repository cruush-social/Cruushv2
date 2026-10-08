import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetExclusivePopupsForTest, useExclusivePopup, type ExclusivePopupId } from './popupQueue';

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
        <Prompt id="dl-mode-default" wants />
        <Prompt id="mobile-install" wants />
        <Prompt id="pulse-gesture" wants />
      </>,
    );

    expect(screen.getByTestId('dl-mode-default')).toBeInTheDocument();
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

  it('shows install before push and hands the slot to push', () => {
    const view = render(
      <>
        <Prompt id="mobile-install" wants />
        <Prompt id="push-permission" wants />
      </>,
    );

    expect(screen.getByTestId('mobile-install')).toBeInTheDocument();
    expect(screen.queryByTestId('push-permission')).not.toBeInTheDocument();

    view.rerender(
      <>
        <Prompt id="mobile-install" wants={false} />
        <Prompt id="push-permission" wants />
      </>,
    );

    expect(screen.queryByTestId('mobile-install')).not.toBeInTheDocument();
    expect(screen.getByTestId('push-permission')).toBeInTheDocument();
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
