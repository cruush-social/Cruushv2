/** Display labels only; persisted Vibe values still use the canonical catalog. */
export function formatVibeLabel(value: string): string {
  switch (value.trim().toLowerCase()) {
    case 'queer arts':
      return 'Arts';
    case 'queer nightlife':
      return 'Nightlife';
    default:
      return value;
  }
}
