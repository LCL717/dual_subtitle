import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { INSPECT_PLAYER, type PlayerSnapshot } from '../lib/protocol';

export default defineContentScript({
  matches: ['https://www.netflix.com/*'],
  main(ctx) {
    // Inspect on demand, so SPA navigation and video replacement need no polling.
    // TextTrack count is diagnostic only, not Netflix's complete language menu.
    const listener = (message: unknown, sender: { id?: string }, sendResponse: (response: PlayerSnapshot) => void) => {
      if (sender.id !== browser.runtime.id || !message || typeof message !== 'object'
        || !('type' in message) || message.type !== INSPECT_PLAYER) return;
      const video = document.querySelector('video');
      const snapshot: PlayerSnapshot = {
        isWatchPage: /^\/watch\/\d+/.test(location.pathname),
        hasVideo: video !== null,
        textTrackCount: video?.textTracks.length ?? 0,
        integration: 'pending',
      };
      // A synchronous response also works in Chromium versions without
      // Promise-returning runtime.onMessage listener support.
      sendResponse(snapshot);
    };
    browser.runtime.onMessage.addListener(listener);
    ctx.onInvalidated(() => browser.runtime.onMessage.removeListener(listener));
  },
});
