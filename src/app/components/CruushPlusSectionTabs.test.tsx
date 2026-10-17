import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router';
import CruushPlusSectionTabs from './CruushPlusSectionTabs';

function SectionPage({ active }: { active: 'checkout' | 'rewards' }) {
  const navigate = useNavigate();

  return (
    <>
      <CruushPlusSectionTabs active={active} />
      <button type="button" onClick={() => navigate(-1)}>Back</button>
    </>
  );
}

describe('CruushPlusSectionTabs', () => {
  it.each([
    { active: 'checkout' as const },
    { active: 'rewards' as const },
  ])('keeps the shared track geometry for $active', ({ active }) => {
    render(
      <MemoryRouter>
        <CruushPlusSectionTabs active={active} />
      </MemoryRouter>,
    );

    const tabs = screen.getByRole('tablist').parentElement;
    expect(tabs).toHaveClass('w-full');
    expect(tabs).not.toHaveClass('max-sm:w-[calc(100%-0.5rem)]');
    expect(tabs).not.toHaveClass('-mt-2');
    expect(tabs).toHaveClass(active === 'rewards' ? '-top-2' : 'w-full');
    expect(screen.getByRole('tab', { name: 'cruush+' })).toHaveClass('!h-[26px]');
    expect(screen.getByRole('tab', { name: 'Rewards' })).toHaveClass('!h-[26px]');
  });

  it.each([
    { start: '/rewards', counterpart: 'cruush+' },
    { start: '/store', counterpart: 'Rewards' },
  ])('walks back through visited sections to the outside page from $start', ({ start, counterpart }) => {
    render(
      <MemoryRouter initialEntries={['/settings', start]} initialIndex={1}>
        <Routes>
          <Route path="/settings" element={<p>Outside cruush+ section</p>} />
          <Route path="/rewards" element={<SectionPage active="rewards" />} />
          <Route path="/store" element={<SectionPage active="checkout" />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.mouseDown(screen.getByRole('tab', { name: counterpart }), { button: 0, ctrlKey: false });
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(screen.getByRole('tab', { name: start === '/store' ? 'cruush+' : 'Rewards' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('Outside cruush+ section')).toBeInTheDocument();
  });
});
