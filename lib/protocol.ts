import { isTrackReport, type TrackReport } from './netflix-tracks';
import { isDualState, type DualState } from './dual';
export const INSPECT_PLAYER = 'dul-subtitle:inspect-player';
export const INSPECT_RESOURCES = 'dul-subtitle:inspect-resources';
export const START_DUAL = 'dul-subtitle:start';
export const STOP_DUAL = 'dul-subtitle:stop';
export const DUAL_STATUS = 'dul-subtitle:status';

export interface PlayerSnapshot {
  isWatchPage: boolean;
  hasVideo: boolean;
  textTrackCount: number;
  integration: 'pending';
  subtitles: TrackReport;
  dual: DualState;
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
