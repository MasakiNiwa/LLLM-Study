import { useState } from 'react';
import { CornerDownLeft } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface AnswerInputProps {
  /** 学ぶ言語で答えるか（英語ならスペルチェック・自動大文字を切る） */
  targetLanguage: boolean;
  blanks?: number;
  onSubmit: (answer: string) => void;
}

/** 答えを入力する欄（Enter で答え合わせ） */
export function AnswerInput({ targetLanguage, blanks, onSubmit }: AnswerInputProps) {
  const [value, setValue] = useState('');
  return (
    <form
      className="mx-auto mt-6 flex w-full max-w-md gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(value);
      }}
    >
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        autoFocus
        autoComplete="off"
        autoCapitalize={targetLanguage ? 'none' : undefined}
        autoCorrect={targetLanguage ? 'off' : undefined}
        spellCheck={false}
        lang={targetLanguage ? 'en' : 'ja'}
        enterKeyHint="done"
        aria-label="答え"
        placeholder={
          blanks && blanks > 1 ? `答えを入力（${blanks} つの空欄は / で区切る）` : '答えを入力'
        }
        className="h-12 min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-4 text-base dark:border-slate-700 dark:bg-slate-950"
      />
      <Button type="submit" variant="primary" size="lg" aria-label="答え合わせ">
        <CornerDownLeft />
      </Button>
    </form>
  );
}
