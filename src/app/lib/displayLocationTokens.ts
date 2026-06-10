import { requestApi } from './apiClient';

export type DisplayAnimationHint = 'NONE' | 'FADE_LAST_MINUTE' | 'SIGNAL_LOSS' | 'REAPPEAR';
export type DisplayMode = 'PRECISE' | 'GHOST';

export type DisplayLocationToken = {
  version: 1;
  tokenId: string;
  keyId: string;
  ciphertext: string;
  nonce: string;
  expiresAtMs: number;
  tokenVersion: 1;
};

export type DisplayLocationPayload = {
  version: 1;
  subjectUserId: string;
  viewerUserId: string;
  displayMode: DisplayMode;
  latE7: number;
  lonE7: number;
  accuracyDisplayM: number;
  rotationEpoch: number | null;
  subjectPolicyVersion: number;
  relationshipGrantVersion: number;
  expiresAtMs: number;
  animationHint: DisplayAnimationHint;
  renderNonce: string;
};

type BrowserDisplayKey = {
  version: 1;
  keyId: string;
  key: string;
  expiresAtMs: number;
};

let cachedDisplayKey: BrowserDisplayKey | null = null;

function base64UrlToBytes(value: string) {
  const padded = `${value}${'='.repeat((4 - (value.length % 4)) % 4)}`;
  const binary = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function utf8Bytes(value: string) {
  return new TextEncoder().encode(value);
}

function displayTokenAad(token: DisplayLocationToken) {
  return `display-location-token:v1:${token.tokenId}:${token.keyId}:${token.expiresAtMs}`;
}

async function getDisplayKey() {
  if (cachedDisplayKey && cachedDisplayKey.expiresAtMs > Date.now() + 5_000) {
    return cachedDisplayKey;
  }

  cachedDisplayKey = await requestApi<BrowserDisplayKey>('/api/location/display-key');
  return cachedDisplayKey;
}

export async function decryptDisplayLocationToken(token: DisplayLocationToken) {
  const displayKey = await getDisplayKey();

  if (displayKey.keyId !== token.keyId) {
    cachedDisplayKey = null;
    throw new Error('Display location key is stale. Refresh the map.');
  }

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    base64UrlToBytes(displayKey.key),
    { name: 'AES-GCM' },
    false,
    ['decrypt'],
  );
  const plaintext = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: base64UrlToBytes(token.nonce),
      additionalData: utf8Bytes(displayTokenAad(token)),
    },
    cryptoKey,
    base64UrlToBytes(token.ciphertext),
  );
  const payload = JSON.parse(new TextDecoder().decode(plaintext)) as DisplayLocationPayload;

  return {
    ...payload,
    latitude: payload.latE7 / 10_000_000,
    longitude: payload.lonE7 / 10_000_000,
  };
}

export function clearDisplayLocationKeyCache() {
  cachedDisplayKey = null;
}
