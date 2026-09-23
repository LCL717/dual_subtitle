const adToken = /(^|[-_])(ad|ads|advert|advertisement|advertising)([-_]|$)|adBreak|adState|isAd|AdBreak|AdState|Advertisement/;
const safe = (name: unknown): name is string => typeof name === 'string' && /^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/.test(name) && adToken.test(name);
export interface PlayerHint { name: string; kind: string; value: boolean | number | null }
export interface AdDiagnostics {
  candidates: { attribute: string; token: string; visible: boolean }[];
  playerHints: PlayerHint[];
  limited: boolean;
}
// Candidate names are clues only, never used to gate playback.
export function readAdCandidates(doc: Document) {
  const candidates: AdDiagnostics['candidates'] = [];
  const walker = doc.createTreeWalker(doc.body ?? doc.documentElement, 1);
  let scanned = 0;
  let limited = false;
  while (walker.nextNode()) {
    if (++scanned > 2500 || candidates.length >= 24) { limited = true; break; }
    const el = walker.currentNode as HTMLElement;
    for (const attribute of ['data-uia', 'class']) {
      for (const token of (el.getAttribute(attribute) ?? '').slice(0, 500).split(/\s+/).slice(0, 20)) {
        if (!safe(token) || candidates.length >= 24) continue;
        const style = doc.defaultView?.getComputedStyle(el);
        const visible = el.getClientRects().length > 0 && !el.hidden && el.getAttribute('aria-hidden') !== 'true'
          && style?.display !== 'none' && style?.visibility !== 'hidden' && style?.opacity !== '0';
        if (!candidates.some(x => x.attribute === attribute && x.token === token && x.visible === visible)) candidates.push({ attribute, token, visible });
      }
    }
  }
  return { candidates, limited };
}
export function readPlayerHints(player: object): PlayerHint[] {
  const result: PlayerHint[] = [];
  const seen = new Set<string>();
  try {
    let current: object | null = player;
    for (let depth = 0; current && depth < 3; depth++, current = Object.getPrototypeOf(current)) {
      for (const name of Object.getOwnPropertyNames(current).slice(0, 300)) {
        if (result.length >= 24) return result;
        if (seen.has(name) || !safe(name)) continue;
        seen.add(name);
        const d = Object.getOwnPropertyDescriptor(current, name);
        if (d) result.push({ name, kind: d.get || d.set ? 'accessor' : typeof d.value === 'function' ? 'method' : 'value',
          value: typeof d.value === 'boolean' || (typeof d.value === 'number' && Number.isFinite(d.value)) ? d.value : null });
      }
    }
  } catch { /* Private objects may reject reflection. */ }
  return result;
}
export function sanitizeAdDiagnostics(value: unknown): AdDiagnostics {
  const data = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const candidates: AdDiagnostics['candidates'] = [];
  const playerHints: PlayerHint[] = [];
  for (const x of Array.isArray(data.candidates) ? data.candidates.slice(0, 24) : []) {
    if (x && ['class', 'data-uia'].includes(x.attribute) && safe(x.token) && typeof x.visible === 'boolean')
      candidates.push({ attribute: x.attribute, token: x.token, visible: x.visible });
  }
  for (const x of Array.isArray(data.playerHints) ? data.playerHints.slice(0, 24) : []) {
    if (x && safe(x.name) && ['method', 'accessor', 'value'].includes(x.kind)) playerHints.push({ name: x.name, kind: x.kind,
      value: typeof x.value === 'boolean' || (typeof x.value === 'number' && Number.isFinite(x.value)) ? x.value : null });
  }
  return { candidates, playerHints, limited: data.limited === true };
}
