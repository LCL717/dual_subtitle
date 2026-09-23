import type { TrackReport } from './netflix-tracks';

// Track identity matters: a normal subtitle and SDH are not interchangeable.
export function nativeSelection(report: TrackReport, lowerId: string | null): { ids: [string, string] | null; detail: string } {
  if (report.state !== 'ready') return { ids: null, detail: '正在等待播放器，字幕将自动恢复。' };
  const upper = report.tracks.find(track => track.id === report.currentTrackId);
  if (!upper) return { ids: null, detail: '请先在 Netflix 播放器中选择一种字幕语言。第一字幕跟随 Netflix。' };
  const lower = report.tracks.find(track => track.id === lowerId);
  if (!lower || lower.language === upper.language)
    return { ids: null, detail: '第一字幕跟随 Netflix，请选择不同语言的第二字幕。' };
  return { ids: [upper.id, lower.id], detail: '' };
}
