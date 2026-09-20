export interface ResolvedResource {
  trackId: string;
  profile: string;
  urls: string[];
}
export interface Discovery {
  resources: ResolvedResource[];
  visited: number;
  skippedAccessors: number;
  limited: boolean;
}

function ownValue(node: object, key: string): unknown {
  try { return Object.getOwnPropertyDescriptor(node, key)?.value; } catch { return undefined; }
}
function object(value: unknown): value is object {
  return value !== null && (typeof value === 'object' || typeof value === 'function');
}

// Pure inspection: no getters, setters, network hooks, or mutation of the player.
// URLs stay in the page context; only aggregate results cross to the extension.
function readResource(node: object, wanted: Set<string>): ResolvedResource | undefined {
  const trackId = ownValue(node, 'trackId');
  const profile = ownValue(node, 'profile');
  const rawUrls = ownValue(node, 'urls');
  if (typeof trackId !== 'string' || !wanted.has(trackId) || !Array.isArray(rawUrls)) return;
  const urls: string[] = [];
  for (let i = 0; i < Math.min(rawUrls.length, 10); i++) {
    const item = ownValue(rawUrls, String(i));
    const candidate = typeof item === 'string' ? item : object(item) ? ownValue(item, 'url') : undefined;
    if (typeof candidate !== 'string' || candidate.length > 8192) continue;
    try {
      const url = new URL(candidate);
      if (url.protocol === 'https:' && !url.username && !url.password
        && /(^|\.)(nflxvideo\.net|netflix\.com)$/.test(url.hostname)) urls.push(candidate);
    } catch { /* Not a supported resource URL. */ }
  }
  if (!urls.length) return;
  return { trackId, profile: typeof profile === 'string' && /^[\w.-]{1,80}$/.test(profile) ? profile : 'unknown', urls };
}

export async function discoverResources(root: unknown, ids: string[], maxNodes = 6000): Promise<Discovery> {
  const result: Discovery = { resources: [], visited: 0, skippedAccessors: 0, limited: false };
  if (!object(root)) return result;
  const wanted = new Set(ids);
  const seen = new WeakSet<object>();
  const queue: { node: object; depth: number }[] = [{ node: root, depth: 0 }];
  const deadline = performance.now() + 1200;
  const resourceKeys = new Set<string>();
  for (let position = 0; position < queue.length; position++) {
    if (result.visited >= maxNodes || performance.now() > deadline) { result.limited = true; break; }
    const { node, depth } = queue[position]!;
    if (seen.has(node)) continue;
    seen.add(node);
    result.visited++;
    const resource = readResource(node, wanted);
    if (resource) {
      const key = `${resource.trackId}\n${resource.profile}\n${resource.urls.join('\n')}`;
      if (!resourceKeys.has(key)) { result.resources.push(resource); resourceKeys.add(key); }
      if (result.resources.length >= 40) { result.limited = true; break; }
    }
    if (depth >= 14) { result.limited = true; continue; }
    try {
      const names = Object.getOwnPropertyNames(node);
      if (names.length > 120) result.limited = true;
      for (const name of names.slice(0, 120)) {
        if (['prototype', '__proto__', 'constructor', 'caller', 'callee', 'arguments'].includes(name)) continue;
        const descriptor = Object.getOwnPropertyDescriptor(node, name);
        if (!descriptor || !('value' in descriptor)) { result.skippedAccessors++; continue; }
        if (object(descriptor.value) && !seen.has(descriptor.value)) {
          if (queue.length >= maxNodes * 2) { result.limited = true; break; }
          queue.push({ node: descriptor.value, depth: depth + 1 });
        }
      }
    } catch { /* Revoked proxies and inaccessible objects are skipped. */ }
    if (result.visited % 100 === 0) await new Promise(resolve => setTimeout(resolve, 0));
  }
  return result;
}
