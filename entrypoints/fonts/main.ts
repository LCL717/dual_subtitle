import { browser } from 'wxt/browser';
import { FONT_LIST_KEY, normalizeFontList, readLocalFonts, fontLabel, fontStack } from '../../lib/fonts';
import './style.css';
import { initializeLanguage, t } from '../../lib/ui-language';

async function main() {
  await initializeLanguage(browser.storage.local);

  const scan = document.getElementById('scan') as HTMLButtonElement;
  const clear = document.getElementById('clear') as HTMLButtonElement;
  const status = document.getElementById('status')!;
  const list = document.getElementById('fonts')!;
  let version = 0;
  function show(names: string[]) {
    list.replaceChildren(...names.map(name => {
      const item = document.createElement('li');
      item.textContent = fontLabel(name);
      item.style.fontFamily = fontStack(name);
      return item;
    }));
  }
  void browser.storage.local.get(FONT_LIST_KEY).then(saved => {
    if (version !== 0) return;
    const names = normalizeFontList(saved[FONT_LIST_KEY]); show(names);
    if (names.length) status.textContent = t(`已保存 ${names.length} 个字体家族，可点击更新。`);
  }).catch(() => { if (version === 0) status.textContent = t('无法读取已保存列表，可以重新扫描。'); });
  scan.addEventListener('click', async () => {
    version++; scan.disabled = true; clear.disabled = true;
    status.textContent = t('正在请求字体权限并读取列表…');
    try {
      const names = await readLocalFonts(window as Window & { queryLocalFonts?: () => Promise<{ family: string }[]> });
      if (!names.length) { status.textContent = t('浏览器未返回字体，保留原列表；可以使用系统备用字体。'); return; }
      await browser.storage.local.set({ [FONT_LIST_KEY]: names });
      show(names); status.textContent = t(`已读取并保存 ${names.length} 个字体家族。请回到 Netflix 扩展弹窗选择字体。`);
    } catch (error) { status.textContent = t(error instanceof Error ? error.message : '字体列表保存失败，请重试。'); }
    finally { scan.disabled = false; clear.disabled = false; }
  });
  clear.addEventListener('click', async () => {
    version++; scan.disabled = true; clear.disabled = true;
    try { await browser.storage.local.remove(FONT_LIST_KEY); show([]); status.textContent = t('已清除列表，可重新读取。'); }
    catch { status.textContent = t('清除失败，请重试。'); }
    finally { scan.disabled = false; clear.disabled = false; }
  });

}
void main();
