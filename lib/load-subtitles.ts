import { getTrackPlayers, record } from './netflix-tracks.ts';
import { discoverResources } from './resource-discovery.ts';
import { parseImsc } from './imsc.ts';
import type { SubtitlePayload } from './dual';

async function download(url: string, signal: AbortSignal): Promise<string> {
  // URLs are already restricted to Netflix HTTPS hosts by resource discovery.
  const response = await fetch(url, { credentials: 'omit', redirect: 'error', signal });
  if (!response.ok) throw new Error(`字幕请求失败（HTTP ${response.status}）。`);
  const reader = response.body?.getReader();
  if (!reader) throw new Error('字幕响应为空。');
  let length = 0;
  let result = '';
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 4_000_000) throw new Error('字幕文件超过 4 MB 限制。');
      result += decoder.decode(value, { stream: true });
    }
    return result + decoder.decode();
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

export async function loadSubtitles(netflix: unknown, ids: string[], signal: AbortSignal, current: () => boolean): Promise<SubtitlePayload> {
  const players = getTrackPlayers(netflix);
  const player = players.length === 1 ? players[0] : undefined;
  const selected = ids.map(id => player?.tracks.find(track => track.id === id));
  if (ids.length !== 2 || selected.some(track => !track) || selected[0]!.language === selected[1]!.language)
    throw new Error('请重新检测并选择两种不同语言。');
  const found = await discoverResources(record(record(netflix)?.player)?.MediaSession, ids);
  if (!current() || signal.aborted) throw new Error('影片已切换或加载已取消。');
  const tracks = await Promise.all(ids.map(async id => {
    const candidates = found.resources.filter(resource => resource.trackId === id && ['imsc1.1', 'dfxp-ls-sdh', 'simplesdh'].includes(resource.profile));
    if (!candidates.length) throw new Error('未找到所选轨道的 IMSC 文本资源，请重新检查资源。');
    let lastError: unknown;
    for (const candidate of candidates) {
      for (const url of candidate.urls.slice(0, 2)) {
        if (signal.aborted || !current()) throw new Error('加载已取消或影片已切换。');
        try { return parseImsc(await download(url, signal)); }
        catch (error) { lastError = error; }
      }
    }
    // Fetch errors may include signed URLs; never forward their raw text.
    if (lastError instanceof TypeError) throw new Error('浏览器未能获取字幕，可能是跨域限制或网络问题。');
    if (signal.aborted) throw new Error('字幕加载已取消或超时。');
    throw new Error(lastError instanceof Error ? lastError.message : '字幕下载或解析失败。');
  }));
  if (!current()) throw new Error('影片已切换，丢弃旧字幕。');
  return { tracks };
}
