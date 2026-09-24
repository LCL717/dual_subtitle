import { browser } from 'wxt/browser';
import { DEBUG_LOG } from '../../lib/debug-log';
import { t } from '../../lib/ui-language';

export function initializeDebugPanel() {
  const status = document.getElementById('debug-status')!;
  const buttons = ['debug-start', 'debug-stop', 'debug-download'].map(id => document.getElementById(id) as HTMLButtonElement);
  let busy = false;
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  async function request(action: string) {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id === undefined) throw Error('No active tab');
    return browser.tabs.sendMessage(tab.id, { type: DEBUG_LOG, action }, { frameId: 0 });
  }
  function show(value: any) {
    if (!value || typeof value.active !== 'boolean' || !Number.isInteger(value.count)) throw Error('Invalid debug response');
    status.textContent = `${t(value.active ? '正在记录' : '已停止记录')} · ${Math.round(value.durationMs / 1000)} s · ${value.count} ${t('条记录')} · ${t('已覆盖旧记录')} ${value.dropped}`;
    buttons[0]!.disabled = value.active;
    buttons[1]!.disabled = !value.active;
    buttons[2]!.disabled = value.count === 0;
  }
  async function refresh() {
    if (disposed) return;
    if (!busy) {
      try { const value = await request('status'); if (!disposed && !busy) show(value); }
      catch { if (!disposed && !busy) status.textContent = t('诊断记录尚未连接，请刷新 Netflix 播放页后重试。'); }
    }
    if (!disposed) timer = setTimeout(() => { void refresh(); }, 1500);
  }
  for (const [index, action] of ['start', 'stop', 'export'].entries()) {
    buttons[index]!.addEventListener('click', async () => {
      if (busy) return;
      busy = true; buttons.forEach(button => { button.disabled = true; });
      try {
        const value = await request(action);
        if (disposed) return;
        show(value);
        if (action === 'export') {
          if (!Array.isArray(value.entries) || value.entries.length > 7200) throw Error('Invalid export');
          const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
          const link = document.createElement('a');
          link.href = url; link.download = `dual-subtitle-debug-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
          document.body.append(link); link.click(); link.remove();
          setTimeout(() => URL.revokeObjectURL(url), 10000);
        }
      } catch {
        status.textContent = t('诊断操作失败，请确认当前是 Netflix 播放页并刷新后重试。');
        buttons.forEach(button => { button.disabled = false; });
      } finally { busy = false; }
    });
  }
  window.addEventListener('pagehide', () => { disposed = true; clearTimeout(timer); });
  void refresh();
}
