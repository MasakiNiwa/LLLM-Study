/**
 * 教材の言語コード（BCP 47。例: en, ja）を、読み上げ用の言語タグや表示名にする。
 * 教材に言語の指定が無い場合は英語とみなす（サンプル教材の多くが英語のため）。
 */
const SPEECH_TAGS: Record<string, string> = {
  en: 'en-US',
  ja: 'ja-JP',
  zh: 'zh-CN',
  ko: 'ko-KR',
  fr: 'fr-FR',
  de: 'de-DE',
  es: 'es-ES',
  it: 'it-IT',
  pt: 'pt-BR',
};

const NAMES: Record<string, string> = {
  en: '英語',
  ja: '日本語',
  zh: '中国語',
  ko: '韓国語',
  fr: 'フランス語',
  de: 'ドイツ語',
  es: 'スペイン語',
  it: 'イタリア語',
  pt: 'ポルトガル語',
};

function base(code: string | undefined): string {
  return (code ?? 'en').toLowerCase().split(/[-_]/)[0] || 'en';
}

/** 読み上げに使う言語タグ（地域付きの指定はそのまま使う） */
export function speechLang(code: string | undefined): string {
  if (code && /[-_]/.test(code)) return code.replace('_', '-');
  return SPEECH_TAGS[base(code)] ?? code ?? 'en-US';
}

export function languageName(code: string | undefined): string {
  return NAMES[base(code)] ?? code ?? '英語';
}

/**
 * 読み上げる文の文字から言語を補正する。
 * 教材に言語の指定が無く英語とみなした場合でも、かな・ハングルを含む文はその言語で読む。
 */
export function adjustSpeechLang(text: string, lang: string): string {
  if (!lang.toLowerCase().startsWith('en')) return lang;
  if (/[぀-ヿ]/.test(text)) return 'ja-JP';
  if (/[가-힯]/.test(text)) return 'ko-KR';
  // 漢字だけの文は日本語として読む（このアプリの利用者の多くは日本語話者のため）
  if (/[一-鿿]/.test(text)) return 'ja-JP';
  return lang;
}
