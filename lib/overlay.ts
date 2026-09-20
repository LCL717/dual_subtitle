import { createTimeline, type Cue } from './timeline.ts';

export function mountOverlay(video: HTMLVideoElement, tracks: Cue[][], fontSize: number, onStop: (reason: string) => void): () => void {
  const queries = tracks.map(createTimeline);
  const path = location.pathname;
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;text-align:center;';
  const shadow = host.attachShadow({ mode: 'closed' });
  const css = document.createElement('style');
  css.textContent = `.line{white-space:pre-line;overflow-wrap:anywhere;color:white;font-family:Arial,"Microsoft YaHei",sans-serif;line-height:1.4;text-shadow:0 1px 3px black;margin:3px 0}.line span{background:rgba(0,0,0,.7);box-decoration-break:clone;padding:2px 7px}.line:empty{display:none}.lower{color:#dbe7ff}`;
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
  let timer: ReturnType<typeof setInterval> | undefined;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    host.remove(); nativeStyle.remove();
    for (const name of ['seeked', 'seeking', 'timeupdate', 'pause', 'play', 'ratechange']) video.removeEventListener(name, render);
    document.removeEventListener('fullscreenchange', render);
  };
  const fail = (reason: string) => { stop(); onStop(reason); };
  function render() {
    if (stopped) return;
    try {
      if (location.pathname !== path || !video.isConnected || document.querySelector('video') !== video) {
        fail('影片或播放器已切换，已恢复原生字幕；请重新选择并开启。'); return;
      }
      const parent = document.fullscreenElement ?? document.documentElement;
      if (parent === video) { fail('当前全屏模式无法叠加字幕，已恢复原生字幕。'); return; }
      if (host.parentNode !== parent) parent.append(host);
      const rect = video.getBoundingClientRect();
      host.style.left = `${rect.left + rect.width * .05}px`;
      host.style.width = `${rect.width * .9}px`;
      host.style.bottom = `${Math.max(0, innerHeight - rect.bottom) + Math.max(65, rect.height * .1)}px`;
      host.hidden = rect.width === 0 || rect.height === 0;
      queries.forEach((query, index) => {
        const line = lines[index]!;
        const text = query(video.currentTime).join('\n');
        if (line.textContent === text) return;
        line.replaceChildren();
        if (text) { const span = document.createElement('span'); span.textContent = text; line.append(span); }
      });
    } catch { fail('字幕显示异常，已恢复原生字幕。'); }
  }
  render();
  if (!stopped) {
    document.documentElement.append(nativeStyle);
    timer = setInterval(render, 100);
    for (const name of ['seeked', 'seeking', 'timeupdate', 'pause', 'play', 'ratechange']) video.addEventListener(name, render);
    document.addEventListener('fullscreenchange', render);
  }
  return stop;
}
