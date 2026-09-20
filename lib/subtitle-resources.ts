import { getTrackPlayers, record } from './netflix-tracks.ts';
import { discoverResources } from './resource-discovery.ts';

export interface ResourceSummary {
  id: string;
  label: string;
  fields: string[];
  resourceFields: string[];
  profiles: string[];
  hasDownloadMetadata: boolean;
  hasInlineCues: boolean;
}
export interface ResourceReport {
  state: 'inspected' | 'unavailable';
  tracks: ResourceSummary[];
  detail: string;
}

const metadataKeys = ['downloadables', 'ttDownloadables', 'timedtextDownloadables', 'urls', 'downloadUrls', 'downloadableIds'];
const safeKey = (key: string) => /^[\w.-]{1,80}$/.test(key);
function keys(value: unknown): string[] {
  const obj = record(value);
  return obj ? Object.keys(obj).filter(safeKey).slice(0, 40) : [];
}

// Deliberately report structure, not raw objects, signed URLs, or subtitle text.
export function summarizeResources(raw: unknown, id: string, label: string): ResourceSummary {
  const track = record(raw) ?? {};
  const resourceFields: string[] = [];
  const profiles = new Set<string>();
  for (const key of metadataKeys) {
    const value = track[key];
    if (value == null) continue;
    for (const field of keys(value)) resourceFields.push(`${key}.${field}`);
    const nodes = Array.isArray(value) ? value.slice(0, 20) : Object.values(record(value) ?? {}).slice(0, 20);
    for (const node of nodes) {
      for (const field of keys(node)) resourceFields.push(`${key}.*.${field}`);
      const item = record(node);
      for (const field of ['contentProfile', 'profile']) {
        const profile = item?.[field];
        if (typeof profile === 'string' && safeKey(profile)) profiles.add(profile);
      }
    }
  }
  return {
    id, label,
    fields: keys(track),
    resourceFields: [...new Set(resourceFields)].slice(0, 60),
    profiles: [...profiles].slice(0, 20),
    hasDownloadMetadata: metadataKeys.some(key => track[key] != null),
    hasInlineCues: Array.isArray(track.cues) && track.cues.length > 0,
  };
}

export function inspectResources(netflix: unknown, ids: string[]): ResourceReport {
  const unavailable = (detail: string): ResourceReport => ({ state: 'unavailable', tracks: [], detail });
  if (ids.length !== 2 || ids[0] === ids[1]) return unavailable('请先选择两种不同语言。');
  try {
    const players = getTrackPlayers(netflix);
    if (players.length !== 1) return unavailable('无法确定当前播放器，请重新检测。');
    const selected = players[0]!;
    const tracks = ids.map(id => selected.tracks.find(track => track.id === id));
    if (tracks.some(track => !track)) return unavailable('所选轨道已失效，影片可能已切换，请重新检测。');
    if (tracks[0]!.language === tracks[1]!.language) return unavailable('两条轨道属于同一语言，请重新选择。');
    const summaries = tracks.map(track => {
      const raw = selected.raw.find(item => {
        const obj = record(item);
        return obj?.trackId === track!.id || obj?.id === track!.id;
      });
      return summarizeResources(raw, track!.id, track!.label);
    });
    return { state: 'inspected', tracks: summaries,
      detail: summaries.every(track => track.hasDownloadMetadata || track.hasInlineCues)
        ? '两条轨道均提供资源相关字段，仍需验证其格式及可获取性；尚未下载字幕。'
        : '播放器只暴露了部分字幕信息。需要进一步定位字幕请求；没有切换原生字幕。' };
  } catch {
    return unavailable('读取字幕资源结构失败，请重新检测播放器。');
  }
}

export function isResourceReport(value: unknown): value is ResourceReport {
  const data = record(value);
  const strings = (value: unknown, max: number) => Array.isArray(value) && value.length <= max
    && value.every(item => typeof item === 'string' && item.length <= 210);
  return !!data && (data.state === 'inspected' || data.state === 'unavailable')
    && typeof data.detail === 'string' && data.detail.length <= 500
    && Array.isArray(data.tracks) && data.tracks.length <= 2 && data.tracks.every((value: unknown) => {
      const track = record(value);
      return track && typeof track.id === 'string' && track.id.length <= 200
        && typeof track.label === 'string' && track.label.length <= 210
        && strings(track.fields, 40) && strings(track.resourceFields, 60) && strings(track.profiles, 20)
        && typeof track.hasDownloadMetadata === 'boolean' && typeof track.hasInlineCues === 'boolean';
    });
}

export async function inspectPlayerResources(netflix: unknown, ids: string[], stillCurrent: () => boolean): Promise<ResourceReport> {
  const report = inspectResources(netflix, ids);
  if (report.state !== 'inspected') return report;
  // This is a separately observed internal root, not the public track list.
  // Exact track IDs are required; language-only matching could select a wrong variant.
  const root = record(record(netflix)?.player)?.MediaSession;
  const discovered = await discoverResources(root, ids);
  if (!stillCurrent()) return { state: 'unavailable', tracks: [], detail: '影片已切换，本次资源检查已丢弃。' };
  let matches = 0;
  for (const track of report.tracks) {
    const resources = discovered.resources.filter(resource => resource.trackId === track.id);
    if (!resources.length) continue;
    matches++;
    track.hasDownloadMetadata = true;
    track.profiles = [...new Set([...track.profiles, ...resources.map(resource => resource.profile)])].slice(0, 20);
    track.resourceFields = [...track.resourceFields, 'player-resolved.urls', 'player-resolved.profile'].slice(0, 60);
  }
  report.detail = `播放器资源检查：已匹配 ${matches}/2 条所选轨道；检查 ${discovered.visited} 个对象，跳过 ${discovered.skippedAccessors} 个访问器${discovered.limited ? '（达到部分检查限制，未找到不代表不存在）' : ''}。`
    + (matches === 2 ? '已找到两轨地址，尚未验证下载和格式解析。' : '部分地址可能尚未加载或无法从当前结构读取；未切换原生字幕。');
  return report;
}
