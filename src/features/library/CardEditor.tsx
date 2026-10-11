import { useState, type ReactNode } from 'react';
import { Loader2, Sparkles, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Tabs } from '@/components/ui/Tabs';
import type { StudyItem } from '@/lib/packs/schema';
import {
  addUserItem,
  deleteUserItem,
  updateUserItem,
  type UserItemDraft,
} from '@/lib/packs/userPack';
import { errorMessage } from '@/lib/utils/format';
import { useAiBusy } from '@/features/ai/aiBusy';
import { draftPrompt, parseDraft, type DraftType } from '@/features/ai/draft';
import { runOneshot } from '@/features/ai/oneshot';
import { useEngine } from '@/features/engine/engineStore';
import { useLibrary } from './libraryStore';

/** フォームの値（どの種類でも同じ形で持ち、保存時に項目へ変換する） */
interface Form {
  type: DraftType;
  head: string;
  reading: string;
  pos: string;
  meanings: string;
  situation: string;
  answer: string;
  explanation: string;
  example: string;
  exampleTranslation: string;
  notes: string;
}

const EMPTY: Form = {
  type: 'vocab',
  head: '',
  reading: '',
  pos: '',
  meanings: '',
  situation: '',
  answer: '',
  explanation: '',
  example: '',
  exampleTranslation: '',
  notes: '',
};

const TYPE_TABS = [
  { value: 'vocab' as const, label: '単語' },
  { value: 'phrase' as const, label: 'フレーズ' },
  { value: 'qa' as const, label: '一問一答' },
];

function fromItem(item: UserItemDraft | StudyItem): Form {
  const f = { ...EMPTY };
  const ex = 'examples' in item ? item.examples?.[0] : undefined;
  f.example = ex?.text ?? '';
  f.exampleTranslation = ex?.translation ?? '';
  f.notes = item.notes ?? '';
  if (item.type === 'vocab') {
    Object.assign(f, {
      type: 'vocab',
      head: item.term,
      reading: item.reading ?? '',
      pos: item.pos ?? '',
      meanings: item.meanings.join('\n'),
    });
  } else if (item.type === 'phrase') {
    Object.assign(f, {
      type: 'phrase',
      head: item.phrase,
      meanings: item.meaning,
      situation: item.situation ?? '',
    });
  } else if (item.type === 'qa') {
    Object.assign(f, {
      type: 'qa',
      head: item.question,
      answer: item.answer,
      explanation: item.explanation ?? '',
    });
  }
  return f;
}

function opt(s: string): string | undefined {
  return s.trim() || undefined;
}

function toDraft(f: Form): UserItemDraft {
  const examples = f.example.trim()
    ? [{ text: f.example.trim(), translation: opt(f.exampleTranslation) }]
    : undefined;
  const notes = opt(f.notes);
  switch (f.type) {
    case 'vocab':
      return {
        type: 'vocab',
        term: f.head.trim(),
        reading: opt(f.reading),
        pos: opt(f.pos),
        meanings: f.meanings
          .split(/\n|、|,/)
          .map((m) => m.trim())
          .filter(Boolean),
        examples,
        notes,
      };
    case 'phrase':
      return {
        type: 'phrase',
        phrase: f.head.trim(),
        meaning: f.meanings.trim(),
        situation: opt(f.situation),
        examples,
        notes,
      };
    case 'qa':
      return {
        type: 'qa',
        question: f.head.trim(),
        answer: f.answer.trim(),
        explanation: opt(f.explanation),
        notes,
      };
  }
}

const inputClass =
  'w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950';

function Row({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

interface CardEditorProps {
  open: boolean;
  /** 編集する項目（無ければ新規作成） */
  editing?: StudyItem | null;
  onClose: () => void;
}

/** マイカードの作成・編集。AI に下書きしてもらうこともできる */
export function CardEditor({ open, editing, onClose }: CardEditorProps) {
  return (
    <Dialog open={open} title={editing ? 'カードを編集' : 'カードを作る'} onClose={onClose}>
      {open && (
        <EditorBody key={editing?.id ?? 'new'} editing={editing ?? null} onClose={onClose} />
      )}
    </Dialog>
  );
}

function EditorBody({ editing, onClose }: { editing: StudyItem | null; onClose: () => void }) {
  const [form, setForm] = useState<Form>(() => (editing ? fromItem(editing) : EMPTY));
  const [saving, setSaving] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const ready = useEngine((s) => s.status === 'ready');
  const busy = useAiBusy((s) => s.task !== null);
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));

  const headLabel = { vocab: '単語', phrase: 'フレーズ', qa: '問題' }[form.type];
  const valid =
    form.head.trim() !== '' &&
    (form.type === 'qa' ? form.answer.trim() !== '' : form.meanings.trim() !== '');

  const save = async () => {
    setSaving(true);
    try {
      const draft = toDraft(form);
      if (editing) await updateUserItem(editing.id, draft);
      else await addUserItem(draft);
      toast.success(editing ? 'カードを更新しました' : 'マイカードに追加しました');
      void useLibrary.getState().refresh();
      onClose();
    } catch (e) {
      toast.error('保存できませんでした', { description: errorMessage(e) });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!editing) return;
    try {
      await deleteUserItem(editing.id);
      toast.success('カードを削除しました');
      void useLibrary.getState().refresh();
      onClose();
    } catch (e) {
      toast.error('削除できませんでした', { description: errorMessage(e) });
    }
  };

  const draftWithAi = async () => {
    setDrafting(true);
    try {
      const r = await runOneshot({
        task: 'assist',
        prompt: draftPrompt(form.type, form.head.trim()),
        plain: true,
      });
      const draft = parseDraft(r.text, form.type);
      if (!draft) throw new Error('AI の下書きを読み取れませんでした。もう一度試してください');
      // 入力済みの見出しは残し、空の欄だけ埋める
      const filled = fromItem(draft);
      setForm((f) => {
        const next = { ...f };
        for (const k of Object.keys(filled) as (keyof Form)[]) {
          if (k !== 'type' && !String(f[k]).trim()) (next[k] as string) = filled[k];
        }
        return next;
      });
      toast.success('AI が下書きしました。内容を確認してから保存してください');
    } catch (e) {
      toast.error('下書きできませんでした', { description: errorMessage(e) });
    } finally {
      setDrafting(false);
    }
  };

  return (
    <div className="space-y-4">
      {!editing && <Tabs value={form.type} items={TYPE_TABS} onChange={(type) => set({ type })} />}
      <Row label={headLabel}>
        {form.type === 'qa' ? (
          <textarea
            rows={2}
            value={form.head}
            onChange={(e) => set({ head: e.target.value })}
            className={inputClass}
          />
        ) : (
          <input
            value={form.head}
            onChange={(e) => set({ head: e.target.value })}
            autoCapitalize="none"
            spellCheck={false}
            className={inputClass}
          />
        )}
      </Row>
      {ready && (
        <Button
          size="sm"
          variant="secondary"
          disabled={!form.head.trim() || drafting || busy}
          onClick={() => void draftWithAi()}
        >
          {drafting ? <Loader2 className="animate-spin" /> : <Sparkles />}
          AI に下書きしてもらう
        </Button>
      )}
      {form.type === 'vocab' && (
        <div className="grid grid-cols-2 gap-3">
          <Row label="発音・読み（任意）">
            <input
              value={form.reading}
              onChange={(e) => set({ reading: e.target.value })}
              className={inputClass}
            />
          </Row>
          <Row label="品詞（任意）">
            <input
              value={form.pos}
              onChange={(e) => set({ pos: e.target.value })}
              className={inputClass}
            />
          </Row>
        </div>
      )}
      {form.type === 'qa' ? (
        <>
          <Row label="答え">
            <textarea
              rows={2}
              value={form.answer}
              onChange={(e) => set({ answer: e.target.value })}
              className={inputClass}
            />
          </Row>
          <Row label="解説（任意）">
            <textarea
              rows={2}
              value={form.explanation}
              onChange={(e) => set({ explanation: e.target.value })}
              className={inputClass}
            />
          </Row>
        </>
      ) : (
        <>
          <Row label="意味" hint={form.type === 'vocab' ? '複数あるときは改行で区切る' : undefined}>
            <textarea
              rows={form.type === 'vocab' ? 3 : 2}
              value={form.meanings}
              onChange={(e) => set({ meanings: e.target.value })}
              className={inputClass}
            />
          </Row>
          {form.type === 'phrase' && (
            <Row label="使う場面（任意）">
              <input
                value={form.situation}
                onChange={(e) => set({ situation: e.target.value })}
                className={inputClass}
              />
            </Row>
          )}
          <Row label="例文（任意）">
            <input
              value={form.example}
              onChange={(e) => set({ example: e.target.value })}
              autoCapitalize="none"
              className={inputClass}
            />
          </Row>
          <Row label="例文の訳（任意）">
            <input
              value={form.exampleTranslation}
              onChange={(e) => set({ exampleTranslation: e.target.value })}
              className={inputClass}
            />
          </Row>
        </>
      )}
      <Row label="メモ（任意）">
        <textarea
          rows={2}
          value={form.notes}
          onChange={(e) => set({ notes: e.target.value })}
          className={inputClass}
        />
      </Row>
      <div className="flex items-center gap-2 pt-1">
        {editing && (
          <Button variant="ghost" className="text-rose-600" onClick={() => void remove()}>
            <Trash2 />
            削除
          </Button>
        )}
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" onClick={onClose}>
            キャンセル
          </Button>
          <Button variant="primary" disabled={!valid || saving} onClick={() => void save()}>
            {saving && <Loader2 className="animate-spin" />}
            保存
          </Button>
        </div>
      </div>
    </div>
  );
}
