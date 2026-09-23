// Read-only candidates. A slider may be volume, and its units are not assumed.
export const TIMELINE_CANDIDATES = '[role="slider"], input[type="range"], [role="progressbar"], .scrubber-container, .scrubber-bar, [data-uia="timeline"], [data-uia="video-progress"]';
const numeric = (value: string | null) => value !== null && value.length <= 64 && /^-?\d+(?:\.\d+)?%?$/.test(value.trim()) ? value.trim() : null;
export function readTimelineControls(doc: Document) {
  return Array.from(doc.querySelectorAll<HTMLElement>(TIMELINE_CANDIDATES)).slice(0, 16).map((el, index) => {
    const rect = el.getBoundingClientRect();
    const style = doc.defaultView?.getComputedStyle(el);
    const tokens = (el.getAttribute('aria-valuetext') ?? '').slice(0, 200).match(/\b\d{1,3}:\d{2}(?::\d{2})?\b/g)?.slice(0, 4) ?? [];
    return {
      index, role: el.getAttribute('role') === 'slider' ? 'slider' : el.getAttribute('role') === 'progressbar' ? 'progressbar' : el.tagName === 'INPUT' ? 'range' : 'scrubber-candidate',
      visible: rect.width > 0 && rect.height > 0 && !el.hidden && style?.display !== 'none' && style?.visibility !== 'hidden' && style?.opacity !== '0',
      now: numeric(el.getAttribute('aria-valuenow')), min: numeric(el.getAttribute('aria-valuemin') ?? el.getAttribute('min')),
      max: numeric(el.getAttribute('aria-valuemax') ?? el.getAttribute('max')),
      value: el.tagName === 'INPUT' ? numeric((el as HTMLInputElement).value) : null,
      inlineWidth: numeric(el.style.width), timeTokens: tokens,
      // Preserve only numerical child widths; do not collect labels or page text.
      childWidths: Array.from(el.children).slice(0, 8).map(child => numeric((child as HTMLElement).style?.width ?? null)),
    };
  });
}

export function timelineInteraction(event: Event, doc: Document) {
  const target = event.target as Element | null;
  const control = target && typeof target.closest === 'function' ? target.closest(TIMELINE_CANDIDATES) : null;
  if (!control) return null;
  const index = Array.from(doc.querySelectorAll(TIMELINE_CANDIDATES)).slice(0, 16).indexOf(control);
  if (index < 0) return null;
  const rect = control.getBoundingClientRect();
  const clientX = 'clientX' in event && typeof event.clientX === 'number' ? event.clientX : null;
  const key = 'key' in event && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(String(event.key)) ? String(event.key) : null;
  if (event.type === 'keydown' && key === null) return null;
  return { index, key, fraction: clientX !== null && rect.width > 0 ? Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) : null };
}
