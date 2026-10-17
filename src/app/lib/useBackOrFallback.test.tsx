import { fireEvent, render, screen } from '@testing-library/react';
import { BrowserRouter, MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router';
import { describe, expect, it } from 'vitest';
import { useBackOrFallback } from './useBackOrFallback';
function Page() {
  const back = useBackOrFallback('/map');
  const location = useLocation();
  const navigate = useNavigate();
  return <><p data-testid="route">{location.pathname}{location.search}</p><button onClick={back}>Back</button><button onClick={() => navigate('/settings')}>Settings</button></>;
}
describe('browser-style back', () => {
  it('uses the current browser index rather than total history length at the first entry', () => {
    window.history.pushState({ idx: 0, key: 'default' }, '', '/support');
    expect(window.history.length).toBeGreaterThan(1);
    const view = render(<BrowserRouter><Page /></BrowserRouter>);
    fireEvent.click(screen.getByText('Back'));
    expect(screen.getByTestId('route')).toHaveTextContent('/map');
    expect(window.history.state.idx).toBe(0);
    view.unmount();
    window.history.replaceState(null, '', '/');
  });
  it('consumes every previous entry without bouncing or inventing settings destinations', () => {
    render(<MemoryRouter initialEntries={['/map?zoom=10','/profile/member','/settings','/store','/settings/orders']} initialIndex={4}><Page /></MemoryRouter>);
    for (const expected of ['/store','/settings','/profile/member','/map?zoom=10']) {
      fireEvent.click(screen.getByText('Back'));expect(screen.getByTestId('route')).toHaveTextContent(expected);
    }
  });
  it('replaces a history-free direct entry so it cannot create a two-page loop', () => {
    render(<MemoryRouter initialEntries={['/store']}><Routes><Route path="*" element={<Page />} /></Routes></MemoryRouter>);
    fireEvent.click(screen.getByText('Back'));expect(screen.getByTestId('route')).toHaveTextContent('/map');
    fireEvent.click(screen.getByText('Settings'));fireEvent.click(screen.getByText('Back'));
    expect(screen.getByTestId('route')).toHaveTextContent('/map');
    fireEvent.click(screen.getByText('Back'));expect(screen.getByTestId('route')).toHaveTextContent('/map');
  });
});
