import { createTimeline, type Cue } from './timeline.ts';
import { normalizeStyle, TEXT_SHADOW, type SubtitleStyle } from './subtitle-style.ts';
import { fontStack } from './fonts.ts';
import { createSubtitleSync, nativeSubtitleSnapshot, type SyncStatus } from './subtitle-sync.ts';
import { hasVisibleAd } from './playback-clock.ts';
import { createProgressClock, readProgress } from './progress-clock.ts';

export interface OverlayClock { read(): number | null; invalidate(): void; adEpoch?(): number }
export function mountOverlay(video: HTMLVideoElement, tracks: Cue[][], fontSize: number, onStop: (reason: string) => void, clock?: OverlayClock, onSync?: (waiting: boolean, sync: SyncStatus) => void, getStyle?: () => SubtitleStyle): () => void {
  const queries = tracks.map(createTimeline);
  const sync = createSubtitleSync(tracks);
  const progress = createProgressClock();
  let progressWasActive = false;
  let interacting = false;
  let controlBlockedUntil = 0;
  let adEpoch = 0;
  const path = location.pathname;
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;text-align:center;';
  const shadow = host.attachShadow({ mode: 'closed' });
  const css = document.createElement('style');
  css.textContent = `.line{white-space:pre-line;overflow-wrap:anywhere;color:white;font-family:Arial,"Microsoft YaHei",sans-serif;line-height:1.4;margin:3px 0}.line span{background:var(--subtitle-background,transparent);box-decoration-break:clone;padding:2px 7px}.line:empty{display:none}.lower{color:#dbe7ff}`;
  shadow.append(css);
  const lines = ['line', 'line lower'].map(className => {
    const line = document.createElement('div');
    line.className = className;
    line.style.fontSize = `${fontSize}px`;
    shadow.append(line);
    return line;
  });
  // Removing our style fully restores whatever native subtitles Netflix chose.
  const nativeStyle = document.createElement('style');
  nativeStyle.textContent = '.player-timedtext { visibility: hidden !important; }';
  let stopped = false;
  let lastStyle = '';
  let timer: ReturnType<typeof setInterval> | undefined;
  const events = ['seeked', 'seeking', 'timeupdate', 'pause', 'play', 'ratechange', 'loadedmetadata', 'durationchange', 'emptied'];
  function controlEvent(event: Event) {
    const target = event.target as Element | null;
    const scrubber = target && typeof target.closest === 'function' && target.closest('.scrubber-container, .scrubber-bar');
    if (event.type === 'pointerup' || event.type === 'pointercancel') {
      if (interacting) { interacting = false; controlBlockedUntil = performance.now() + 1000; }
      return;
    }
    if (!scrubber) return;
    if (event.type === 'pointerdown') interacting = true;
    progress.reset('control-interaction'); progressWasActive = false; controlBlockedUntil = performance.now() + 1000;
  }
  const controlEvents = ['pointerdown', 'pointerup', 'pointercancel', 'keydown'];
  for (const name of controlEvents) document.addEventListener(name, controlEvent, true);
  function mediaEvent(event: Event) {
    if (['seeking', 'seeked', 'loadedmetadata', 'durationchange', 'emptied', 'ratechange'].includes(event.type)) { progress.reset('media-event'); progressWasActive = false; }
    if (event.type === 'seeking') {
      sync.beginSeek(!!clock && clock.read() !== null && (clock.adEpoch?.() ?? 0) === adEpoch && !hasVisibleAd(document), video.currentTime);
      clock?.invalidate();
    } else if (event.type === 'seeked') { sync.endSeek(); clock?.invalidate(); }
    else if (['loadedmetadata', 'durationchange', 'emptied'].includes(event.type)) { clock?.invalidate(); sync.invalidate(); }
    render();
  }
  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    host.remove(); nativeStyle.remove();
    for (const name of events) video.removeEventListener(name, mediaEvent);
    for (const name of controlEvents) document.removeEventListener(name, controlEvent, true);
    document.removeEventListener('fullscreenchange', render);
  };
  const fail = (reason: string) => { stop(); onStop(reason); };
  function render() {
    if (stopped) return;
    try {
      const style = normalizeStyle(getStyle?.() ?? { fontSize });
      const key = JSON.stringify(style);
      if (key !== lastStyle) {
        lastStyle = key;
        host.style.setProperty('--subtitle-background', `rgba(0,0,0,${style.backgroundOpacity / 100})`);
        lines.forEach(line => {
          line.style.fontSize = `${style.fontSize}px`;
          line.style.fontFamily = fontStack(style.fontFamily);
          line.style.textShadow = style.shadow ? TEXT_SHADOW : 'none';
        });
      }
      if (location.pathname !== path) {
        fail('影片或播放器已切换，已恢复原生字幕；请重新选择并开启。'); return;
      }
      const currentVideo = document.querySelector('video');
      if (!currentVideo) { host.hidden = true; nativeStyle.remove(); return; }
      if (currentVideo !== video) {
        if (!clock) { fail('播放器已切换，请重新开启。'); return; }
        for (const name of events) video.removeEventListener(name, mediaEvent);
        video = currentVideo;
        for (const name of events) video.addEventListener(name, mediaEvent);
        clock.invalidate(); sync.invalidate(); progress.reset('video-replaced'); progressWasActive = false; host.hidden = true; nativeStyle.remove(); return;
      }
      const epoch = clock?.adEpoch?.() ?? 0;
      if (epoch !== adEpoch) { adEpoch = epoch; sync.resync(); progress.reset('advertisement'); progressWasActive = false; }
      const raw = clock ? clock.read() : video.currentTime;
      const now = performance.now();
      const playing = !video.paused && !video.seeking && video.readyState >= 2;
      const blocked = interacting || now < controlBlockedUntil || video.seeking;
      if (blocked) progress.reset('seek-preview');
      const progressTime = adEpoch > 0 && !blocked
        ? progress.read(readProgress(document, video), raw, now, playing, video.playbackRate, video.duration) : null;
      if (progressWasActive && progressTime === null && sync.status().mode !== 'recovering-seek') sync.resync();
      progressWasActive = progressTime !== null;
      const mode = sync.status().mode;
      const native = mode === 'raw' || mode === 'failed' ? { text: '', count: 0 } : nativeSubtitleSnapshot(document);
      const nativeTime = sync.read(raw, native.text, now, playing, video.playbackRate, native.count, video.currentTime);
      const time = blocked && adEpoch > 0 ? null : progressTime ?? nativeTime;
      const status: SyncStatus = progressTime !== null ? { mode: 'aligned-progress', offset: progress.status().offset, progress: progress.status() }
        : { ...sync.status(), progress: progress.status() };
      if (time === null) {
        onSync?.(true, status);
        host.hidden = true;
        lines.forEach(line => line.replaceChildren());
        nativeStyle.remove();
        return;
      }
      onSync?.(false, status);
      const parent = document.fullscreenElement ?? document.documentElement;
      if (parent === video) { fail('当前全屏模式无法叠加字幕，已恢复原生字幕。'); return; }
      if (host.parentNode !== parent) parent.append(host);
      const rect = video.getBoundingClientRect();
      host.style.left = `${rect.left + rect.width * .05}px`;
      host.style.width = `${rect.width * .9}px`;
      host.style.bottom = `${Math.max(0, innerHeight - rect.bottom) + Math.max(65, rect.height * .1)}px`;
      host.hidden = rect.width === 0 || rect.height === 0;
      if (host.hidden) nativeStyle.remove();
      else if (!nativeStyle.isConnected) document.documentElement.append(nativeStyle);
      queries.forEach((query, index) => {
        const line = lines[index]!;
        const text = query(time).join('\n');
        if (line.textContent === text) return;
        line.replaceChildren();
        if (text) { const span = document.createElement('span'); span.textContent = text; line.append(span); }
      });
    } catch { fail('字幕显示异常，已恢复原生字幕。'); }
  }
  render();
  if (!stopped) {
    timer = setInterval(render, 100);
    for (const name of events) video.addEventListener(name, mediaEvent);
    document.addEventListener('fullscreenchange', render);
  }
  return stop;
}
