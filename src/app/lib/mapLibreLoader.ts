let pending: Promise<typeof import('maplibre-gl')> | null = null;

export function loadMapLibre() {
  pending ??= import('maplibre-gl').catch(error => {
    pending = null;
    throw error;
  });
  return pending;
}
