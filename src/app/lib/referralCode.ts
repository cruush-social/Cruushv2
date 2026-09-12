/**
 * The app only ever hands out an affiliate LINK, never a bare code, so the
 * invite field has to take the link too. A member pastes whatever they were
 * sent; this digs the code out of it.
 */
export function extractReferralCode(input: string) {
  const trimmed = input.trim();
  if (!trimmed) {
    return '';
  }

  // A bare code passes through untouched.
  if (/^[A-Za-z0-9_-]+$/.test(trimmed)) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
    const segments = url.pathname.split('/').filter(Boolean);
    const joinIndex = segments.indexOf('join');
    const candidate = joinIndex >= 0 ? segments[joinIndex + 1] : segments[segments.length - 1];
    return candidate && /^[A-Za-z0-9_-]+$/.test(candidate) ? candidate : trimmed;
  } catch {
    return trimmed;
  }
}
