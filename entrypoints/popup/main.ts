import { browser } from 'wxt/browser';
import { INSPECT_PLAYER, INSPECT_RESOURCES, isPlayerSnapshot } from '../../lib/protocol';
import { isResourceReport } from '../../lib/subtitle-resources';
import './style.css';
import type { SubtitleTrack, TrackReport } from '../../lib/netflix-tracks';

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
const upperLanguage = element<HTMLSelectElement>('upper-language');
const lowerLanguage = element<HTMLSelectElement>('lower-language');
let availableTracks: SubtitleTrack[] = [];
let inspectedTabId: number | undefined;
let resourceGeneration = 0;
const resourceButton = element<HTMLButtonElement>('inspect-resources');
const resourceResult = element('resource-result');

function showTracks(report?: TrackReport) {
  resourceGeneration++;
  resourceButton.disabled = true;
  resourceResult.textContent = '';
  availableTracks = report?.state === 'ready' ? report.tracks : [];
  for (const select of [upperLanguage, lowerLanguage]) {
    select.replaceChildren(new Option(availableTracks.length ? '请选择语言' : '尚未读到字幕列表', ''));
    for (const track of availableTracks) select.add(new Option(track.label, track.id));
    select.disabled = availableTracks.length === 0;
  }
  element('pending').textContent = availableTracks.length
    ? '可选择上下字幕语言进行核对；当前选择仅用于本次预览，不更改 Netflix 字幕，双语显示尚未实现。'
    : '字幕列表尚不可用，请查看播放器状态。';
}

function checkSelection() {
  resourceGeneration++;
  resourceResult.textContent = '';
  const upper = availableTracks.find(track => track.id === upperLanguage.value);
  const lower = availableTracks.find(track => track.id === lowerLanguage.value);
  resourceButton.disabled = !(upper && lower && upper.language !== lower.language);
  element('pending').textContent = upper && lower
    ? upper.language === lower.language
      ? '请选择两种不同语言；同语言的普通字幕和 SDH 不算两种语言。'
      : `已选上方：${upper.label}；下方：${lower.label}。本次预览有效，双语显示尚未实现。`
    : '请分别选择上方和下方语言。选择不会更改 Netflix 当前字幕。';
}
upperLanguage.addEventListener('change', checkSelection);
lowerLanguage.addEventListener('change', checkSelection);
resourceButton.addEventListener('click', async () => {
  if (inspectedTabId === undefined) return;
  const generation = ++resourceGeneration;
  resourceButton.disabled = true;
  resourceResult.textContent = '正在检查两条轨道的资源结构…';
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const report: unknown = await Promise.race([
      browser.tabs.sendMessage(inspectedTabId, { type: INSPECT_RESOURCES,
        ids: [upperLanguage.value, lowerLanguage.value] }, { frameId: 0 }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('资源检查超时')), 5000); }),
    ]);
    if (generation !== resourceGeneration) return;
    if (!isResourceReport(report)) throw new Error('返回结果不兼容，请重新加载扩展并刷新 Netflix。');
    resourceResult.textContent = [report.detail, ...report.tracks.map(track =>
      `${track.label}\n资源字段：${track.hasDownloadMetadata ? '有' : '未发现'}；内嵌时间轴：${track.hasInlineCues ? '有' : '未发现'}\n格式：${track.profiles.join(', ') || '未知'}\n轨道结构：${track.fields.join(', ')}\n资源结构：${track.resourceFields.join(', ') || '无'}`)].join('\n\n');
  } catch (error) {
    if (generation === resourceGeneration) resourceResult.textContent = `资源检查失败：${error instanceof Error ? error.message : String(error)}`;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (generation === resourceGeneration) resourceButton.disabled = false;
  }
});

async function inspectPlayer() {
  refresh.disabled = true;
  inspectedTabId = undefined;
  showTracks();
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
    const report = snapshot.subtitles;
    inspectedTabId = tab.id;
    if (snapshot.isWatchPage && snapshot.hasVideo) showTracks(report);
    const current = report.tracks.find(track => track.id === report.currentTrackId);
    diagnostics.textContent = `${attempt}\n页面脚本：已连接\n视频元素：${snapshot.hasVideo ? '已找到' : '未找到'}\n字幕读取：${report.state}\n当前字幕：${current?.label ?? '未识别（不表示关闭）'}\n${report.detail}`;
    status.textContent = !snapshot.isWatchPage
      ? '已连接 Netflix，请进入一部影片的播放页面。'
      : !snapshot.hasVideo
        ? '已进入播放页，等待播放器加载后请重新检测。'
        : report.state === 'ready'
          ? `已读到 ${report.tracks.length} 条字幕轨道。请核对语言列表。`
          : '已找到播放器，Netflix 字幕列表尚未读取成功。';
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
