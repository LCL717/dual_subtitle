// Diagnostic only: candidate units and reliability are deliberately not inferred.
const timing = /^(?:_)?(?:currentTime|time|position|currentPosition|playbackTime|playbackPosition|contentTime|contentPosition|duration|offset|timeOffset|elapsed|elapsedTime|progress|value|minimum|maximum|min|max|adTime|adDuration|getCurrentTime|getPosition|getDuration)$/i;
const branch = /^(?:_)?(?:state|props|memoizedProps|memoizedState|stateNode|return|alternate|next|baseState|current|player|videoPlayer|timeline|playback|data|model|controller|progress|value)$/;
const field = /^(?:_)?[a-zA-Z][a-zA-Z0-9]{0,39}$/;
export interface InternalTiming {
  visited: number;
  limited: boolean;
  roots: number;
  candidates: { root: number; source: 'player' | 'control'; retained: boolean; path: string; kind: 'number' | 'method' | 'accessor'; value: number | null }[];
}
function own(object: object, key: string) {
  try { return Object.getOwnPropertyDescriptor(object, key); } catch { return undefined; }
}
function object(value: unknown): value is object { return value !== null && typeof value === 'object'; }

export function createInternalTimingProbe(now = () => performance.now()) {
  let session = '';
  let last = -Infinity;
  let next = 0;
  let roots: { id: number; source: 'player' | 'control'; ref: WeakRef<object> }[] = [];
  return {
    sample(doc: Document, player: object | undefined, token: string): InternalTiming {
      const start = now();
      if (session !== token || start - last > 5000) { roots = []; next = 0; session = token; }
      last = start;
      roots = roots.filter(root => root.ref.deref());
      const fresh = new Set<object>();
      const add = (value: unknown, source: 'player' | 'control') => {
        if (!object(value)) return;
        fresh.add(value);
        if (roots.some(root => root.ref.deref() === value)) return;
        if (roots.length >= 24) roots.shift();
        roots.push({ id: ++next, source, ref: new WeakRef(value) });
      };
      add(player, 'player');
      const result: InternalTiming = { visited: 0, limited: false, roots: 0, candidates: [] };
      // Only bounded, known framework attachments; never export attachment suffixes.
      for (const node of Array.from(doc.querySelectorAll('[role="slider"][aria-valuenow], .scrubber-container')).slice(0, 4)) {
        let ancestor: Element | null = node;
        for (let level = 0; ancestor && level < 4; level++, ancestor = ancestor.parentElement) {
          if (now() - start > 8) { result.limited = true; break; }
          let keys: string[] = [];
          try { keys = Object.getOwnPropertyNames(ancestor).slice(0, 160); } catch { /* unavailable */ }
          for (const key of keys) {
            if (!/^__react(?:Fiber|Props|InternalInstance)\$/.test(key)) continue;
            const descriptor = own(ancestor, key);
            let value: unknown = descriptor && 'value' in descriptor ? descriptor.value : undefined;
            // Capture parent fibers as weak roots so live ancestors can survive an unmounted control.
            for (let depth = 0; object(value) && depth < 6; depth++) {
              add(value, 'control');
              const parent = own(value, 'return');
              value = parent && 'value' in parent ? parent.value : undefined;
            }
          }
        }
      }
      result.roots = roots.length;
      for (const root of roots) {
        const value = root.ref.deref();
        if (!value) continue;
        const queue = [{ value, path: '', depth: 0 }];
        const seen = new Set<object>();
        for (let i = 0; i < queue.length; i++) {
          if (result.visited >= 400 || result.candidates.length >= 96 || now() - start > 8) { result.limited = true; break; }
          const item = queue[i]!;
          if (seen.has(item.value)) continue;
          seen.add(item.value); result.visited++;
          let names: string[] = [];
          try { names = Object.getOwnPropertyNames(item.value); } catch { continue; }
          if (names.length > 120) result.limited = true;
          for (const name of names.slice(0, 120)) {
            if (!field.test(name)) continue;
            const descriptor = own(item.value, name);
            if (!descriptor) continue;
            const path = item.path ? `${item.path}.${name}` : name;
            const data = 'value' in descriptor;
            if (timing.test(name) && result.candidates.length < 96) {
              const number = data && typeof descriptor.value === 'number' && Number.isFinite(descriptor.value);
              const method = data && typeof descriptor.value === 'function';
              if (number || method || !data) result.candidates.push({ root: root.id, source: root.source,
                retained: !fresh.has(value), path, kind: number ? 'number' : method ? 'method' : 'accessor', value: number ? descriptor.value : null });
            }
            if (data && object(descriptor.value) && branch.test(name) && item.depth < 5 && queue.length < 400)
              queue.push({ value: descriptor.value, path, depth: item.depth + 1 });
          }
        }
        if (result.limited && (result.visited >= 400 || result.candidates.length >= 96 || now() - start > 8)) break;
      }
      return result;
    },
  };
}

export function sanitizeInternalTiming(value: unknown): InternalTiming | undefined {
  if (!value || typeof value !== 'object') return;
  const input = value as InternalTiming;
  const bounded = (n: unknown, max: number) => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= max;
  if (!bounded(input.visited, 400) || !bounded(input.roots, 24) || !Array.isArray(input.candidates)) return;
  const candidates: InternalTiming['candidates'] = [];
  for (const row of input.candidates.slice(0, 96)) {
    if (!row || !bounded(row.root, 1000000) || !['player', 'control'].includes(row.source)
      || typeof row.path !== 'string' || row.path.length > 250) continue;
    const parts = row.path.split('.');
    if (parts.length > 6 || !timing.test(parts.at(-1)!) || !parts.slice(0, -1).every(key => branch.test(key))) continue;
    if (!['number', 'method', 'accessor'].includes(row.kind)) continue;
    if (row.kind === 'number' && (typeof row.value !== 'number' || !Number.isFinite(row.value))) continue;
    candidates.push({ root: row.root, source: row.source, retained: row.retained === true, path: row.path,
      kind: row.kind, value: row.kind === 'number' ? row.value : null });
  }
  return { visited: input.visited, roots: input.roots, limited: input.limited === true, candidates };
}
