import { defineContentScript } from 'wxt/utils/define-content-script';
import { inspectNetflixTracks } from '../lib/netflix-tracks';

export default defineContentScript({
  matches: ['https://www.netflix.com/*'],
  world: 'MAIN',
  main() {
    window.addEventListener('message', (event: MessageEvent) => {
      if (event.source !== window || event.origin !== location.origin) return;
      const message = event.data;
      if (!message || message.type !== 'dul:tracks-request:v1'
        || typeof message.id !== 'string' || message.id.length > 80) return;
      const report = inspectNetflixTracks((window as unknown as Record<string, unknown>).netflix);
      window.postMessage({ type: 'dul:tracks-response:v1', id: message.id, report }, location.origin);
    });
  },
});
