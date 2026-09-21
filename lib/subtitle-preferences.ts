import type { SubtitleTrack } from './netflix-tracks';
export const PREFERENCES_KEY = 'dul-subtitle:preferences';
export interface TrackPreference { language: string; sdh: boolean; variant: string }
export interface Preferences { enabled: boolean; upper: TrackPreference; lower: TrackPreference }
export function preferenceFor(track: SubtitleTrack): TrackPreference {
  return { language: track.language, sdh: /\[SDH\]|\bCC\b/i.test(track.label), variant: track.variant ?? '' };
}
export function readPreferences(value: unknown): Preferences | undefined {
  if (!value || typeof value !== 'object') return;
  const data = value as Record<string, unknown>;
  function valid(value: unknown): value is TrackPreference {
    if (!value || typeof value !== 'object') return false;
    const track = value as Record<string, unknown>;
    return typeof track.language === 'string' && track.language.length > 0 && track.language.length <= 200
      && typeof track.sdh === 'boolean' && typeof track.variant === 'string' && track.variant.length <= 200;
  }
  if (typeof data.enabled !== 'boolean' || !valid(data.upper) || !valid(data.lower) || data.upper.language === data.lower.language) return;
  return { enabled: data.enabled, upper: data.upper, lower: data.lower };
}
export function matchPreferences(tracks: SubtitleTrack[], preferences: Preferences): [string | null, string | null] {
  function match(preference: TrackPreference) {
    const candidates = tracks.filter(track => {
      const current = preferenceFor(track);
      return current.language === preference.language && current.sdh === preference.sdh && current.variant === preference.variant;
    });
    return candidates.length === 1 ? candidates[0]!.id : null;
  }
  return [match(preferences.upper), match(preferences.lower)];
}
