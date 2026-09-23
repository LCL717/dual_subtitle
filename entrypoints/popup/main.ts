import { browser } from 'wxt/browser';
import { INSPECT_PLAYER, INSPECT_RESOURCES, START_DUAL, STOP_DUAL, DUAL_STATUS, isPlayerSnapshot } from '../../lib/protocol';
import { isDualState } from '../../lib/dual';
import { isResourceReport } from '../../lib/subtitle-resources';
import './style.css';
import type { SubtitleTrack, TrackReport } from '../../lib/netflix-tracks';
import { FONT_LIST_KEY, FALLBACK_FONTS, normalizeFontList, fontStack, fontLabel } from '../../lib/fonts';
import { STYLE_KEY, LEGACY_SIZE_KEY, DEFAULT_STYLE, normalizeStyle, TEXT_SHADOW, type SubtitleStyle } from '../../lib/subtitle-style';
import { initializeLanguage, t } from '../../lib/ui-language';
import { initializeDebugPanel } from './debug-panel';
import { previewText } from '../../lib/preview-text';

async function main() {
  await initializeLanguage(browser.storage.local);
  initializeDebugPanel();


  function element<T extends HTMLElement>(id: string): T {
    const found = document.getElementById(id);
    if (!found) throw new Error(`Missing element: ${id}`);
    return found as T;
  }

  const status = element('status');
  const refresh = element<HTMLButtonElement>('refresh');
  const size = element<HTMLInputElement>('font-size');
  const settingsStatus = element('settings-status');
  const background = element<HTMLInputElement>('background-opacity');
  const shadow = element<HTMLInputElement>('text-shadow');
  const resetStyle = element<HTMLButtonElement>('reset-style');
  const fontFamily = element<HTMLSelectElement>('font-family');
  let fontNames: string[] = [];
  function fontOption(label: string, value: string) {
    const option = new Option(t(label), value);
    option.style.fontFamily = fontStack(value);
    return option;
  }
  function showFonts(selected: string) {
    fontFamily.replaceChildren(...FALLBACK_FONTS.map(([value, label]) => fontOption(label, value)));
    const installed = document.createElement('optgroup'); installed.label = t('本机字体（上次读取）');
    for (const name of fontNames) installed.append(fontOption(fontLabel(name), name));
    if (fontNames.length) fontFamily.append(installed);
    if (selected && !Array.from(fontFamily.options).some(option => option.value === selected))
      fontFamily.add(fontOption(`${fontLabel(selected)}（已保存，当前列表未确认）`, selected));
    fontFamily.value = selected;
    fontFamily.style.fontFamily = fontStack(selected);
  }
  element('read-fonts').addEventListener('click', () => {
    void browser.tabs.create({ url: browser.runtime.getURL('/fonts.html') }).catch(() => {
      element('font-note').textContent = t('无法打开字体设置页，请重新加载扩展后重试。');
    });
  });
  const onFontsChanged = (changes: Record<string, { newValue?: unknown }>, area: string) => {
    if (area !== 'local' || !(FONT_LIST_KEY in changes)) return;
    fontNames = normalizeFontList(changes[FONT_LIST_KEY]?.newValue);
    showFonts(fontFamily.value);
  };
  browser.storage.onChanged.addListener(onFontsChanged);
  window.addEventListener('pagehide', () => browser.storage.onChanged.removeListener(onFontsChanged));
  const diagnostics = element('diagnostics');
  const upperLanguage = element<HTMLSelectElement>('upper-language');
  const lowerLanguage = element<HTMLSelectElement>('lower-language');
  let availableTracks: SubtitleTrack[] = [];
  let inspectedTabId: number | undefined;
  let resourceGeneration = 0;
  const resourceButton = element<HTMLButtonElement>('inspect-resources');
  const resourceResult = element('resource-result');
  const startButton = element<HTMLButtonElement>('start-dual');
  const dualStatus = element('dual-status');
  let statusTimer: ReturnType<typeof setTimeout> | undefined;
  let statusVersion = 0;
  let loading = false;
  let active = false;
  function updateStartButton() {
    const a = availableTracks.find(track => track.id === upperLanguage.value);
    const b = availableTracks.find(track => track.id === lowerLanguage.value);
    startButton.disabled = loading || active || !(a && b && a.language !== b.language);
  }
  function displayDual(value: unknown) {
    if (!isDualState(value)) throw new Error('扩展状态不兼容，请重新加载并刷新 Netflix。');
    loading = value.phase === 'loading';
    active = value.phase === 'active';
    dualStatus.textContent = t(value.detail);
    updateStartButton();
  }
  async function pollDual(version: number) {
    if (inspectedTabId === undefined || version !== statusVersion) return;
    try {
      const value: unknown = await browser.tabs.sendMessage(inspectedTabId, { type: DUAL_STATUS }, { frameId: 0 });
      if (version !== statusVersion) return;
      displayDual(value);
      if (isDualState(value) && ['loading', 'active'].includes(value.phase)) statusTimer = setTimeout(() => { void pollDual(version); }, 700);
    } catch { if (version === statusVersion) { loading = false; updateStartButton(); dualStatus.textContent = t('连接中断，请刷新 Netflix 后重新检测。'); } }
  }
  for (const [button, type] of [[startButton, START_DUAL], [element('stop-dual'), STOP_DUAL]] as const) {
    button.addEventListener('click', async () => {
      if (inspectedTabId === undefined) { dualStatus.textContent = t('请先重新检测播放器。'); return; }
      const version = ++statusVersion;
      clearTimeout(statusTimer);
      loading = type === START_DUAL; updateStartButton();
      try {
        const value: unknown = await browser.tabs.sendMessage(inspectedTabId, {
          type, ids: [upperLanguage.value, lowerLanguage.value], fontSize: Number(size.value),
        }, { frameId: 0 });
        if (version !== statusVersion) return;
        displayDual(value);
        if (type === START_DUAL) void pollDual(version);
      } catch { if (version === statusVersion) { loading = false; updateStartButton(); dualStatus.textContent = t('操作失败，请刷新 Netflix 后重新检测。'); } }
    });
  }
  window.addEventListener('pagehide', () => { statusVersion++; clearTimeout(statusTimer); });

  function showTracks(report?: TrackReport) {
    resourceGeneration++;
    resourceButton.disabled = true;
    resourceResult.textContent = t('');
    availableTracks = report?.state === 'ready' ? report.tracks : [];
    startButton.disabled = true;
    for (const select of [upperLanguage, lowerLanguage]) {
      select.replaceChildren(new Option(t(availableTracks.length ? '请选择语言' : '尚未读到字幕列表'), ''));
      for (const track of availableTracks) select.add(new Option(t(track.label), track.id));
      select.disabled = availableTracks.length === 0;
    }
    upperLanguage.disabled = true;
    upperLanguage.value = report?.currentTrackId ?? '';
    updatePreviewText();
    element('pending').textContent = t(availableTracks.length
      ? '选择两种不同语言后可尝试开启双语字幕。两条字幕准备成功后才隐藏原生字幕。'
      : '字幕列表尚不可用，请查看播放器状态。');
  }

  function checkSelection() {
    updatePreviewText();
    resourceGeneration++;
    resourceResult.textContent = t('');
    const upper = availableTracks.find(track => track.id === upperLanguage.value);
    const lower = availableTracks.find(track => track.id === lowerLanguage.value);
    lowerLanguage.disabled = !upper;
    resourceButton.disabled = !(upper && lower && upper.language !== lower.language);
    updateStartButton();
    element('pending').textContent = t(upper && lower
      ? upper.language === lower.language
        ? '请选择两种不同语言；同语言的普通字幕和 SDH 不算两种语言。'
        : `已选上方：${upper.label}；下方：${lower.label}。点击开启以应用此组合。`
      : !upper ? '请先在 Netflix 播放器中选择一种字幕语言。第一字幕跟随 Netflix。' : '第一字幕跟随 Netflix，请选择不同语言的第二字幕。');
  }
  upperLanguage.addEventListener('change', checkSelection);
  lowerLanguage.addEventListener('change', checkSelection);
  // Refresh native selection without discarding an unapplied second-language choice.
  let nativePollBusy = false;
  const nativeTimer = setInterval(async () => {
    if (nativePollBusy || inspectedTabId === undefined || refresh.disabled) return;
    nativePollBusy = true;
    const version = statusVersion;
    try {
      const snapshot: unknown = await browser.tabs.sendMessage(inspectedTabId, { type: INSPECT_PLAYER }, { frameId: 0 });
      if (version !== statusVersion || !isPlayerSnapshot(snapshot)) return;
      const lower = lowerLanguage.value || snapshot.selection?.[1] || '';
      const report = snapshot.subtitles;
      if (report.state === 'ready') {
        const changed = JSON.stringify(report.tracks) !== JSON.stringify(availableTracks)
          || upperLanguage.value !== (report.currentTrackId ?? '') || lowerLanguage.value !== lower;
        if (JSON.stringify(report.tracks) !== JSON.stringify(availableTracks)) showTracks(report);
        upperLanguage.value = report.currentTrackId ?? '';
        upperLanguage.disabled = true;
        lowerLanguage.value = lower;
        if (changed) checkSelection();
      }
      displayDual(snapshot.dual);
    } catch { /* Manual recheck still reports connection errors. */ }
    finally { nativePollBusy = false; }
  }, 2000);
  window.addEventListener('pagehide', () => clearInterval(nativeTimer));
  resourceButton.addEventListener('click', async () => {
    if (inspectedTabId === undefined) return;
    const generation = ++resourceGeneration;
    resourceButton.disabled = true;
    resourceResult.textContent = t('正在检查两条轨道的资源结构…');
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const report: unknown = await Promise.race([
        browser.tabs.sendMessage(inspectedTabId, { type: INSPECT_RESOURCES,
          ids: [upperLanguage.value, lowerLanguage.value] }, { frameId: 0 }),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('资源检查超时')), 5000); }),
      ]);
      if (generation !== resourceGeneration) return;
      if (!isResourceReport(report)) throw new Error('返回结果不兼容，请重新加载扩展并刷新 Netflix。');
      resourceResult.textContent = t(report.state === 'unavailable' ? report.detail : report.tracks.map(track =>
        `${track.label}：${track.hasDownloadMetadata ? '发现资源信息' : '未发现资源信息'}（${track.profiles.join(', ') || '格式未知'}）`
      ).join('\n') + '\n资源信息可用于排查，能否播放以开启后的结果为准。');
    } catch (error) {
      if (generation === resourceGeneration) resourceResult.textContent = t(`资源检查失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      if (generation === resourceGeneration) resourceButton.disabled = false;
    }
  });

  async function inspectPlayer() {
    refresh.disabled = true;
    inspectedTabId = undefined;
    statusVersion++; clearTimeout(statusTimer);
    showTracks();
    status.textContent = t('正在检测当前页面…');
    diagnostics.textContent = t('');
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      if (location.protocol !== 'chrome-extension:') {
        status.textContent = t('当前打开的是普通网页预览，无法连接 Netflix。请加载扩展后，在 Netflix 标签页点击浏览器工具栏里的 Dul Subtitle 图标。');
        return;
      }
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (tab?.id == null) {
        status.textContent = t('没有找到当前标签页。');
        return;
      }
      if (tab.url?.startsWith(browser.runtime.getURL('/'))) {
        status.textContent = t('当前标签页是扩展自身。请切换到 Netflix 播放页，再从浏览器工具栏打开扩展。');
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
      displayDual(snapshot.dual);
      if (snapshot.isWatchPage && snapshot.hasVideo) showTracks(report);
      if (Array.isArray(snapshot.selection) && snapshot.selection.length === 2) {
        upperLanguage.value = report.currentTrackId ?? '';
        lowerLanguage.value = snapshot.selection[1] ?? '';
        checkSelection();
      }
      if (['loading', 'active'].includes(snapshot.dual.phase)) void pollDual(statusVersion);
      const current = report.tracks.find(track => track.id === report.currentTrackId);
      diagnostics.textContent = t(report.state === 'ready'
        ? `Netflix 当前字幕：${current?.label ?? '未识别'}。`
        : report.detail);
      status.textContent = t(!snapshot.isWatchPage
        ? '已连接 Netflix，请进入一部影片的播放页面。'
        : !snapshot.hasVideo
          ? '已进入播放页，等待播放器加载后请重新检测。'
          : report.state === 'ready'
            ? '第一字幕跟随 Netflix，请选择不同语言的第二字幕。'
            : report.detail);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      status.textContent = t('检测失败。请在 Netflix 播放页打开扩展；若刚安装或更新，请先刷新 Netflix，并检查扩展是否获准访问此网站。');
      diagnostics.textContent = t(`错误详情：${detail}`);
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
      refresh.disabled = false;
    }
  }

  function updatePreviewText() {
    for (const [id, select] of [['upper-preview', upperLanguage], ['lower-preview', lowerLanguage]] as const) {
      const track = availableTracks.find(candidate => candidate.id === select.value);
      const preview = element(id);
      preview.textContent = track ? previewText(track.language) ?? track.label : t('请选择字幕语言以预览');
      preview.lang = track?.language ?? document.documentElement.lang;
      preview.dir = 'auto';
    }
  }

  function updatePreview(style: SubtitleStyle) {
    updatePreviewText();
    showFonts(style.fontFamily);
    size.value = String(style.fontSize);
    background.value = String(style.backgroundOpacity);
    shadow.checked = style.shadow;
    element('font-size-value').textContent = t(`${style.fontSize} px`);
    element('background-value').textContent = t(style.backgroundOpacity ? `${style.backgroundOpacity}%` : '透明');
    for (const id of ['upper-preview', 'lower-preview']) {
      const preview = element(id);
      preview.style.fontSize = `${style.fontSize}px`;
      preview.style.fontFamily = fontStack(style.fontFamily);
      preview.style.textShadow = style.shadow ? TEXT_SHADOW : 'none';
      preview.style.backgroundColor = `rgba(0,0,0,${style.backgroundOpacity / 100})`;
    }
  }

  async function loadSettings() {
    try {
      const result = await browser.storage.local.get([STYLE_KEY, LEGACY_SIZE_KEY, FONT_LIST_KEY]);
      fontNames = normalizeFontList(result[FONT_LIST_KEY]);
      updatePreview(normalizeStyle(result[STYLE_KEY] ?? { fontSize: result[LEGACY_SIZE_KEY] }));
      settingsStatus.textContent = t('设置自动保存，并实时应用到已开启的双语字幕。');
    } catch {
      settingsStatus.textContent = t('设置读取失败，暂时使用默认字号。');
    } finally {
      size.disabled = false;
      background.disabled = false;
      shadow.disabled = false;
      resetStyle.disabled = false;
      fontFamily.disabled = false;
    }
  }

  // Serialize writes so quick changes cannot leave an older preference saved last.
  let saveQueue = Promise.resolve();
  function saveStyle() {
    const value = normalizeStyle({ fontSize: Number(size.value), backgroundOpacity: Number(background.value), shadow: shadow.checked, fontFamily: fontFamily.value });
    updatePreview(value);
    saveQueue = saveQueue.then(async () => {
      try {
        await browser.storage.local.set({ [STYLE_KEY]: value });
        settingsStatus.textContent = t('样式已保存，已开启的字幕会实时更新。');
      } catch {
        settingsStatus.textContent = t('保存失败，请重新调整样式重试。');
      }
    });
  }
  size.addEventListener('input', saveStyle);
  background.addEventListener('input', saveStyle);
  shadow.addEventListener('change', saveStyle);
  fontFamily.addEventListener('change', saveStyle);
  resetStyle.addEventListener('click', () => { updatePreview(DEFAULT_STYLE); saveStyle(); });
  updatePreview(DEFAULT_STYLE);
  refresh.addEventListener('click', () => { void inspectPlayer(); });
  void loadSettings();
  void inspectPlayer();

}
void main();
