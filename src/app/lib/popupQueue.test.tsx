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
        <Prompt id="side-quest" wants />
        <Prompt id="dl-mode-default" wants />
        <Prompt id="mobile-install" wants />
      </>,
    );

    expect(screen.getByTestId('dl-mode-default')).toBeInTheDocument();
    expect(screen.queryByTestId('side-quest')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mobile-install')).not.toBeInTheDocument();
  });

  it('hands the screen to the next prompt once the holder stops wanting it', () => {
    const view = render(
      <>
        <Prompt id="dl-mode-default" wants />
        <Prompt id="side-quest" wants />
      </>,
    );

    expect(screen.getByTestId('dl-mode-default')).toBeInTheDocument();

    view.rerender(
      <>
        <Prompt id="dl-mode-default" wants={false} />
        <Prompt id="side-quest" wants />
      </>,
    );

    expect(screen.queryByTestId('dl-mode-default')).not.toBeInTheDocument();
    expect(screen.getByTestId('side-quest')).toBeInTheDocument();
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
