export interface SubtitleTrack {
  id: string;
  language: string;
  label: string;
  variant?: string;
}

export interface TrackReport {
  state: 'ready' | 'unavailable' | 'ambiguous' | 'error';
  tracks: SubtitleTrack[];
  currentTrackId: string | null;
  detail: string;
}

export function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : undefined;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, 200) : '';
}

export function normalizeTracks(raw: unknown): SubtitleTrack[] {
  if (!Array.isArray(raw) || raw.length > 200) return [];
  const seen = new Set<string>();
  const tracks = raw.flatMap((item): SubtitleTrack[] => {
    const track = record(item);
    if (!track || track.isNoneTrack === true || track.isForcedNarrative === true) return [];
    const id = text(track.trackId) || text(track.id);
    const language = text(track.bcp47) || text(track.language);
    if (!id || !language || /^(none|off)$/i.test(id) || seen.has(id)) return [];
    const rawLabel = text(track.displayName) || text(track.languageDescription) || language;
    const kind = text(track.rawTrackType || track.trackType).toLowerCase();
    if (kind === 'none' || kind === 'forced') return [];
    const caption = ['sdh', 'closedcaptions', 'closed_captions'].includes(kind);
    const label = caption && !/sdh|\bcc\b/i.test(rawLabel) ? `${rawLabel} [SDH]` : rawLabel;
    seen.add(id);
    const variant = typeof track.variant === 'number' ? String(track.variant) : text(track.variant);
    return [{ id, language, label, variant }];
  });
  const counts = new Map<string, number>();
  for (const track of tracks) counts.set(track.label, (counts.get(track.label) ?? 0) + 1);
  const ordinal = new Map<string, number>();
  return tracks.map(track => {
    if (counts.get(track.label) === 1) return track;
    const number = (ordinal.get(track.label) ?? 0) + 1;
    ordinal.set(track.label, number);
    // When Netflix doesn't describe a variant, don't guess its meaning.
    return { ...track, label: `${track.label.slice(0, 190)} [轨道 ${number}]` };
  });
}

export function invoke(target: unknown, name: string, ...args: unknown[]): unknown {
  const method = record(target)?.[name];
  if (typeof method !== 'function') throw new Error('Unsupported player API');
  return method.apply(target, args);
}

export function getTrackPlayers(netflix: unknown): { player: unknown; raw: unknown[]; tracks: SubtitleTrack[] }[] {
  const app = record(record(netflix)?.appContext);
  const state = record(record(app?.state)?.playerApp);
  if (!state) return [];
  const api = record(invoke(state, 'getAPI'))?.videoPlayer;
  const sessions = invoke(api, 'getAllPlayerSessionIds');
  if (!Array.isArray(sessions) || sessions.length > 20) return [];
  return sessions.flatMap(id => {
    if (typeof id !== 'string') return [];
    try {
      const player = invoke(api, 'getVideoPlayerBySessionId', id);
      const raw = invoke(player, 'getTimedTextTrackList');
      const tracks = normalizeTracks(raw);
      return Array.isArray(raw) && tracks.length ? [{ player, raw, tracks }] : [];
    } catch { return []; }
  });
}

// Experimental read-only adapter. Netflix does not document this private API.
// No track switching, network interception, or raw player objects cross the bridge.
export function inspectNetflixTracks(netflix: unknown, movieId?: string): TrackReport {
  const unavailable = (detail: string): TrackReport => ({ state: 'unavailable', tracks: [], currentTrackId: null, detail });
  try {
    const app = record(record(netflix)?.appContext);
    const state = record(record(app?.state)?.playerApp);
    if (!state) return unavailable('未发现 Netflix 播放器接口；请开始播放后重试。');
    const api = record(invoke(state, 'getAPI'))?.videoPlayer;
    const sessions = invoke(api, 'getAllPlayerSessionIds');
    if (!Array.isArray(sessions) || sessions.length === 0) return unavailable('播放器会话尚未就绪。');
    const players = sessions.slice(0, 20).flatMap((id) => {
      if (typeof id !== 'string') return [];
      try {
        const player = invoke(api, 'getVideoPlayerBySessionId', id);
        const tracks = normalizeTracks(invoke(player, 'getTimedTextTrackList'));
        return tracks.length ? [{ player, tracks }] : [];
      } catch { return []; }
    });
    if (players.length > 1) return { state: 'ambiguous', tracks: [], currentTrackId: null, detail: '检测到多个字幕播放器，暂不猜测当前影片，请关闭预览后重试。' };
    const selected = players[0];
    if (!selected) return unavailable('未读到可识别的字幕列表。请打开 Netflix 字幕菜单后重新检测。');
    if (movieId && typeof record(selected.player)?.getMovieId === 'function'
      && String(invoke(selected.player, 'getMovieId')) !== movieId) return unavailable('正在等待新影片播放器。');
    let currentTrackId: string | null = null;
    try {
      const current = record(invoke(selected.player, 'getTimedTextTrack'));
      const id = text(current?.trackId) || text(current?.id);
      currentTrackId = selected.tracks.some(track => track.id === id) ? id : null;
    } catch { /* Current track is optional; never infer it from the first track. */ }
    return { state: 'ready', tracks: selected.tracks, currentTrackId, detail: '已读取播放器字幕列表，请与 Netflix 字幕菜单核对。可选择两种语言并尝试开启实验版。' };
  } catch {
    return { state: 'error', tracks: [], currentTrackId: null, detail: 'Netflix 内部字幕接口不可用或结构已变化；没有更改原生字幕。' };
  }
}

export function isTrackReport(value: unknown): value is TrackReport {
  const report = record(value);
  if (!report || !['ready', 'unavailable', 'ambiguous', 'error'].includes(String(report.state))
    || typeof report.detail !== 'string' || report.detail.length > 500
    || !(report.currentTrackId === null || typeof report.currentTrackId === 'string')
    || !Array.isArray(report.tracks) || report.tracks.length > 200) return false;
  return report.tracks.every((item: unknown) => {
    const track = record(item);
    return track && (track.variant === undefined || (typeof track.variant === 'string' && track.variant.length <= 200)) && ['id', 'language', 'label'].every(key => typeof track[key] === 'string'
      && (track[key] as string).length > 0 && (track[key] as string).length <= 210);
  });
}
