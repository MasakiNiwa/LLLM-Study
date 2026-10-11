import { describe, expect, it } from 'vitest';
import { pickVoice } from './tts';

const v = (voiceURI: string, lang: string, localService = true, isDefault = false) =>
  ({ voiceURI, lang, localService, default: isDefault, name: voiceURI }) as SpeechSynthesisVoice;

describe('pickVoice', () => {
  const voices = [v('ja', 'ja-JP'), v('en-remote', 'en-US', false), v('en-gb', 'en_GB')];
  it('言語に合う端末内の声を選ぶ', () => {
    expect(pickVoice(voices, 'en')?.voiceURI).toBe('en-gb');
  });
  it('指定の声を優先する', () => {
    expect(pickVoice(voices, 'en', 'en-remote')?.voiceURI).toBe('en-remote');
  });
  it('指定の声でも言語が違えば使わない', () => {
    expect(pickVoice(voices, 'ja', 'en-gb')?.voiceURI).toBe('ja');
  });
  it('無ければ undefined', () => {
    expect(pickVoice(voices, 'fr')).toBeUndefined();
  });
});
