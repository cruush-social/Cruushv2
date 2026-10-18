import { useCallback, useEffect, useRef, useState, type SetStateAction } from 'react';
import { requestApi } from './apiClient';

const CHANGE_EVENT = 'cruush:account-preferences-changed';
let owner: string | null = null;
let values: Record<string, unknown> = {};
let loaded = false;
let loading: Promise<void> | null = null;
let generation = 0;
let writes: Promise<void> = Promise.resolve();
const pending = new Map<string, unknown>();
const touched = new Set<string>();
const controllers = new Set<AbortController>();

function currentOwner(): string | null {
  try { return JSON.parse(localStorage.getItem('cruush_user') ?? 'null')?.id ?? null; }
  catch { return null; }
}

// Only the account already signed in when this version first opens may import
// older device-only choices. Never attribute them to a later account.
const LEGACY_OWNER_KEY = 'cruush:legacy-preference-owner';
try {
  if (localStorage.getItem(LEGACY_OWNER_KEY) === null) localStorage.setItem(LEGACY_OWNER_KEY, currentOwner() ?? '__unowned__');
} catch { /* Optional legacy migration. */ }
function migrateLegacyPreferences(id: string) {
  try {
    if (localStorage.getItem(LEGACY_OWNER_KEY) !== id) return;
    const keys: Array<[string, string, (raw: string) => unknown]> = [
      ['display.accessibility', 'cruush:accessibility-preferences', raw => { const value = JSON.parse(raw); return { colorBlindMode: false, colorVisionMode: value.colorBlindMode ? 'deuteranopia' : 'off', hapticFeedback: true, highContrast: false, largerText: false, reduceMotion: false, ...value }; }],
      ['display.desktopLayout', 'cruush.desktopPageLayout', value => value],
      ['display.dlMode', 'cruush:dl-mode-enabled', value => value === 'true'],
      ['display.dlException', 'cruush:dl-mode-show-only-exception', value => value],
      ['display.benefitsOpen', 'cruush:rewards:benefits-open', value => value === 'true'],
      ['map.zoom', 'cruush:map-last-zoom', Number],
      ['display.dock.left', 'cruush.desktopDock.left', value => value],
      ['display.dock.right', 'cruush.desktopDock.right', value => value],
      ['display.pulseGeometry', 'cruush.pulse.desktopGeometry', value => value],
    ];
    for (const [name, key, parse] of keys) {
      const raw = localStorage.getItem(key);
      if (raw === null || Object.hasOwn(values, name)) continue;
      try {
        void saveAccountPreference(name, parse(raw)).then(() => {
          if (currentOwner() === id && localStorage.getItem(key) === raw) localStorage.removeItem(key);
        }).catch(() => undefined);
      } catch { /* Ignore malformed legacy data. */ }
    }
    const raw = sessionStorage.getItem('cruush:map-seeking-filters:v1');
    if (raw && !Object.hasOwn(values, 'map.seeking')) {
      const saved = JSON.parse(raw);
      if (saved.ownerId === id) void saveAccountPreference('map.seeking', saved.filters).then(() => sessionStorage.removeItem('cruush:map-seeking-filters:v1')).catch(() => undefined);
    }
  } catch { /* Storage may be unavailable. */ }
}

function notify(name?: string) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: name }));
}
export function resetAccountPreferences(emit = true) {
  for (const controller of controllers) controller.abort();
  controllers.clear();
  owner = currentOwner(); values = {}; loaded = false; loading = null; generation += 1;
  pending.clear(); touched.clear(); writes = Promise.resolve();
  if (emit) notify();
}
function ensureOwner() {
  const id = currentOwner();
  if (id !== owner) { resetAccountPreferences(false); owner = id; }
  return id;
}
export function getPreferenceAccountId() { return ensureOwner(); }
export function hasSavedAccountPreference(name: string) { ensureOwner(); return Object.hasOwn(values, name); }
export function areAccountPreferencesLoaded() { ensureOwner(); return loaded; }
export function hasPreferenceAccount() { return Boolean(ensureOwner()); }

/** Saved data is a preference, never an authorization or entitlement. */
function compatible(value: unknown, fallback: unknown): boolean {
  if (Array.isArray(fallback)) return Array.isArray(value) && value.length <= 100
    && value.every(item => typeof item === (typeof fallback[0] === 'number' ? 'number' : 'string'));
  if (fallback !== null && typeof fallback === 'object') return value !== null && typeof value === 'object'
    && !Array.isArray(value) && Object.entries(fallback).every(([key, entry]) => compatible((value as Record<string, unknown>)[key], entry));
  return typeof value === typeof fallback && (typeof value !== 'number' || Number.isFinite(value));
}
export function readAccountPreference<T>(name: string, fallback: T): T {
  ensureOwner();
  return compatible(values[name], fallback) ? values[name] as T : fallback;
}
async function preferenceRequest<T>(url: string, options: RequestInit = {}): Promise<T> {
  const controller = new AbortController(); controllers.add(controller);
  const timeout = window.setTimeout(() => controller.abort(), 5000);
  try { return await requestApi<T>(url, { ...options, signal: controller.signal }); }
  finally { window.clearTimeout(timeout); controllers.delete(controller); }
}
export async function loadAccountPreferences(): Promise<void> {
  const id = ensureOwner();
  if (!id || loaded) return;
  if (loading) return loading;
  const revision = generation;
  const operation = preferenceRequest<Record<string, unknown>>('/api/users/me/preferences').then(saved => {
    if (generation !== revision || currentOwner() !== id) return;
    values = { ...saved, ...Object.fromEntries([...touched].map(name => [name, values[name]])) };
    loaded = true; migrateLegacyPreferences(id); notify();
  }).finally(() => { if (generation === revision) loading = null; });
  loading = operation;
  return operation;
}
export function saveAccountPreference<T>(name: string, value: T): Promise<void> {
  const id = ensureOwner();
  if (!id) return Promise.resolve();
  const snapshot = JSON.parse(JSON.stringify(value));
  values = { ...values, [name]: snapshot }; pending.set(name, snapshot); touched.add(name); notify(name);
  const revision = generation;
  const operation = writes.catch(() => undefined).then(async () => {
    if (generation !== revision || currentOwner() !== id || pending.get(name) !== snapshot) return;
    await preferenceRequest('/api/users/me/preferences/' + encodeURIComponent(name), {
      method: 'PUT', body: JSON.stringify({ value: snapshot }),
    });
    if (generation === revision && pending.get(name) === snapshot) pending.delete(name);
  });
  writes = operation;
  return operation;
}
export async function flushAccountPreferences() {
  const id = ensureOwner();
  const revision = generation;
  await writes.catch(() => undefined);
  for (const name of [...pending.keys()]) {
    if (generation !== revision || currentOwner() !== id) return;
    if (pending.has(name)) await saveAccountPreference(name, pending.get(name));
  }
}
export function subscribeAccountPreferences(listener: () => void, name?: string) {
  const handle = (event: Event) => { if (!name || !(event as CustomEvent).detail || (event as CustomEvent).detail === name) listener(); };
  window.addEventListener(CHANGE_EVENT, handle);
  return () => window.removeEventListener(CHANGE_EVENT, handle);
}

/** Only explicit setters save; rendering/defaults and server hydration never write. */
export function useAccountPreference<T>(name: string, fallback: T) {
  const boundOwner = currentOwner();
  const [value, setValue] = useState<T>(() => readAccountPreference(name, fallback));
  const valueRef = useRef(value);
  valueRef.current = value;
  useEffect(() => {
    const sync = () => setValue(readAccountPreference(name, fallback));
    const unsubscribe = subscribeAccountPreferences(sync, name);
    void loadAccountPreferences().catch(() => undefined);
    sync();
    return unsubscribe;
  // The fallback defines the initial shape, not a changing input.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);
  const update = useCallback((next: SetStateAction<T>) => {
    if (currentOwner() !== boundOwner) return;
    const result = typeof next === 'function' ? (next as (previous: T) => T)(valueRef.current) : next;
    valueRef.current = result;
    setValue(result);
    void saveAccountPreference(name, result).catch(() => {
      // Retain pending choices for online retry and the logout flush.
    });
  }, [name, fallback, boundOwner]);
  return [value, update] as const;
}
/** Unsaved controls belong to their originating account too. */
export function usePreferenceDraftOwner(resetDraft: () => void) {
  const draftOwner = useRef(currentOwner());
  const resetRef = useRef(resetDraft);
  resetRef.current = resetDraft;
  useEffect(() => subscribeAccountPreferences(() => {
    const id = currentOwner();
    if (draftOwner.current !== id) {
      draftOwner.current = id;
      resetRef.current();
    }
  }), []);
}
if (typeof window !== 'undefined') {
  window.addEventListener('storage', event => {
    if (event.key === 'cruush_user' || event.key === null) { resetAccountPreferences(); void loadAccountPreferences().catch(() => undefined); }
  });
  window.addEventListener('online', () => { void flushAccountPreferences().catch(() => undefined); });
}
