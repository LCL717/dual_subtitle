export const STYLE_KEY = 'dual-subtitle:style';
export const LEGACY_SIZE_KEY = 'dual-subtitle:font-size';
import { validFontName } from './fonts.ts';
export interface SubtitleStyle { fontSize: number; backgroundOpacity: number; shadow: boolean; fontFamily: string }
export const DEFAULT_STYLE: SubtitleStyle = { fontSize: 24, backgroundOpacity: 0, shadow: true, fontFamily: '' };
export const TEXT_SHADOW = '0 2px 4px rgba(0,0,0,.95), 1px 0 2px black, -1px 0 2px black, 0 -1px 2px black';
export function normalizeStyle(value: unknown): SubtitleStyle {
  const data = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const number = (key: string, fallback: number, min: number, max: number) =>
    typeof data[key] === 'number' && Number.isFinite(data[key]) ? Math.max(min, Math.min(max, Math.round(data[key]))) : fallback;
  return {
    fontSize: number('fontSize', 24, 16, 36),
    backgroundOpacity: number('backgroundOpacity', 0, 0, 100),
    shadow: typeof data.shadow === 'boolean' ? data.shadow : true,
    fontFamily: validFontName(data.fontFamily) ? data.fontFamily : '',
  };
}
