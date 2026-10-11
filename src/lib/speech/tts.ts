import { adjustSpeechLang } from './lang';

/**
 * 読み上げ（ブラウザ標準の Web Speech API）。端末の音声を使うのでオフラインでも動くことが多い。
 */

export function isSpeechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

let voicesPromise: Promise<SpeechSynthesisVoice[]> | null = null;

/** 利用できる声の一覧（読み込みが非同期のブラウザがあるので待つ） */
export function getVoices(): Promise<SpeechSynthesisVoice[]> {
  if (!isSpeechSupported()) return Promise.resolve([]);
  voicesPromise ??= new Promise((resolve) => {
    const list = speechSynthesis.getVoices();
    if (list.length) return resolve(list);
    const done = () => resolve(speechSynthesis.getVoices());
    speechSynthesis.addEventListener('voiceschanged', done, { once: true });
    setTimeout(done, 1500);
  });
  return voicesPromise;
}

/** 言語（BCP 47）に合う声。指定の voiceURI があればそれを優先する */
export function pickVoice(
  voices: SpeechSynthesisVoice[],
  lang: string,
  voiceURI?: string,
): SpeechSynthesisVoice | undefined {
  const base = lang.toLowerCase().split('-')[0];
  if (voiceURI) {
    // 指定の声でも、読む言語と違う言語の声なら使わない
    const v = voices.find((x) => x.voiceURI === voiceURI);
    if (v && v.lang.toLowerCase().split(/[-_]/)[0] === base) return v;
  }
  const candidates = voices.filter((v) => v.lang.toLowerCase().split(/[-_]/)[0] === base);
  return (
    candidates.find((v) => v.localService && v.default) ??
    candidates.find((v) => v.localService) ??
    candidates[0]
  );
}

export async function speak(
  text: string,
  options: { lang?: string; rate?: number; voiceURI?: string } = {},
): Promise<void> {
  if (!isSpeechSupported() || !text.trim()) return;
  const lang = adjustSpeechLang(text, options.lang ?? 'en-US');
  const voice = pickVoice(await getVoices(), lang, options.voiceURI);
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = voice?.lang ?? lang;
  if (voice) u.voice = voice;
  u.rate = options.rate ?? 1;
  speechSynthesis.speak(u);
}

export function stopSpeaking(): void {
  if (isSpeechSupported()) speechSynthesis.cancel();
}
