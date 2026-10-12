import { useState } from 'react';
import { CheckCheck } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useSheetClose } from '@/components/ui/sheetContext';
import { Button } from '@/components/ui/Button';
import type { StudyItem } from '@/lib/packs/schema';
import { answersInTargetLanguage, clozeAnswers } from '@/lib/packs/itemText';

/** 何を書けばよいか（カードの種類と出題のしかたごと） */
function answerHint(item: StudyItem, template: string): string {
  switch (item.type) {
    case 'vocab':
    case 'phrase':
      if (template === 'listen') return '聞こえた語句を書いてください';
      if (template === 'recall')
        return item.type === 'vocab' ? '単語を書いてください' : 'フレーズを書いてください';
      return '意味を書いてください';
    case 'cloze': {
      const n = clozeAnswers(item.text).length;
      return n > 1
        ? `空欄に入る語句を書いてください（${n} つは / で区切る）`
        : '空欄に入る語句を書いてください';
    }
    default:
      return '答えを書いてください';
  }
}

/** 問題の要点（シートで隠れても何を聞かれているか分かるように。答えが分かるものは出さない） */
function questionText(item: StudyItem, template: string): string | undefined {
  switch (item.type) {
    case 'qa':
      return item.question;
    case 'cloze':
      return item.text.replace(/\{\{[^{}]+\}\}/g, '＿＿');
    case 'vocab':
      return template === 'recognize'
        ? item.term
        : template === 'recall'
          ? item.meanings.join('、')
          : undefined;
    case 'phrase':
      return template === 'recognize'
        ? item.phrase
        : template === 'recall'
          ? item.meaning
          : undefined;
    default:
      return undefined;
  }
}

function AnswerForm({
  item,
  template,
  lang,
  onSubmit,
}: {
  item: StudyItem;
  template: string;
  lang: string;
  onSubmit: (text: string) => void;
}) {
  const [text, setText] = useState('');
  const close = useSheetClose();
  const submit = () => {
    // 先に答え合わせして、シートが下へ閉じるあいだに答えを見せる
    onSubmit(text);
    close();
  };
  const target = answersInTargetLanguage(item, template);
  // 一問一答や意味は長くなることがあるので複数行、単語・空欄は 1 行（Enter で答え合わせ）
  const multiline = item.type === 'qa' || !target;
  const question = questionText(item, template);
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {question && (
        <p className="line-clamp-3 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:bg-slate-800/50 dark:text-slate-300">
          {question}
        </p>
      )}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          // 1 行の答えは Enter で、複数行は Ctrl/⌘ + Enter で答え合わせ
          if (
            e.key === 'Enter' &&
            !e.nativeEvent.isComposing &&
            (!multiline || e.ctrlKey || e.metaKey)
          ) {
            e.preventDefault();
            submit();
          }
        }}
        data-autofocus=""
        rows={multiline ? 3 : 1}
        autoComplete="off"
        autoCapitalize={target ? 'none' : undefined}
        autoCorrect={target ? 'off' : undefined}
        spellCheck={false}
        lang={target ? lang : 'ja'}
        enterKeyHint={multiline ? 'enter' : 'done'}
        aria-label="自分の答え"
        placeholder={answerHint(item, template)}
        className="w-full resize-none rounded-xl border border-slate-300 bg-white px-4 py-3 text-base dark:border-slate-700 dark:bg-slate-950"
      />
      <Button type="submit" variant="primary" size="lg" className="w-full">
        <CheckCheck />
        答え合わせする
      </Button>
      <p className="text-center text-xs text-slate-500 dark:text-slate-400">
        書いた答えと正解を並べて表示します。AI を使っているときは、AI
        のひとことや解説にも書いた答えを伝えます
      </p>
    </form>
  );
}

/**
 * 自分の答えを書く欄（ボトムシート）。
 * 書いた答えはプログラムで答え合わせし（できる種類なら）、答えと並べて表示する。
 */
export function AnswerSheet({
  open,
  onClose,
  item,
  template,
  lang,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  item: StudyItem;
  template: string;
  lang: string;
  onSubmit: (text: string) => void;
}) {
  return (
    <BottomSheet open={open} onClose={onClose} title="自分の答えを書く">
      <AnswerForm item={item} template={template} lang={lang} onSubmit={onSubmit} />
    </BottomSheet>
  );
}
