import { browser } from 'wxt/browser';
import { INSPECT_PLAYER, isPlayerSnapshot } from '../../lib/protocol';
import './style.css';

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing element: ${id}`);
  return found as T;
}

const status = element('status');
const refresh = element<HTMLButtonElement>('refresh');
const size = element<HTMLInputElement>('font-size');
const settingsStatus = element('settings-status');
const SETTINGS_KEY = 'dul-subtitle:font-size';
const diagnostics = document.createElement('pre');
diagnostics.className = 'hint';
diagnostics.style.whiteSpace = 'pre-wrap';
diagnostics.style.overflowWrap = 'anywhere';
diagnostics.setAttribute('aria-live', 'polite');
refresh.after(diagnostics);
let inspectionCount = 0;

async function inspectPlayer() {
  refresh.disabled = true;
  status.textContent = '正在检测当前页面…';
  inspectionCount += 1;
  const attempt = `第 ${inspectionCount} 次检测 · ${new Date().toLocaleTimeString()}`;
  diagnostics.textContent = attempt;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    if (location.protocol !== 'chrome-extension:') {
      status.textContent = '当前打开的是普通网页预览，无法连接 Netflix。请加载扩展后，在 Netflix 标签页点击浏览器工具栏里的 Dul Subtitle 图标。';
      return;
    }
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id == null) {
      status.textContent = '没有找到当前标签页。';
      return;
    }
    if (tab.url?.startsWith(browser.runtime.getURL('/'))) {
      status.textContent = '当前标签页是扩展自身。请切换到 Netflix 播放页，再从浏览器工具栏打开扩展。';
      return;
    }
    const snapshot: unknown = await Promise.race([
      browser.tabs.sendMessage(tab.id, { type: INSPECT_PLAYER }, { frameId: 0 }),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('播放器检测超时（5 秒），页面脚本没有响应。')), 5000);
      }),
    ]);
    if (!isPlayerSnapshot(snapshot)) throw new Error('页面返回了空或不兼容的检测结果，请重新加载扩展并刷新 Netflix。');
    diagnostics.textContent = `${attempt}\n页面脚本：已连接\n视频元素：${snapshot.hasVideo ? '已找到' : '未找到'}\n标准字幕轨道：${snapshot.textTrackCount}（不代表 Netflix 完整语言列表）`;
    status.textContent = !snapshot.isWatchPage
      ? '已连接 Netflix，请进入一部影片的播放页面。'
      : !snapshot.hasVideo
        ? '已进入播放页，等待播放器加载后请重新检测。'
        : '已检测到 Netflix 视频。双语字幕功能仍在开发中。';
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    status.textContent = '检测失败。请在 Netflix 播放页打开扩展；若刚安装或更新，请先刷新 Netflix，并检查扩展是否获准访问此网站。';
    diagnostics.textContent = `${attempt}\n错误详情：${detail}`;
    console.error('[Dul Subtitle] 播放器检测失败', error);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
    refresh.disabled = false;
  }
}

function updatePreview(fontSize: number) {
  size.value = String(fontSize);
  element('font-size-value').textContent = `${fontSize} px`;
  element('upper-preview').style.fontSize = `${fontSize}px`;
  element('lower-preview').style.fontSize = `${fontSize}px`;
}

async function loadSettings() {
  try {
    const result = await browser.storage.local.get(SETTINGS_KEY);
    const saved: unknown = result[SETTINGS_KEY];
    updatePreview(typeof saved === 'number' && Number.isInteger(saved)
      && saved >= 16 && saved <= 36 ? saved : 24);
    settingsStatus.textContent = '此设置目前仅应用于上方预览。';
  } catch {
    settingsStatus.textContent = '设置读取失败，暂时使用默认字号。';
  } finally {
    size.disabled = false;
  }
}

size.addEventListener('input', () => updatePreview(Number(size.value)));
// Serialize writes so quick changes cannot leave an older preference saved last.
let saveQueue = Promise.resolve();
size.addEventListener('change', () => {
  const value = Number(size.value);
  saveQueue = saveQueue.then(async () => {
    try {
      await browser.storage.local.set({ [SETTINGS_KEY]: value });
      settingsStatus.textContent = '字号已保存到本机，目前仅用于预览。';
    } catch {
      settingsStatus.textContent = '保存失败，请再次调整字号重试。';
    }
  });
});
refresh.addEventListener('click', () => { void inspectPlayer(); });
void loadSettings();
void inspectPlayer();
