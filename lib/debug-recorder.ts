import { createDebugLog } from './debug-log.ts';
import { sanitizeInternalTiming } from './internal-timing-probe.ts';
import { sanitizeAdDiagnostics } from './ad-diagnostics.ts';
import { AD_SELECTORS } from './playback-clock.ts';
import { readTimelineControls, timelineInteraction } from './timeline-probe.ts';

export function createDebugRecorder(getState: () => { phase: string; waiting: boolean; syncMode?: string; syncOffset?: number | null; syncDiagnostics?: import('./subtitle-sync.ts').SyncStatus['diagnostics']; syncProgress?: import('./subtitle-sync.ts').SyncStatus['progress'] }) {
  const log = createDebugLog();
  const ids = new WeakMap<HTMLVideoElement, number>();
  let nextId = 0;
  let lastUiScan = -Infinity;
  let timingSession = '';
  let previous: { at: number; videoTime: number | null; playerTime: number | null; rate: number } | undefined;
  let pending: { id: string; at: number; path: string } | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  const events = ['play', 'pause', 'seeking', 'seeked', 'waiting', 'playing', 'ratechange', 'loadedmetadata', 'durationchange', 'emptied', 'ended'];
  const controlEvents = ['pointerdown', 'pointerup', 'keydown', 'input', 'change'];
  function snapshot(event: string, video = document.querySelector('video')) {
    if (video && !ids.has(video)) ids.set(video, ++nextId);
    return { event, videoTime: video && Number.isFinite(video.currentTime) ? video.currentTime : null,
      timelineControls: readTimelineControls(document),
      videoDuration: video && Number.isFinite(video.duration) ? video.duration : null,
      videoCount: document.querySelectorAll('video').length, hidden: document.hidden,
      videoId: video ? ids.get(video)! : null, paused: video?.paused ?? null, seeking: video?.seeking ?? null,
      rate: video?.playbackRate ?? null, readyState: video?.readyState ?? null, ...getState() };
  }
  function media(event: Event) {
    if (event.target instanceof HTMLVideoElement) log.add(snapshot(event.type, event.target));
  }
  function controlEvent(event: Event) {
    const interaction = timelineInteraction(event, document);
    if (!interaction) return;
    log.add({ ...snapshot(`control-${event.type}`), interaction });
    // Observe after the page's event handlers too; never intercept playback.
    queueMicrotask(() => { if (log.status().active) log.add({ ...snapshot(`control-${event.type}-after`), interaction }); });
  }
  function receive(event: MessageEvent) {
    if (event.source !== window || event.origin !== location.origin || !pending) return;
    const data = event.data;
    if (data?.type !== 'dul:debug-clock-response:v1' || data.id !== pending.id || data.path !== pending.path) return;
    const now = performance.now();
    const requestMs = Math.round(now - pending.at);
    pending = undefined;
    // Copy only bounded diagnostic fields; never retain arbitrary page objects.
    const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
    const state = snapshot('sample');
    const playerTime = number(data.seconds);
    const videoDelta = previous && state.videoTime !== null && previous.videoTime !== null ? state.videoTime - previous.videoTime : null;
    const playerDelta = previous && playerTime !== null && previous.playerTime !== null ? playerTime - previous.playerTime : null;
    const threshold = previous ? 2 + (now - previous.at) / 1000 * Math.max(previous.rate, state.rate ?? 1) : Infinity;
    log.add({ ...state, playerTime, playerId: number(data.playerId), requestMs, videoDelta, playerDelta,
      timelineJump: [videoDelta, playerDelta].some(delta => delta !== null && (delta < -2 || delta > threshold)),
      ...(data.diagnostics ? { diagnostics: sanitizeAdDiagnostics(data.diagnostics) } : {}),
      ...(data.internalTiming ? { internalTiming: sanitizeInternalTiming(data.internalTiming) } : {}),
      ad: data.ad === true, markers: Array.isArray(data.markers) ? data.markers.filter((x: unknown) =>
        AD_SELECTORS.includes(x as string)).slice(0, AD_SELECTORS.length) : [] });
    previous = { at: now, videoTime: state.videoTime, playerTime, rate: state.rate ?? 1 };
  }
  function sample() {
    const now = performance.now();
    if (pending && now - pending.at < 1000) return;
    if (pending) log.add(snapshot('bridge-timeout'));
    pending = { id: crypto.randomUUID(), at: now, path: location.pathname };
    const inspectAdUi = now - lastUiScan >= 1000;
    if (inspectAdUi) lastUiScan = now;
    window.postMessage({ type: 'dul:clock-request:v1', id: pending.id, path: pending.path, debug: true, inspectAdUi, timingSession }, location.origin);
  }
  function cleanup() {
    clearInterval(timer); timer = undefined; pending = undefined;
    window.removeEventListener('message', receive);
    for (const name of events) document.removeEventListener(name, media, true);
    for (const name of controlEvents) document.removeEventListener(name, controlEvent, true);
  }
  return {
    start() {
      if (log.status().active) return log.status();
      previous = undefined; lastUiScan = -Infinity;
      timingSession = crypto.randomUUID();
      log.start(); log.add(snapshot('recording-start'));
      window.addEventListener('message', receive);
      for (const name of events) document.addEventListener(name, media, true);
      for (const name of controlEvents) document.addEventListener(name, controlEvent, true);
      timer = setInterval(sample, 250); sample();
      return log.status();
    },
    stop() { log.add(snapshot('recording-stop')); log.stop(); cleanup(); return log.status(); },
    status: () => log.status(),
    export: () => log.export(),
    dispose() { log.stop(); cleanup(); },
  };
}
