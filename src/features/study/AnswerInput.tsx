import { useRef, useState } from 'react';
import { CornerDownLeft } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface AnswerInputProps {
  /** 学ぶ言語で答えるか（英語ならスペルチェック・自動大文字を切る） */
  targetLanguage: boolean;
  /** 学ぶ言語の言語タグ（入力欄の lang 属性） */
  lang?: string;
  /** 穴埋めの空欄の数（2 つ以上なら空欄ごとに入力欄を出す） */
  blanks?: number;
  /** 空欄が 2 つ以上なら、空欄ごとの答えの配列 */
  onSubmit: (answer: string | string[]) => void;
}

/** 入力欄の共通の属性（学ぶ言語のときは自動修正を切る） */
function answerFieldProps(targetLanguage: boolean, lang: string) {
  return {
    autoComplete: 'off',
    autoCapitalize: targetLanguage ? 'none' : undefined,
    autoCorrect: targetLanguage ? 'off' : undefined,
    spellCheck: false,
    lang: targetLanguage ? lang : 'ja',
  } as const;
}

/**
 * 空欄ごとの入力欄（Enter で次の欄へ、最後の欄で答え合わせ）。
 * 答えに「/」が含まれていても区切りと混ざらない。
 */
export function BlankFields({
  count,
  values,
  onChange,
  onDone,
  targetLanguage,
  lang,
  className,
  autoFocusFirst,
  autoFocus,
}: {
  count: number;
  values: string[];
  onChange: (values: string[]) => void;
  onDone: () => void;
  targetLanguage: boolean;
  lang: string;
  className: string;
  /** シートの中で使うとき: 開いたら最初の欄にフォーカスする目印を付ける */
  autoFocusFirst?: boolean;
  /** その場ですぐに最初の欄にフォーカスする */
  autoFocus?: boolean;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  return (
    <div className="space-y-2">
      {Array.from({ length: count }, (_, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          value={values[i] ?? ''}
          onChange={(e) => {
            const next = [...values];
            next[i] = e.target.value;
            onChange(next);
          }}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
            e.preventDefault();
            if (i < count - 1) refs.current[i + 1]?.focus();
            else onDone();
          }}
          {...(i === 0 && autoFocusFirst ? { 'data-autofocus': '' } : {})}
          autoFocus={i === 0 && autoFocus}
          {...answerFieldProps(targetLanguage, lang)}
          enterKeyHint={i < count - 1 ? 'next' : 'done'}
          aria-label={`空欄 ${i + 1} の答え`}
          placeholder={`空欄 ${i + 1}`}
          className={className}
        />
      ))}
    </div>
  );
}

const FIELD_CLASS =
  'h-12 w-full min-w-0 rounded-xl border border-slate-300 bg-white px-4 text-base dark:border-slate-700 dark:bg-slate-950';

/** 答えを入力する欄（Enter で答え合わせ） */
export function AnswerInput({ targetLanguage, lang = 'en', blanks, onSubmit }: AnswerInputProps) {
  const [value, setValue] = useState('');
  const [parts, setParts] = useState<string[]>([]);
  const multi = !!blanks && blanks > 1;
  const submit = () =>
    onSubmit(multi ? Array.from({ length: blanks }, (_, i) => parts[i] ?? '') : value);
  return (
    <form
      className="mx-auto mt-6 flex w-full max-w-md items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="min-w-0 flex-1">
        {multi ? (
          <BlankFields
            count={blanks}
            values={parts}
            onChange={setParts}
            onDone={submit}
            targetLanguage={targetLanguage}
            lang={lang}
            className={FIELD_CLASS}
            autoFocus
          />
        ) : (
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
            {...answerFieldProps(targetLanguage, lang)}
            enterKeyHint="done"
            aria-label="答え"
            placeholder="答えを入力"
            className={FIELD_CLASS}
          />
        )}
      </div>
      <Button type="submit" variant="primary" size="lg" aria-label="答え合わせ">
        <CornerDownLeft />
      </Button>
    </form>
  );
}
