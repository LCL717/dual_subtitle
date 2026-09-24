import { isTrackReport, type TrackReport } from './netflix-tracks';
import { isDualState, type DualState } from './dual';
export const INSPECT_PLAYER = 'dual-subtitle:inspect-player';
export const INSPECT_RESOURCES = 'dual-subtitle:inspect-resources';
export const START_DUAL = 'dual-subtitle:start';
export const STOP_DUAL = 'dual-subtitle:stop';
export const DUAL_STATUS = 'dual-subtitle:status';

export interface PlayerSnapshot {
  isWatchPage: boolean;
  hasVideo: boolean;
  textTrackCount: number;
  integration: 'pending';
  subtitles: TrackReport;
  dual: DualState;
  selection?: [string | null, string | null];
}

export function isPlayerSnapshot(value: unknown): value is PlayerSnapshot {
  if (!value || typeof value !== 'object') return false;
  const data = value as Record<string, unknown>;
  return typeof data.isWatchPage === 'boolean'
    && typeof data.hasVideo === 'boolean'
    && Number.isInteger(data.textTrackCount)
    && (data.textTrackCount as number) >= 0
    && data.integration === 'pending'
    && isTrackReport(data.subtitles)
    && isDualState(data.dual);
}
