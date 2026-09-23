import { browser } from 'wxt/browser';
import { DEBUG_LOG } from '../lib/debug-log';
import { createDebugRecorder } from '../lib/debug-recorder';
import type { SyncStatus } from '../lib/subtitle-sync';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { INSPECT_PLAYER, INSPECT_RESOURCES, START_DUAL, STOP_DUAL, DUAL_STATUS, type PlayerSnapshot } from '../lib/protocol';
import { isSubtitlePayload, type DualState } from '../lib/dual';
import { mountOverlay } from '../lib/overlay';
import { connectPlaybackClock } from '../lib/clock-bridge';
import { STYLE_KEY, LEGACY_SIZE_KEY, normalizeStyle } from '../lib/subtitle-style';
import { isResourceReport, type ResourceReport } from '../lib/subtitle-resources';
import { isTrackReport, type TrackReport } from '../lib/netflix-tracks';
import { PREFERENCES_KEY, readPreferences, preferenceFor, matchPreferences, type Preferences } from '../lib/subtitle-preferences';

export default defineContentScript({
  matches: ['https://www.netflix.com/*'],
  main(ctx) {
    let style = normalizeStyle(undefined);
    let styleChanged = false;
    const onStyleChange = (changes: Record<string, { newValue?: unknown }>, area: string) => {
      if (area !== 'local' || !(STYLE_KEY in changes)) return;
      styleChanged = true;
      style = normalizeStyle(changes[STYLE_KEY]?.newValue);
    };
    browser.storage.onChanged.addListener(onStyleChange);
    void browser.storage.local.get([STYLE_KEY, LEGACY_SIZE_KEY]).then(saved => {
      if (!styleChanged) style = normalizeStyle(saved[STYLE_KEY] ?? { fontSize: saved[LEGACY_SIZE_KEY] });
    }).catch(() => {});
    let inspectedPath: string | undefined;
    let dual: DualState = { phase: 'off', detail: '双语字幕未开启。' };
    let syncWaiting = false;
    let syncStatus: SyncStatus = { mode: 'raw', offset: null };
    const debug = createDebugRecorder(() => ({ phase: dual.phase, waiting: dual.phase === 'active' && syncWaiting,
      syncMode: syncStatus.mode, syncOffset: syncStatus.offset, syncDiagnostics: syncStatus.diagnostics, syncProgress: syncStatus.progress }));
    let generation = 0;
    let removeOverlay: (() => void) | undefined;
    let cancelPending: (() => void) | undefined;
    let preferences: Preferences | undefined;
    let preferencesReady = false;
    let preferenceVersion = 0;
    let savedQueue = Promise.resolve();
    let pagePath = location.pathname;
    let restoreUntil = Date.now() + 90000;
    let restoreBusy = false;
    let restoreAttempts = 0;
    let retryAt = 0;
    let disposed = false;
    let activeSelection: [string, string] | undefined;
    const preferencesLoaded = browser.storage.local.get(PREFERENCES_KEY).then(saved => {
      if (!preferences) preferences = readPreferences(saved[PREFERENCES_KEY]);
    }).catch(() => {}).finally(() => { preferencesReady = true; });
    function savePreferences() {
      const value = preferences;
      if (!value) return;
      savedQueue = savedQueue.then(async () => {
        try { await browser.storage.local.set({ [PREFERENCES_KEY]: value }); }
        catch { dual = { ...dual, detail: dual.detail + ' 语言偏好保存失败，请稍后重试。' }; }
      });
    }
    async function restore() {
      if (disposed) return;
      if (pagePath !== location.pathname) {
        pagePath = location.pathname;
        stop(); activeSelection = undefined;
        preferenceVersion++;
        restoreUntil = Date.now() + 90000; restoreAttempts = 0; retryAt = 0;
      }
      if (!preferencesReady || !preferences?.enabled || restoreBusy || dual.phase === 'loading' || dual.phase === 'active'
        || Date.now() < retryAt || restoreAttempts >= 3 || !/^\/watch\/\d+/.test(pagePath)) return;
      if (Date.now() > restoreUntil) {
        if (dual.phase === 'off') dual = { phase: 'error', detail: '自动恢复等待超时，请在播放器就绪后重新开启。' };
        return;
      }
      restoreBusy = true;
      const path = pagePath;
      const version = preferenceVersion;
      try {
        const report = await inspectTracks();
        if (disposed || version !== preferenceVersion || path !== location.pathname || !preferences?.enabled) return;
        if (report.state !== 'ready' || !document.querySelector('video')) {
          dual = { phase: 'off', detail: '正在等待播放器，字幕将自动恢复。' }; return;
        }
        const ids = matchPreferences(report.tracks, preferences);
        if (!ids[0] || !ids[1]) {
          dual = { phase: 'error', detail: '当前影片缺少已保存的语言或字幕变体，或存在多个匹配项，请重新选择。' };
          retryAt = Date.now() + 5000; return;
        }
        inspectedPath = path;
        restoreAttempts++;
        retryAt = Date.now() + 8000;
        start([ids[0], ids[1]], style.fontSize);
      } finally { restoreBusy = false; }
    }
    function stop() {
      syncStatus = { mode: 'raw', offset: null }; syncWaiting = false;
      generation++;
      cancelPending?.(); cancelPending = undefined;
      removeOverlay?.(); removeOverlay = undefined;
      activeSelection = undefined;
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
      activeSelection = [ids[0]!, ids[1]!];
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
        }, clock, (waiting, state) => {
          syncWaiting = waiting;
          syncStatus = state;
          dual = { phase: 'active', detail: waiting
            ? state.mode === 'failed'
              ? '尚未取得可靠正片时间。请移动鼠标显示进度条数秒；也可拖动恢复双语，无需刷新。'
              : state.mode === 'recovering-seek'
                ? '正在验证拖动后的播放器时间…'
                : state.mode === 'waiting-native'
              ? '广告或校准期间暂停双语。广告结束后请显示进度条数秒；原生字幕匹配作为备用。'
              : '广告期间或正片时间未就绪，暂用原生字幕；时间恢复后自动同步。'
            : '双语字幕已开启。' };
        }, () => style);
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
    const listener = (message: unknown, sender: { id?: string }, sendResponse: (response: unknown) => void) => {
      if (sender.id !== browser.runtime.id || !message || typeof message !== 'object'
        || !('type' in message)) return;
      if (message.type === DEBUG_LOG && 'action' in message) {
        if (message.action === 'start') sendResponse(debug.start());
        else if (message.action === 'stop') sendResponse(debug.stop());
        else if (message.action === 'status') sendResponse(debug.status());
        else if (message.action === 'export') sendResponse({ ...debug.export(), extensionVersion: browser.runtime.getManifest().version });
        return;
      }
      if (message.type === STOP_DUAL) {
        const version = ++preferenceVersion;
        stop();
        void preferencesLoaded.then(() => {
          if (version === preferenceVersion && preferences) { preferences = { ...preferences, enabled: false }; savePreferences(); }
          sendResponse(dual);
        });
        return true;
      }
      if (message.type === DUAL_STATUS) { sendResponse(dual); return; }
      if (message.type === START_DUAL) {
        if (!('ids' in message) || !Array.isArray(message.ids) || message.ids.length !== 2
          || !message.ids.every(id => typeof id === 'string' && id.length <= 200)) return;
        const size = 'fontSize' in message && typeof message.fontSize === 'number' ? message.fontSize : 24;
        const ids = message.ids as string[];
        const version = ++preferenceVersion;
        const path = location.pathname;
        void inspectTracks().then(report => {
          if (disposed || version !== preferenceVersion || path !== location.pathname) { sendResponse(dual); return; }
          const tracks = ids.map(id => report.tracks.find(track => track.id === id));
          if (report.state !== 'ready' || tracks.some(track => !track) || tracks[0]!.language === tracks[1]!.language) {
            sendResponse({ phase: 'error', detail: '字幕列表已变化，请重新检测并选择。' }); return;
          }
          preferences = { enabled: true, upper: preferenceFor(tracks[0]!), lower: preferenceFor(tracks[1]!) };
          preferencesReady = true; savePreferences();
          inspectedPath = path; pagePath = path;
          restoreUntil = Date.now() + 90000; restoreAttempts = 1; retryAt = Date.now() + 8000;
          start(ids, Number.isFinite(size) ? Math.max(16, Math.min(36, size)) : 24);
          sendResponse(dual);
        });
        return true;
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
      void inspectTracks().then(subtitles => sendResponse({ ...snapshot, subtitles, dual,
        selection: activeSelection ?? (preferences ? matchPreferences(subtitles.tracks, preferences) : [null, null]),
      }));
      return true; // Keep the response channel open on Chromium.
    };
    browser.runtime.onMessage.addListener(listener);
    const restoreTimer = setInterval(() => { void restore(); }, 1000);
    ctx.onInvalidated(() => { disposed = true; debug.dispose(); clearInterval(restoreTimer); stop(); browser.runtime.onMessage.removeListener(listener); browser.storage.onChanged.removeListener(onStyleChange); });
  },
});
