import { defineContentScript } from 'wxt/utils/define-content-script';
import { inspectNetflixTracks } from '../lib/netflix-tracks';
import { inspectPlayerResources } from '../lib/subtitle-resources';

export default defineContentScript({
  matches: ['https://www.netflix.com/*'],
  world: 'MAIN',
  main() {
    let resourceBusy = false;
    window.addEventListener('message', (event: MessageEvent) => {
      if (event.source !== window || event.origin !== location.origin) return;
      const message = event.data;
      if (!message || !['dul:tracks-request:v1', 'dul:resources-request:v1'].includes(message.type)
        || typeof message.id !== 'string' || message.id.length > 80) return;
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
      const report = inspectNetflixTracks((window as unknown as Record<string, unknown>).netflix);
      window.postMessage({ type: 'dul:tracks-response:v1', id: message.id, report }, location.origin);
    });
  },
});
