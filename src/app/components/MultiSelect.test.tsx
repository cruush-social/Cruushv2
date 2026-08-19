import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import MultiSelect from './MultiSelect';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from './ui/sheet';

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

  it('keeps selected badges after the trigger so choosing an option never displaces the open menu', () => {
    const { container } = render(
      <MultiSelect ariaLabel="Gender Identity" options={['agender', 'androgynous', 'bakla']} value={['agender']} />
    );

    const trigger = screen.getByRole('button', { name: 'Gender Identity' });
    const badge = within(container).getByText('agender');

    // The badge row must follow the trigger in document order. Rendered before
    // it, the first selection adds a row above the trigger and shifts the open
    // menu out from under the pointer mid-tap.
    expect(trigger.compareDocumentPosition(badge) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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

  it('supports mobile category dropdown selection for grouped options', () => {
    const onChange = vi.fn();

    render(
      <MultiSelect
        ariaLabel="Kinks & Fetishes"
        optionGroups={[
          { label: 'Body & Touch', options: ['anal', 'massage'] },
          { label: 'Power', options: ['bondage', 'impact'] },
        ]}
        value={[]}
        onChange={onChange}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Kinks & Fetishes' }));

    const categorySelect = screen.getByRole('combobox', { name: 'Kinks & Fetishes category' });
    expect(categorySelect).toBeInTheDocument();
    expect(categorySelect).toHaveValue('Body & Touch');
    expect(screen.getByRole('option', { name: 'anal' })).toBeInTheDocument();

    fireEvent.change(categorySelect, { target: { value: 'Power' } });
    expect(screen.getByRole('option', { name: 'bondage' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('option', { name: 'bondage' }));
    expect(onChange).toHaveBeenCalledWith(['bondage']);
  });

  it('enables native vertical touch scrolling inside option lists', () => {
    render(
      <MultiSelect
        ariaLabel="Gender Identity"
        options={['agender', 'androgynous', 'bakla']}
        value={[]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Gender Identity' }));

    const listbox = screen.getByRole('listbox', { name: 'Gender Identity' });
    expect(listbox.style.touchAction).toBe('pan-y');
    expect(listbox.style.getPropertyValue('-webkit-overflow-scrolling')).toBe('touch');
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

  it('prefers the larger space above a mobile portalled menu so sheet actions remain tappable', async () => {
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 844,
    });
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 390,
    });

    render(
      <MultiSelect
        ariaLabel="Gender Identities"
        menuPortal
        options={['cis man', 'man', 'woman']}
        value={[]}
      />,
    );

    const trigger = screen.getByRole('button', { name: 'Gender Identities' });
    mockTriggerRect(trigger, {
      bottom: 571,
      left: 21,
      top: 531,
      width: 349,
    });

    fireEvent.click(trigger);

    const menuSurface = screen.getByRole('listbox', { name: 'Gender Identities' }).parentElement;
    await waitFor(() => {
      expect(menuSurface).toHaveStyle({
        bottom: '321px',
        left: '16px',
        maxHeight: '288px',
        position: 'fixed',
        width: '358px',
      });
    });
    expect(menuSurface?.style.top).toBe('');
  });

  it('portals options into the owning modal Sheet so touch scrolling stays inside its lock', async () => {
    const onChange = vi.fn();
    render(
      <Sheet open>
        <SheetContent>
          <SheetTitle>Seeking</SheetTitle>
          <SheetDescription>Filter nearby profiles.</SheetDescription>
          <MultiSelect
            ariaLabel="Gender Identities"
            menuPortal
            onChange={onChange}
            options={['nonbinary', 'woman']}
            value={[]}
          />
        </SheetContent>
      </Sheet>,
    );

    const trigger = screen.getByRole('button', { name: 'Gender Identities' });
    mockTriggerRect(trigger, {
      bottom: 200,
      left: 20,
      top: 160,
      width: 280,
    });

    fireEvent.click(trigger);

    const listbox = screen.getByRole('listbox', { name: 'Gender Identities' });
    const menuSurface = listbox.parentElement!;
    const sheetContent = screen.getByRole('dialog', { name: 'Seeking' });
    await waitFor(() => {
      expect(sheetContent).toContainElement(menuSurface);
      expect(menuSurface).toHaveStyle({ pointerEvents: 'auto' });
    });
    expect(listbox.style.touchAction).toBe('pan-y');

    const option = screen.getByRole('option', { name: 'nonbinary' });
    fireEvent.pointerDown(option, { isPrimary: true, pointerType: 'touch' });
    fireEvent.pointerUp(option, { isPrimary: true, pointerType: 'touch' });
    fireEvent.click(option);
    expect(onChange).toHaveBeenCalledWith(['nonbinary']);
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
