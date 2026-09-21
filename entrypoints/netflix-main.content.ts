import { defineContentScript } from 'wxt/utils/define-content-script';
import { inspectNetflixTracks } from '../lib/netflix-tracks';
import { inspectPlayerResources } from '../lib/subtitle-resources';
import { loadSubtitles } from '../lib/load-subtitles';
import { readPlaybackSample, hasVisibleAd } from '../lib/playback-clock';

export default defineContentScript({
  matches: ['https://www.netflix.com/*'],
  world: 'MAIN',
  main() {
    let resourceBusy = false;
    let loadController: AbortController | undefined;
    window.addEventListener('message', (event: MessageEvent) => {
      if (event.source !== window || event.origin !== location.origin) return;
      const message = event.data;
      if (!message || !['dul:tracks-request:v1', 'dul:resources-request:v1', 'dul:load-request:v1', 'dul:cancel-load:v1', 'dul:clock-request:v1'].includes(message.type)
        || typeof message.id !== 'string' || message.id.length > 80) return;
      if (message.type === 'dul:clock-request:v1') {
        if (message.path !== location.pathname) return;
        const sample = readPlaybackSample((window as unknown as Record<string, unknown>).netflix,
          location.pathname, hasVisibleAd(document));
        window.postMessage({ type: 'dul:clock-response:v1', id: message.id, path: location.pathname, sample }, location.origin);
        return;
      }
      if (message.type === 'dul:cancel-load:v1') { loadController?.abort(); return; }
      if (message.type === 'dul:load-request:v1') {
        if (message.path !== location.pathname || !Array.isArray(message.ids) || message.ids.length !== 2
          || !message.ids.every((id: unknown) => typeof id === 'string' && id.length <= 200)) return;
        loadController?.abort();
        const controller = new AbortController();
        loadController = controller;
        const path = location.pathname;
        const timer = setTimeout(() => controller.abort(), 15000);
        void loadSubtitles((window as unknown as Record<string, unknown>).netflix, message.ids, controller.signal,
          () => location.pathname === path && !controller.signal.aborted).then(payload => {
          window.postMessage({ type: 'dul:load-response:v1', id: message.id, payload }, location.origin);
        }).catch(error => {
          window.postMessage({ type: 'dul:load-response:v1', id: message.id,
            error: error instanceof Error ? error.message.slice(0, 300) : '字幕加载失败。' }, location.origin);
        }).finally(() => { clearTimeout(timer); if (loadController === controller) loadController = undefined; });
        return;
      }
      if (message.type === 'dul:resources-request:v1') {
        if (message.path !== location.pathname || !Array.isArray(message.ids) || message.ids.length !== 2
          || !message.ids.every((id: unknown) => typeof id === 'string' && id.length <= 200)) return;
        if (resourceBusy) return;
        resourceBusy = true;
        const path = location.pathname;
        void inspectPlayerResources((window as unknown as Record<string, unknown>).netflix, message.ids,
          () => location.pathname === path).then(report => {
          window.postMessage({ type: 'dul:resources-response:v1', id: message.id, report }, location.origin);
        }).catch(() => {
          window.postMessage({ type: 'dul:resources-response:v1', id: message.id,
            report: { state: 'unavailable', tracks: [], detail: '播放器资源检查失败，没有更改原生字幕。' } }, location.origin);
        }).finally(() => { resourceBusy = false; });
        return;
      }
      const report = inspectNetflixTracks((window as unknown as Record<string, unknown>).netflix, /^\/watch\/(\d+)/.exec(location.pathname)?.[1]);
      window.postMessage({ type: 'dul:tracks-response:v1', id: message.id, report }, location.origin);
    });
  },
});
