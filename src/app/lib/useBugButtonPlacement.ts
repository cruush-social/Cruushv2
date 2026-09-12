import { useLayoutEffect, useState } from 'react';

/** Keep the existing header slot while aligning Bug to the active surface's corner. */
export function useBugButtonPlacement(slot: HTMLElement | null) {
  const [transform, setTransform] = useState<string>();
  useLayoutEffect(() => {
    if (!slot) {
      setTransform(undefined);
      return;
    }
    const surface = slot.closest<HTMLElement>(
      '[data-dock-slot], [role="dialog"], [role="alertdialog"], [data-testid="map-ping-sheet"]'
    );
    const update = () => {
      const rect = slot.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const bounds = surface?.getBoundingClientRect();
      const scaleX = rect.width / (slot.offsetWidth || rect.width);
      const scaleY = rect.height / (slot.offsetHeight || rect.height);
      const x = (bounds?.right ?? window.innerWidth) - rect.right;
      const y = (bounds?.top ?? 0) - rect.top;
      setTransform(`translate(calc((${x}px - 0.75rem - env(safe-area-inset-right)) / ${scaleX}), calc((${y}px + 0.75rem + env(safe-area-inset-top)) / ${scaleY}))`);
    };
    update();
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    resize?.observe(slot);
    // A title or late-loaded header action can move the slot without resizing it.
    for (let ancestor = slot.parentElement; ancestor; ancestor = ancestor.parentElement) {
      resize?.observe(ancestor);
      if (ancestor === surface) break;
    }
    const movement = typeof MutationObserver === 'undefined' ? null : new MutationObserver(update);
    if (surface) movement?.observe(surface, { attributes: true, attributeFilter: ['style', 'class'] });
    surface?.addEventListener('animationend', update);
    surface?.addEventListener('animationcancel', update);
    surface?.addEventListener('transitionend', update);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      resize?.disconnect();
      movement?.disconnect();
      surface?.removeEventListener('animationend', update);
      surface?.removeEventListener('animationcancel', update);
      surface?.removeEventListener('transitionend', update);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [slot]);
  return transform;
}
