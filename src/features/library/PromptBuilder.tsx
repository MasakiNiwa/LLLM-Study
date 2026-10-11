import { useMemo, useState } from 'react';
import { Copy, FileDown, FileJson, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Section } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Switch } from '@/components/ui/Switch';
import { ITEM_TYPES, packJsonSchema, type ItemType } from '@/lib/packs/schema';
import { buildMaterialPrompt, buildSpecMarkdown, ITEM_TYPE_GUIDES } from '@/lib/packs/spec';
import { ITEM_TYPE_LABELS } from '@/lib/packs/templates';
import { copyText, downloadText } from '@/lib/utils/download';
import { cn } from '@/lib/utils/cn';

const inputClass =
  'h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950';

const PRESETS: { label: string; topic: string; level: string; types: ItemType[] }[] = [
  {
    label: 'TOEIC 頻出単語',
    topic: 'TOEIC によく出る単語',
    level: 'TOEIC 600 点',
    types: ['vocab'],
  },
  {
    label: '旅行英会話',
    topic: '海外旅行で使う英会話フレーズ（空港・ホテル・レストラン）',
    level: '初級',
    types: ['phrase'],
  },
  {
    label: 'ビジネスメール',
    topic: 'ビジネスメールでよく使う英語表現',
    level: '中級',
    types: ['phrase', 'cloze'],
  },
  { label: '英文法の確認', topic: '中学で習う英文法', level: '中学', types: ['cloze', 'choice'] },
];

/**
 * 外部の高性能 AI（ChatGPT / Claude / Gemini など）に教材を作ってもらうためのプロンプトを組み立てる。
 * 仕様はアプリの zod スキーマから作るので、渡した形式どおりの JSON がそのまま取り込める。
 */
export function PromptBuilder({ onGoImport }: { onGoImport: () => void }) {
  const [topic, setTopic] = useState('');
  const [level, setLevel] = useState('');
  const [count, setCount] = useState(30);
  const [types, setTypes] = useState<ItemType[]>(['vocab']);
  const [targetLang, setTargetLang] = useState('英語（en）');
  const [explanationLang, setExplanationLang] = useState('日本語（ja）');
  const [extra, setExtra] = useState('');
  const [withSchema, setWithSchema] = useState(false);

  const prompt = useMemo(
    () =>
      buildMaterialPrompt(
        { topic, level, count, types, targetLang, explanationLang, extra },
        { schema: withSchema },
      ),
    [topic, level, count, types, targetLang, explanationLang, extra, withSchema],
  );

  const toggleType = (t: ItemType) =>
    setTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  return (
    <div className="space-y-4">
      <Section
        title="AI に教材を作ってもらう"
        icon={<Wand2 />}
        description="条件を入れてプロンプトをコピーし、ChatGPT・Claude・Gemini などに貼り付けます。返ってきた JSON を「取り込む」に貼り付ければ完了です。"
      >
        <div className="flex flex-wrap gap-2 px-4 py-3 sm:px-5">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => {
                setTopic(p.topic);
                setLevel(p.level);
                setTypes(p.types);
              }}
              className="rounded-full border border-slate-300 px-3 py-1 text-xs hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              {p.label}
            </button>
          ))}
        </div>
        <Field label="テーマ" htmlFor="pb-topic" stacked>
          <input
            id="pb-topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="例: 料理に関する英単語、IT 用語、日本史の年号…"
            className={inputClass}
          />
        </Field>
        <div className="grid sm:grid-cols-2">
          <Field label="レベル" htmlFor="pb-level" stacked>
            <input
              id="pb-level"
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              placeholder="例: 中学、CEFR B1、TOEIC 700"
              className={inputClass}
            />
          </Field>
          <Field label="項目数" htmlFor="pb-count" stacked>
            <input
              id="pb-count"
              type="number"
              min={1}
              max={300}
              value={count}
              onChange={(e) => setCount(Math.max(1, Math.min(300, Number(e.target.value) || 1)))}
              className={inputClass}
            />
          </Field>
        </div>
        <Field
          label="項目の種類"
          stacked
          hint="複数選べます。単語帳以外の教材（一問一答・穴埋め・選択問題）も作れます"
        >
          <div className="flex flex-wrap gap-2">
            {ITEM_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={types.includes(t)}
                onClick={() => toggleType(t)}
                title={ITEM_TYPE_GUIDES[t]}
                className={cn(
                  'rounded-xl border px-3 py-1.5 text-sm transition-colors',
                  types.includes(t)
                    ? 'border-accent-500 bg-accent-50 text-accent-800 dark:bg-accent-900/30 dark:text-accent-200'
                    : 'border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800',
                )}
              >
                {ITEM_TYPE_LABELS[t]}
              </button>
            ))}
          </div>
        </Field>
        <div className="grid sm:grid-cols-2">
          <Field label="学ぶ言語" htmlFor="pb-target" stacked>
            <input
              id="pb-target"
              value={targetLang}
              onChange={(e) => setTargetLang(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="説明の言語" htmlFor="pb-expl" stacked>
            <input
              id="pb-expl"
              value={explanationLang}
              onChange={(e) => setExplanationLang(e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>
        <Field label="そのほかの要望（任意）" htmlFor="pb-extra" stacked>
          <textarea
            id="pb-extra"
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
            rows={2}
            placeholder="例: 例文はビジネスの場面で、語源の説明を notes に入れて"
            className="w-full rounded-xl border border-slate-300 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-950"
          />
        </Field>
        <Field
          label="JSON Schema も含める"
          hint="形式の厳密な定義を付けます（長くなりますが、形式の間違いが減ります）"
        >
          <Switch checked={withSchema} onChange={setWithSchema} label="JSON Schema も含める" />
        </Field>
      </Section>

      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            onClick={async () => {
              if (await copyText(prompt))
                toast.success('プロンプトをコピーしました', {
                  description: '外部の AI に貼り付けてください',
                });
              else toast.error('コピーできませんでした');
            }}
          >
            <Copy />
            プロンプトをコピー
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              downloadText('lllm-study-pack-spec.md', buildSpecMarkdown(), 'text/markdown')
            }
          >
            <FileDown />
            仕様書（.md）
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              downloadText(
                'study-pack.v1.schema.json',
                JSON.stringify(packJsonSchema(), null, 2),
                'application/json',
              )
            }
          >
            <FileJson />
            JSON Schema
          </Button>
          <Button variant="ghost" onClick={onGoImport}>
            JSON を取り込む →
          </Button>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          仕様書ファイルを AI に添付して「この形式で〇〇の教材を作って」と頼む方法もあります。
        </p>
        <details className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
            プロンプトのプレビュー
          </summary>
          <pre className="max-h-96 overflow-auto border-t border-slate-100 p-4 text-xs leading-relaxed whitespace-pre-wrap dark:border-slate-800">
            {prompt}
          </pre>
        </details>
      </div>
    </div>
  );
}
