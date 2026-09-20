import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { INSPECT_PLAYER, type PlayerSnapshot } from '../lib/protocol';
import { isTrackReport, type TrackReport } from '../lib/netflix-tracks';

export default defineContentScript({
  matches: ['https://www.netflix.com/*'],
  main(ctx) {
    function inspectTracks(): Promise<TrackReport> {
      return new Promise(resolve => {
        const id = crypto.randomUUID();
        const path = location.pathname;
        const finish = (report: TrackReport) => {
          clearTimeout(timer);
          window.removeEventListener('message', receive);
          resolve(report);
        };
        const receive = (event: MessageEvent) => {
          if (event.source !== window || event.origin !== location.origin) return;
          const data = event.data;
          if (data?.type !== 'dul:tracks-response:v1' || data.id !== id || !isTrackReport(data.report)) return;
          finish(path === location.pathname ? data.report : {
            state: 'unavailable', tracks: [], currentTrackId: null, detail: '影片已切换，请重新检测。',
          });
        };
        const timer = setTimeout(() => finish({ state: 'unavailable', tracks: [], currentTrackId: null,
          detail: '字幕桥接未响应，请在扩展管理页重新加载后刷新 Netflix。' }), 2500);
        window.addEventListener('message', receive);
        window.postMessage({ type: 'dul:tracks-request:v1', id }, location.origin);
      });
    }
    // Inspect on demand, so SPA navigation and video replacement need no polling.
    // TextTrack count is diagnostic only, not Netflix's complete language menu.
    const listener = (message: unknown, sender: { id?: string }, sendResponse: (response: PlayerSnapshot) => void) => {
      if (sender.id !== browser.runtime.id || !message || typeof message !== 'object'
        || !('type' in message) || message.type !== INSPECT_PLAYER) return;
      const video = document.querySelector('video');
      const snapshot = {
        isWatchPage: /^\/watch\/\d+/.test(location.pathname),
        hasVideo: video !== null,
        textTrackCount: video?.textTracks.length ?? 0,
        integration: 'pending' as const,
      };
      void inspectTracks().then(subtitles => sendResponse({ ...snapshot, subtitles }));
      return true; // Keep the response channel open on Chromium.
    };
    browser.runtime.onMessage.addListener(listener);
    ctx.onInvalidated(() => browser.runtime.onMessage.removeListener(listener));
  },
});
