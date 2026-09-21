import { resolveLanguage, translate, UI_LANGUAGE_KEY, type UiLanguage } from './ui-messages.ts';

let language: UiLanguage = 'zh-CN';
export const t = (text: string): string => translate(text, language);

interface LanguageStorage {
  get(key: string): Promise<Record<string, unknown>>;
  set(values: Record<string, unknown>): Promise<unknown>;
}
export async function initializeLanguage(
  storage: LanguageStorage,
  doc: Document = document,
  reload: () => void = () => location.reload(),
  browserLanguage: string = navigator.language,
) {
  try {
    const saved = await storage.get(UI_LANGUAGE_KEY);
    language = resolveLanguage(saved[UI_LANGUAGE_KEY], browserLanguage);
  } catch { language = resolveLanguage(undefined, browserLanguage); }
  doc.documentElement.lang = language;
  // Translate static text nodes without replacing elements or their event handlers.
  const walker = doc.createTreeWalker(doc.documentElement, 4 /* SHOW_TEXT */);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  for (const node of nodes) {
    if (node.parentElement?.closest('script, style, .preview, [translate="no"]')) continue;
    node.data = t(node.data);
  }
  const control = doc.createElement('label');
  control.style.cssText = 'display:flex;align-items:center;gap:12px;margin:12px 0;font:14px Arial,sans-serif';
  control.append('界面语言 / Interface language');
  const select = doc.createElement('select');
  select.id = 'ui-language';
  select.style.cssText = 'width:auto;padding:6px;font:14px Arial,sans-serif';
  for (const [value, label] of [['zh-CN', '简体中文'], ['en', 'English']]) {
    const option = doc.createElement('option');
    option.value = value!;
    option.textContent = label!;
    select.append(option);
  }
  select.value = language;
  control.append(select);
  const error = doc.createElement('span');
  error.setAttribute('role', 'status');
  control.append(error);
  doc.querySelector('main')?.prepend(control);
  select.addEventListener('change', async () => {
    select.disabled = true;
    try {
      await storage.set({ [UI_LANGUAGE_KEY]: select.value });
      // Reload only this extension UI; playback and subtitle settings stay intact.
      reload();
    } catch {
      select.value = language;
      select.disabled = false;
      error.textContent = language === 'en' ? 'Unable to save. Try again.' : '保存失败，请重试。';
    }
  });
}
