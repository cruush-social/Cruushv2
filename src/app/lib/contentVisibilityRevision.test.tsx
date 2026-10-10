import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { requestApi } from './apiClient';
import { refreshContentVisibility, subscribeContentVisibility, useContentVisibilityRefresh } from './contentVisibilityRevision';
vi.mock('./apiClient', () => ({ requestApi: vi.fn() }));
let stops: Array<() => void> = [];
beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(requestApi).mockReset().mockResolvedValue({ revision: 'initial' });
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
});
afterEach(() => { stops.forEach(stop => stop()); stops = []; vi.useRealTimers(); });
it('shares one poll, refreshes the first baseline and changes only, and stops without subscribers', async () => {
  const first = vi.fn(), second = vi.fn();
  stops.push(subscribeContentVisibility(first), subscribeContentVisibility(second));
  await vi.advanceTimersByTimeAsync(0);
  expect(requestApi).toHaveBeenCalledTimes(1);
  expect(first).toHaveBeenCalledTimes(1);
  expect(second).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(5000);
  expect(first).toHaveBeenCalledTimes(1);
  vi.mocked(requestApi).mockResolvedValue({ revision: 'banned' });
  await vi.advanceTimersByTimeAsync(5000);
  expect(first).toHaveBeenCalledTimes(2);
  stops.splice(0).forEach(stop => stop());
  const calls = vi.mocked(requestApi).mock.calls.length;
  await vi.advanceTimersByTimeAsync(10000);
  expect(requestApi).toHaveBeenCalledTimes(calls);
});
it('pauses while hidden and checks immediately on visible focus; failed checks do not evict', async () => {
  const listener = vi.fn(); stops.push(subscribeContentVisibility(listener));
  await vi.advanceTimersByTimeAsync(0);
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
  await vi.advanceTimersByTimeAsync(10000);
  expect(requestApi).toHaveBeenCalledTimes(1);
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  vi.mocked(requestApi).mockRejectedValue(new Error('offline'));
  window.dispatchEvent(new Event('focus'));
  await vi.advanceTimersByTimeAsync(0);
  expect(listener).toHaveBeenCalledTimes(1);
});
it('replaces mounted stale content without remounting or clearing the draft', async () => {
  let visible = ['Existing member', 'Banned member'];
  function Surface() {
    const [items, setItems] = useState(visible);
    useContentVisibilityRefresh(isCurrent => { if (isCurrent()) setItems([...visible]); });
    return <><textarea defaultValue="Unsent draft" />{items.map(item => <p key={item}>{item}</p>)}</>;
  }
  const view = render(<Surface />);
  await act(() => vi.advanceTimersByTimeAsync(0));
  const draft = screen.getByRole('textbox');
  visible = ['Existing member'];
  act(() => refreshContentVisibility());
  expect(screen.queryByText('Banned member')).toBeNull();
  expect(screen.getByRole('textbox')).toBe(draft);
  expect(draft).toHaveValue('Unsent draft');
  view.unmount();
});

it('ignores an old poll after all subscribers unmount and a new surface mounts', async () => {
  let resolveOld!: (value: { revision: string }) => void;
  vi.mocked(requestApi).mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
  const oldListener = vi.fn();
  const stop = subscribeContentVisibility(oldListener);
  stop();
  const nextListener = vi.fn();
  stops.push(subscribeContentVisibility(nextListener));
  await vi.advanceTimersByTimeAsync(0);
  expect(nextListener).toHaveBeenCalledTimes(1);
  resolveOld({ revision: 'stale' });
  await vi.advanceTimersByTimeAsync(0);
  expect(nextListener).toHaveBeenCalledTimes(1);
  expect(oldListener).not.toHaveBeenCalled();
});

it('retries only failed content subscribers on an unchanged revision and stops after success', async () => {
  const healthy = vi.fn();
  const flaky = vi.fn().mockRejectedValueOnce(new Error('temporary content fetch failure')).mockResolvedValue(undefined);
  stops.push(subscribeContentVisibility(healthy), subscribeContentVisibility(flaky));
  await vi.advanceTimersByTimeAsync(0);
  expect(flaky).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(5000);
  expect(flaky).toHaveBeenCalledTimes(2);
  expect(healthy).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(10000);
  expect(flaky).toHaveBeenCalledTimes(2);
});
