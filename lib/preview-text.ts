// Fixed sample captions, independent of the extension's interface language.
const samples: Record<string, string> = {
  en: 'A new story begins here.', ja: 'ここから新しい物語が始まります。',
  zh: '一个新的故事从这里开始。', 'zh-Hant': '一個新的故事從這裡開始。',
  ko: '새로운 이야기가 여기서 시작됩니다.', es: 'Aquí comienza una nueva historia.',
  fr: 'Une nouvelle histoire commence ici.', de: 'Hier beginnt eine neue Geschichte.',
  it: 'Una nuova storia inizia qui.', pt: 'Uma nova história começa aqui.',
  ar: 'تبدأ حكاية جديدة هنا.', he: 'סיפור חדש מתחיל כאן.',
  ru: 'Здесь начинается новая история.', uk: 'Тут починається нова історія.',
  pl: 'Tutaj zaczyna się nowa historia.', nl: 'Hier begint een nieuw verhaal.',
  sv: 'En ny berättelse börjar här.', da: 'En ny historie begynder her.',
  no: 'En ny historie begynner her.', nb: 'En ny historie begynner her.',
  fi: 'Uusi tarina alkaa tästä.', cs: 'Zde začíná nový příběh.',
  hr: 'Ovdje počinje nova priča.', hu: 'Itt kezdődik egy új történet.',
  ro: 'O nouă poveste începe aici.', el: 'Μια νέα ιστορία ξεκινά εδώ.',
  tr: 'Burada yeni bir hikâye başlıyor.', th: 'เรื่องราวใหม่เริ่มต้นที่นี่',
  vi: 'Một câu chuyện mới bắt đầu từ đây.', id: 'Sebuah cerita baru dimulai di sini.',
  ms: 'Sebuah kisah baharu bermula di sini.', fil: 'Dito nagsisimula ang isang bagong kuwento.',
  tl: 'Dito nagsisimula ang isang bagong kuwento.', hi: 'एक नई कहानी यहाँ शुरू होती है।',
};

export function previewText(language: string): string | undefined {
  const parts = language.toLowerCase().replaceAll('_', '-').split('-');
  if (parts[0] === 'zh') {
    const traditional = parts.includes('hant') || (!parts.includes('hans') && parts.some(part => ['tw', 'hk', 'mo'].includes(part)));
    return samples[traditional ? 'zh-Hant' : 'zh'];
  }
  return samples[parts[0] ?? ''];
}
