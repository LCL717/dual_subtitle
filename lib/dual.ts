import type { Cue } from './timeline';
export interface DualState { phase: 'off' | 'loading' | 'active' | 'error'; detail: string }
export interface SubtitlePayload { tracks: Cue[][] }
export function isDualState(value: unknown): value is DualState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Record<string, unknown>;
  return ['off', 'loading', 'active', 'error'].includes(String(state.phase)) && typeof state.detail === 'string' && state.detail.length <= 500;
}
export function isSubtitlePayload(value: unknown): value is SubtitlePayload {
  if (!value || typeof value !== 'object' || !('tracks' in value) || !Array.isArray(value.tracks) || value.tracks.length !== 2) return false;
  let size = 0;
  return value.tracks.every(track => Array.isArray(track) && track.length > 0 && track.length <= 15000 && track.every(cue => {
    if (!cue || typeof cue !== 'object' || !Number.isFinite(cue.start) || !Number.isFinite(cue.end)
      || cue.start < 0 || cue.end <= cue.start || typeof cue.text !== 'string' || cue.text.length > 4096) return false;
    size += cue.text.length;
    return size <= 4_000_000;
  }));
}
