import { fireEvent, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { Link, MemoryRouter, Route, useNavigate } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DesktopPopupRoutes from './DesktopPopupRoutes';
import { usePopupRoute } from '../lib/popupRouteContext';
import { saveDesktopPageLayout } from '../lib/desktopPageLayoutPreferences';

const mounts = vi.fn();
function Map() {
  useEffect(() => { mounts(); }, []);
  return <div>Map background<Link to="/clubs/one">Coven</Link><Link to="/profile/edit">Edit profile</Link></div>;
}
function Page({ title }: { title: string }) {
  const popup = usePopupRoute();
  const navigate = useNavigate();
  return <div>{title}<Link to="/chat/one">Open chat</Link><Link to="/chat/one/settings">Settings</Link><button onClick={() => navigate(-1)}>Back</button>{popup && <button onClick={popup.onClose}>Close</button>}<button onClick={() => saveDesktopPageLayout('fullscreen')}>Fullscreen</button></div>;
}
function Harness({ initial = '/map' }: { initial?: string }) {
  return <MemoryRouter initialEntries={[initial]}><DesktopPopupRoutes mapElement={<Map />}>
    <Route path="/map" element={<Map />} />
    <Route path="/clubs/:id" element={<Page title="Coven page" />} />
    <Route path="/chat/:id" element={<Page title="Chat page" />} />
    <Route path="/chat/:id/settings" element={<Page title="Chat settings" />} />
    <Route path="/profile/edit" element={<Page title="Profile editor" />} />
  </DesktopPopupRoutes></MemoryRouter>;
}

beforeEach(() => { localStorage.clear(); mounts.mockClear(); Object.defineProperty(window, 'innerWidth', { value: 1440, configurable: true }); Object.defineProperty(window, 'innerHeight', { value: 900, configurable: true }); });
describe('desktop popup routes', () => {
  it('retains the map through Coven, chat, settings, Back and Close', () => {
    render(<Harness />);
    fireEvent.click(screen.getByText('Coven'));
    expect(screen.getByTestId('desktop-dock-right')).toContainElement(screen.getByText('Coven page'));
    fireEvent.click(screen.getByText('Open chat'));
    fireEvent.click(screen.getByText('Settings'));
    expect(screen.getByTestId('desktop-dock-right')).toContainElement(screen.getByText('Chat settings'));
    fireEvent.click(screen.getByText('Back'));
    expect(screen.getByText('Chat page')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Close'));
    expect(screen.queryByTestId('desktop-dock-right')).not.toBeInTheDocument();
    expect(mounts).toHaveBeenCalledTimes(1);
  });
  it('places profile routes in the existing left slot', () => {
    render(<Harness />); fireEvent.click(screen.getByText('Edit profile'));
    expect(screen.getByTestId('desktop-dock-left')).toContainElement(screen.getByText('Profile editor'));
  });
  it('supports direct chat links and switching to fullscreen', () => {
    render(<Harness initial="/chat/one" />);
    expect(screen.getByTestId('desktop-dock-right')).toContainElement(screen.getByText('Chat page'));
    fireEvent.click(screen.getByText('Fullscreen'));
    expect(screen.queryByTestId('desktop-dock-right')).not.toBeInTheDocument();
    expect(screen.getByText('Chat page')).toBeInTheDocument();
    expect(screen.queryByText('Map background')).not.toBeInTheDocument();
  });
  it('keeps phone routes fullscreen', () => {
    Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true });
    render(<Harness initial="/chat/one" />);
    expect(screen.queryByTestId('desktop-dock-right')).not.toBeInTheDocument();
    expect(screen.getByText('Chat page')).toBeInTheDocument();
    expect(screen.queryByText('Map background')).not.toBeInTheDocument();
  });
});
