import { createPlaybackClock, isPlaybackSample } from './playback-clock.ts';

export function connectPlaybackClock() {
  const clock = createPlaybackClock();
  const path = location.pathname;
  let pending: { id: string; at: number } | undefined;
  let disposed = false;
  function request() {
    if (disposed || location.pathname !== path) return;
    const now = performance.now();
    if (pending && now - pending.at < 700) return;
    pending = { id: crypto.randomUUID(), at: now };
    window.postMessage({ type: 'dual:clock-request:v1', id: pending.id, path }, location.origin);
  }
  function receive(event: MessageEvent) {
    if (disposed || location.pathname !== path || event.source !== window || event.origin !== location.origin) return;
    const data = event.data;
    if (data?.type !== 'dual:clock-response:v1' || data.id !== pending?.id || data.path !== path || !isPlaybackSample(data.sample)) return;
    clock.update(data.sample, performance.now());
    pending = undefined;
  }
  window.addEventListener('message', receive);
  const timer = setInterval(request, 100);
  request();
  return {
    read: () => clock.read(performance.now()),
    adEpoch: clock.adEpoch,
    invalidate() { clock.invalidate(); pending = undefined; request(); },
    stop() { disposed = true; clearInterval(timer); window.removeEventListener('message', receive); clock.invalidate(); },
  };
}
