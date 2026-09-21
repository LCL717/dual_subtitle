import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { INSPECT_PLAYER, INSPECT_RESOURCES, START_DUAL, STOP_DUAL, DUAL_STATUS, type PlayerSnapshot } from '../lib/protocol';
import { isSubtitlePayload, type DualState } from '../lib/dual';
import { mountOverlay } from '../lib/overlay';
import { connectPlaybackClock } from '../lib/clock-bridge';
import { isResourceReport, type ResourceReport } from '../lib/subtitle-resources';
import { isTrackReport, type TrackReport } from '../lib/netflix-tracks';

export default defineContentScript({
  matches: ['https://www.netflix.com/*'],
  main(ctx) {
    let inspectedPath: string | undefined;
    let dual: DualState = { phase: 'off', detail: '双语字幕未开启。' };
    let generation = 0;
    let removeOverlay: (() => void) | undefined;
    let cancelPending: (() => void) | undefined;
    function stop() {
      generation++;
      cancelPending?.(); cancelPending = undefined;
      removeOverlay?.(); removeOverlay = undefined;
      window.postMessage({ type: 'dul:cancel-load:v1', id: crypto.randomUUID() }, location.origin);
      dual = { phase: 'off', detail: '双语字幕已关闭，原生字幕已恢复。' };
    }
    function start(ids: string[], fontSize: number) {
      stop();
      const version = generation;
      const video = document.querySelector('video');
      const path = location.pathname;
      if (!video || path !== inspectedPath || !/^\/watch\/\d+/.test(path)) {
        dual = { phase: 'error', detail: '请在播放页重新检测后开启。' }; return;
      }
      dual = { phase: 'loading', detail: '正在下载并解析两条字幕…' };
      const id = crypto.randomUUID();
      const clean = () => { clearTimeout(timer); window.removeEventListener('message', receive); cancelPending = undefined; };
      const receive = (event: MessageEvent) => {
        if (event.source !== window || event.origin !== location.origin) return;
        const data = event.data;
        if (data?.type !== 'dul:load-response:v1' || data.id !== id) return;
        clean();
        if (generation !== version) return;
        if (location.pathname !== path || !video.isConnected) { dual = { phase: 'error', detail: '影片已切换，请重新开启。' }; return; }
        if (!isSubtitlePayload(data.payload)) {
          dual = { phase: 'error', detail: typeof data.error === 'string' ? data.error.slice(0, 300) : '字幕数据格式无效。' }; return;
        }
        dual = { phase: 'active', detail: '双语字幕已开启。' };
        const clock = connectPlaybackClock();
        const unmount = mountOverlay(video, data.payload.tracks, fontSize, detail => {
          clock.stop(); dual = { phase: 'error', detail };
        }, clock, waiting => {
          dual = { phase: 'active', detail: waiting ? '广告期间或正片时间未就绪，暂用原生字幕；时间恢复后自动同步。' : '双语字幕已开启。' };
        });
        removeOverlay = () => { unmount(); clock.stop(); };
      };
      const timer = setTimeout(() => {
        clean();
        if (generation === version) { stop(); dual = { phase: 'error', detail: '字幕加载超时，原生字幕未改变。' }; }
      }, 18000);
      cancelPending = clean;
      window.addEventListener('message', receive);
      window.postMessage({ type: 'dul:load-request:v1', id, ids, path }, location.origin);
    }
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
    const listener = (message: unknown, sender: { id?: string }, sendResponse: (response: PlayerSnapshot | ResourceReport | DualState) => void) => {
      if (sender.id !== browser.runtime.id || !message || typeof message !== 'object'
        || !('type' in message)) return;
      if (message.type === STOP_DUAL) { stop(); sendResponse(dual); return; }
      if (message.type === DUAL_STATUS) { sendResponse(dual); return; }
      if (message.type === START_DUAL) {
        if (!('ids' in message) || !Array.isArray(message.ids) || message.ids.length !== 2
          || !message.ids.every(id => typeof id === 'string' && id.length <= 200)) return;
        const size = 'fontSize' in message && typeof message.fontSize === 'number' ? message.fontSize : 24;
        start(message.ids, Number.isFinite(size) ? Math.max(16, Math.min(36, size)) : 24);
        sendResponse(dual); return;
      }
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
      void inspectTracks().then(subtitles => sendResponse({ ...snapshot, subtitles, dual }));
      return true; // Keep the response channel open on Chromium.
    };
    browser.runtime.onMessage.addListener(listener);
    ctx.onInvalidated(() => { stop(); browser.runtime.onMessage.removeListener(listener); });
  },
});
