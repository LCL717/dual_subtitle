export const INSPECT_PLAYER = 'dul-subtitle:inspect-player';

export interface PlayerSnapshot {
  isWatchPage: boolean;
  hasVideo: boolean;
  textTrackCount: number;
  integration: 'pending';
}

export function isPlayerSnapshot(value: unknown): value is PlayerSnapshot {
  if (!value || typeof value !== 'object') return false;
  const data = value as Record<string, unknown>;
  return typeof data.isWatchPage === 'boolean'
    && typeof data.hasVideo === 'boolean'
    && Number.isInteger(data.textTrackCount)
    && (data.textTrackCount as number) >= 0
    && data.integration === 'pending';
}