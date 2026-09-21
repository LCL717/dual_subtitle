export const FONT_LIST_KEY = 'dul-subtitle:local-font-families';
export const FALLBACK_FONTS = [['', '系统默认'], ['@sans-serif', '无衬线（系统）'], ['@serif', '衬线（系统）'], ['@monospace', '等宽（系统）']] as const;
// Display aliases only: CSS and saved preferences retain the enumerated family.
const LOCAL_NAMES: Readonly<Record<string, string>> = {
  'Microsoft YaHei': '微软雅黑', 'Microsoft YaHei UI': '微软雅黑 UI',
  'Microsoft JhengHei': '微軟正黑體', 'Microsoft JhengHei UI': '微軟正黑體 UI',
  SimSun: '宋体', NSimSun: '新宋体', SimHei: '黑体', KaiTi: '楷体', FangSong: '仿宋',
  MingLiU: '細明體', PMingLiU: '新細明體', 'DFKai-SB': '標楷體',
  'Yu Gothic': '游ゴシック', 'Yu Gothic UI': '游ゴシック UI', 'Yu Mincho': '游明朝',
  Meiryo: 'メイリオ', 'Meiryo UI': 'メイリオ UI',
  'MS Gothic': 'ＭＳ ゴシック', 'MS PGothic': 'ＭＳ Ｐゴシック',
  'MS UI Gothic': 'ＭＳ UI Gothic', 'MS Mincho': 'ＭＳ 明朝', 'MS PMincho': 'ＭＳ Ｐ明朝',
};
export function fontLabel(name: string): string {
  const local = Object.hasOwn(LOCAL_NAMES, name) ? LOCAL_NAMES[name] : undefined;
  return local ? `${local}（${name}）` : name;
}
export function validFontName(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 200 && !/[\x00-\x1f\x7f]/.test(value);
}
export function normalizeFontList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.slice(0, 20000).filter(validFontName).map(name => name.trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b)).slice(0, 5000);
}
export function fontStack(name: string): string {
  const fallback = 'Arial, "Microsoft YaHei", sans-serif';
  if (!name) return fallback;
  if (['@sans-serif', '@serif', '@monospace'].includes(name)) return `${name.slice(1)}, ${fallback}`;
  // Quote a single font family, never interpret it as arbitrary CSS.
  if (!validFontName(name)) return fallback;
  return `"${name.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}", ${fallback}`;
}
export async function readLocalFonts(target: { queryLocalFonts?: () => Promise<{ family: string }[]> }): Promise<string[]> {
  if (typeof target.queryLocalFonts !== 'function') throw new Error('当前浏览器或扩展页面不支持读取本机字体，可继续使用系统备用字体。');
  // Called directly from a click handler, preserving transient user activation.
  try {
    const fonts = await target.queryLocalFonts();
    return normalizeFontList(fonts.map(font => font.family));
  } catch (error) {
    const name = error && typeof error === 'object' && 'name' in error ? error.name : '';
    if (name === 'NotAllowedError') throw new Error('未获字体访问权限。你仍可使用系统备用字体，或在浏览器权限设置中允许后重试。');
    throw new Error('读取字体失败。请保持此设置页处于前台后重试；也可以继续使用系统备用字体。');
  }
}
