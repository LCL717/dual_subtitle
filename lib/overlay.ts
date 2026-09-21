import { createTimeline, type Cue } from './timeline.ts';
import { normalizeStyle, TEXT_SHADOW, type SubtitleStyle } from './subtitle-style.ts';

export interface OverlayClock { read(): number | null; invalidate(): void }
export function mountOverlay(video: HTMLVideoElement, tracks: Cue[][], fontSize: number, onStop: (reason: string) => void, clock?: OverlayClock, onSync?: (waiting: boolean) => void, getStyle?: () => SubtitleStyle): () => void {
  const queries = tracks.map(createTimeline);
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
  const events = ['seeked', 'seeking', 'timeupdate', 'pause', 'play', 'ratechange', 'loadedmetadata', 'emptied'];
  function mediaEvent(event: Event) {
    if (['seeked', 'seeking', 'loadedmetadata', 'emptied'].includes(event.type)) clock?.invalidate();
    render();
  }
  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    host.remove(); nativeStyle.remove();
    for (const name of events) video.removeEventListener(name, mediaEvent);
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
          line.style.textShadow = style.shadow ? TEXT_SHADOW : 'none';
        });
      }
      if (location.pathname !== path) {
        fail('影片或播放器已切换，已恢复原生字幕；请重新选择并开启。'); return;
      }
      const time = clock ? clock.read() : video.currentTime;
      if (time === null) {
        onSync?.(true);
        host.hidden = true;
        lines.forEach(line => line.replaceChildren());
        nativeStyle.remove();
        return;
      }
      onSync?.(false);
      const currentVideo = document.querySelector('video');
      if (!currentVideo) { host.hidden = true; nativeStyle.remove(); return; }
      if (currentVideo !== video) {
        if (!clock) { fail('播放器已切换，请重新开启。'); return; }
        for (const name of events) video.removeEventListener(name, mediaEvent);
        video = currentVideo;
        for (const name of events) video.addEventListener(name, mediaEvent);
        clock.invalidate(); host.hidden = true; nativeStyle.remove(); return;
      }
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
