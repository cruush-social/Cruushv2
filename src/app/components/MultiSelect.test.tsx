import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import MultiSelect from './MultiSelect';

function mockTriggerRect(button: HTMLElement, rect: Partial<DOMRect>) {
  vi.spyOn(button, 'getBoundingClientRect').mockReturnValue({
    bottom: rect.bottom ?? 0,
    height: rect.height ?? 40,
    left: rect.left ?? 0,
    right: rect.right ?? (rect.left ?? 0) + (rect.width ?? 240),
    top: rect.top ?? 0,
    width: rect.width ?? 240,
    x: rect.x ?? rect.left ?? 0,
    y: rect.y ?? rect.top ?? 0,
    toJSON: () => ({}),
  } as DOMRect);
}

describe('MultiSelect', () => {
  it('keeps the latest multi-select choices when a max selection count is set', () => {
    const onChange = vi.fn();

    render(
      <MultiSelect
        ariaLabel="Gender Identity"
        maxSelections={3}
        onChange={onChange}
        options={['nonbinary', 'trans man', 'trans woman', 'woman']}
        value={[]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Gender Identity' }));
    fireEvent.click(screen.getByRole('option', { name: 'nonbinary' }));
    fireEvent.click(screen.getByRole('option', { name: 'trans man' }));
    fireEvent.click(screen.getByRole('option', { name: 'trans woman' }));
    fireEvent.click(screen.getByRole('option', { name: 'woman' }));

    expect(onChange).toHaveBeenLastCalledWith(['trans man', 'trans woman', 'woman']);
    expect(onChange).toHaveBeenCalledTimes(4);
  });

  it('lets grouped menus switch categories before choosing options', () => {
    const onChange = vi.fn();

    render(
      <MultiSelect
        ariaLabel="Vibes"
        optionGroups={[
          { label: 'Style & Energy', options: ['Chill', 'Goth'] },
          { label: 'Scenes', options: ['Bear', 'Drag'] },
        ]}
        value={[]}
        onChange={onChange}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Vibes' }));

    expect(screen.getByRole('tablist', { name: 'Vibes categories' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Style & Energy' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('option', { name: 'Chill' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Bear' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Scenes' }));

    expect(screen.getByRole('tab', { name: 'Scenes' })).toHaveAttribute('aria-selected', 'true');
    const scenesGroup = screen.getByRole('group', { name: 'Scenes' });
    expect(within(scenesGroup).getByRole('option', { name: 'Bear' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Chill' })).not.toBeInTheDocument();

    fireEvent.click(within(scenesGroup).getByRole('option', { name: 'Drag' }));

    expect(onChange).toHaveBeenCalledWith(['Drag']);
  });

  it('opens local menus upward when the trigger is near the bottom of the viewport', async () => {
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 500,
    });

    render(
      <MultiSelect
        ariaLabel="Presentation"
        options={['androgynous', 'boi', 'butch']}
        value={[]}
      />
    );

    const trigger = screen.getByRole('button', { name: 'Presentation' });
    mockTriggerRect(trigger, {
      bottom: 470,
      left: 20,
      top: 430,
      width: 280,
    });

    fireEvent.click(trigger);

    const menuSurface = screen.getByRole('listbox', { name: 'Presentation' }).parentElement;

    await waitFor(() => {
      expect(menuSurface).toHaveClass('bottom-full', 'mb-2');
    });
    expect(menuSurface).not.toHaveClass('top-full');
  });

  it('opens portal menus upward and keeps them inside the viewport when near the bottom', async () => {
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 500,
    });
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 360,
    });

    render(
      <MultiSelect
        ariaLabel="Gender Identity"
        menuPortal
        options={['nonbinary', 'trans man', 'trans woman']}
        value={[]}
      />
    );

    const trigger = screen.getByRole('button', { name: 'Gender Identity' });
    mockTriggerRect(trigger, {
      bottom: 470,
      left: 20,
      top: 430,
      width: 280,
    });

    fireEvent.click(trigger);

    const menuSurface = screen.getByRole('listbox', { name: 'Gender Identity' }).parentElement;

    await waitFor(() => {
      expect(menuSurface).toHaveStyle({
        bottom: '78px',
        left: '16px',
        maxHeight: '288px',
        position: 'fixed',
        width: '328px',
        zIndex: '121',
      });
    });
    expect(menuSurface?.style.top).toBe('');
  });

  it('does not render a full-screen blocker over portaled menus', async () => {
    const onOutsideTap = vi.fn();

    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 720,
    });
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 360,
    });

    render(
      <>
        <button type="button" onClick={onOutsideTap}>Basics</button>
        <MultiSelect
          ariaLabel="Vibes"
          menuPortal
          optionGroups={[
            { label: 'Style & Energy', options: ['Chill', 'Goth'] },
            { label: 'Scenes', options: ['Bear', 'Drag'] },
          ]}
          value={[]}
        />
      </>
    );

    const trigger = screen.getByRole('button', { name: 'Vibes' });
    mockTriggerRect(trigger, {
      bottom: 200,
      left: 20,
      top: 160,
      width: 280,
    });

    fireEvent.click(trigger);

    expect(await screen.findByRole('tablist', { name: 'Vibes categories' })).toBeInTheDocument();
    expect(document.body.querySelector('.fixed.inset-0')).not.toBeInTheDocument();

    const outsideButton = screen.getByRole('button', { name: 'Basics' });
    fireEvent.pointerDown(outsideButton);
    fireEvent.click(outsideButton);

    expect(onOutsideTap).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.queryByRole('tablist', { name: 'Vibes categories' })).not.toBeInTheDocument();
    });
  });
});
