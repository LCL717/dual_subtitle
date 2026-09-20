import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { INSPECT_PLAYER, INSPECT_RESOURCES, type PlayerSnapshot } from '../lib/protocol';
import { isResourceReport, type ResourceReport } from '../lib/subtitle-resources';
import { isTrackReport, type TrackReport } from '../lib/netflix-tracks';

export default defineContentScript({
  matches: ['https://www.netflix.com/*'],
  main(ctx) {
    let inspectedPath: string | undefined;
    function inspectResourceBridge(ids: string[]): Promise<ResourceReport> {
      return new Promise(resolve => {
        const path = location.pathname;
        if (path !== inspectedPath) {
          resolve({ state: 'unavailable', tracks: [], detail: '页面已切换，请重新检测并选择语言。' });
          return;
        }
        const id = crypto.randomUUID();
        const finish = (report: ResourceReport) => {
          clearTimeout(timer);
          window.removeEventListener('message', receive);
          resolve(report);
        };
        const receive = (event: MessageEvent) => {
          if (event.source !== window || event.origin !== location.origin) return;
          const data = event.data;
          if (data?.type !== 'dul:resources-response:v1' || data.id !== id || !isResourceReport(data.report)) return;
          finish(path === location.pathname ? data.report : { state: 'unavailable', tracks: [], detail: '影片已切换，请重新检测。' });
        };
        const timer = setTimeout(() => finish({ state: 'unavailable', tracks: [], detail: '资源检查超时，请刷新 Netflix 后重试。' }), 2500);
        window.addEventListener('message', receive);
        window.postMessage({ type: 'dul:resources-request:v1', id, ids, path }, location.origin);
      });
    }
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
    const listener = (message: unknown, sender: { id?: string }, sendResponse: (response: PlayerSnapshot | ResourceReport) => void) => {
      if (sender.id !== browser.runtime.id || !message || typeof message !== 'object'
        || !('type' in message)) return;
      if (message.type === INSPECT_RESOURCES) {
        if (!('ids' in message) || !Array.isArray(message.ids) || message.ids.length !== 2
          || !message.ids.every(id => typeof id === 'string' && id.length <= 200)) return;
        void inspectResourceBridge(message.ids).then(sendResponse);
        return true;
      }
      if (message.type !== INSPECT_PLAYER) return;
      inspectedPath = location.pathname;
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
