import { useMemo, useState, type ReactNode } from 'react';
import { Copy, FileDown, FileJson, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Section } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Switch } from '@/components/ui/Switch';
import { ITEM_TYPES, packJsonSchema, type ItemType } from '@/lib/packs/schema';
import {
  AMOUNT_LABELS,
  buildMaterialPrompt,
  buildSpecMarkdown,
  ITEM_TYPE_GUIDES,
  type MaterialAmount,
} from '@/lib/packs/spec';
import { ITEM_TYPE_LABELS } from '@/lib/packs/templates';
import { copyText, downloadText } from '@/lib/utils/download';
import { cn } from '@/lib/utils/cn';

const inputClass =
  'h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950';

/** 分野の候補（任意。語学のときだけ「学ぶ言語」を聞く） */
const SUBJECTS = [
  '語学',
  '資格・検定',
  '学校の勉強',
  '仕事・実務',
  '教養',
  'プログラミング',
] as const;
const LANGUAGE_SUBJECT = '語学';

interface Preset {
  label: string;
  topic: string;
  subject: (typeof SUBJECTS)[number];
  level: string;
  types: ItemType[];
}

const PRESETS: Preset[] = [
  {
    label: 'TOEIC 頻出単語',
    topic: 'TOEIC によく出る単語',
    subject: '語学',
    level: 'TOEIC 600 点',
    types: ['vocab'],
  },
  {
    label: '旅行英会話',
    topic: '海外旅行で使う英会話フレーズ（空港・ホテル・レストラン）',
    subject: '語学',
    level: '初級',
    types: ['phrase'],
  },
  {
    label: '簿記 3 級',
    topic: '日商簿記 3 級の仕訳と勘定科目',
    subject: '資格・検定',
    level: '簿記 3 級',
    types: [],
  },
  {
    label: 'IT パスポート',
    topic: 'IT パスポート試験の頻出用語',
    subject: '資格・検定',
    level: '入門',
    types: [],
  },
  {
    label: '日本史の流れ',
    topic: '日本史の主な出来事と人物（古代〜近代）',
    subject: '学校の勉強',
    level: '中学〜高校',
    types: [],
  },
  {
    label: 'JavaScript 基礎',
    topic: 'JavaScript の基本文法と組み込み関数',
    subject: 'プログラミング',
    level: '入門',
    types: [],
  },
];

function Chip({
  active,
  onClick,
  children,
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      title={title}
      className={cn(
        'rounded-xl border px-3 py-1.5 text-sm transition-colors',
        active
          ? 'border-accent-500 bg-accent-50 text-accent-800 dark:bg-accent-900/30 dark:text-accent-200'
          : 'border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800',
      )}
    >
      {children}
    </button>
  );
}

/**
 * 外部の高性能 AI（ChatGPT / Claude / Gemini など）に教材を作ってもらうためのプロンプトを組み立てる。
 * 仕様はアプリの zod スキーマから作るので、渡した形式どおりの JSON がそのまま取り込める。
 * 細かい数や種類は「おまかせ」にして、テーマに合わせて外部 AI に決めてもらえる。
 */
export function PromptBuilder({ onGoImport }: { onGoImport: () => void }) {
  const [topic, setTopic] = useState('');
  const [subject, setSubject] = useState<string>('');
  const [level, setLevel] = useState('');
  const [amount, setAmount] = useState<MaterialAmount>('auto');
  const [types, setTypes] = useState<ItemType[]>([]);
  const [targetLang, setTargetLang] = useState('英語（en）');
  const [explanationLang, setExplanationLang] = useState('日本語（ja）');
  const [extra, setExtra] = useState('');
  const [withSchema, setWithSchema] = useState(false);

  // 学ぶ言語は、語学の教材（分野が語学、または単語・フレーズを選んだ）のときだけ聞く
  const isLanguage =
    subject === LANGUAGE_SUBJECT || types.some((t) => t === 'vocab' || t === 'phrase');

  const prompt = useMemo(
    () =>
      buildMaterialPrompt(
        {
          topic,
          subject,
          level,
          amount,
          types,
          targetLang: isLanguage ? targetLang : undefined,
          explanationLang,
          extra,
        },
        { schema: withSchema },
      ),
    [
      topic,
      subject,
      level,
      amount,
      types,
      isLanguage,
      targetLang,
      explanationLang,
      extra,
      withSchema,
    ],
  );

  const toggleType = (t: ItemType) =>
    setTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  return (
    <div className="space-y-4">
      <Section
        title="AI に教材を作ってもらう"
        icon={<Wand2 />}
        description="テーマを入れてプロンプトをコピーし、ChatGPT・Claude・Gemini などに貼り付けます。返ってきた JSON を「取り込む」に貼り付ければ完了です。語学以外の教材も作れます。"
      >
        <div className="flex flex-wrap gap-2 px-4 py-3 sm:px-5">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => {
                setTopic(p.topic);
                setSubject(p.subject);
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
            placeholder="例: 簿記の勘定科目、世界の首都、統計の基本用語、料理の英単語…"
            className={inputClass}
          />
        </Field>
        <Field label="分野（任意）" stacked>
          <div className="flex flex-wrap gap-2">
            {SUBJECTS.map((s) => (
              <Chip
                key={s}
                active={subject === s}
                onClick={() => setSubject(subject === s ? '' : s)}
              >
                {s}
              </Chip>
            ))}
          </div>
        </Field>
        <Field label="レベル（任意）" htmlFor="pb-level" stacked>
          <input
            id="pb-level"
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            placeholder="例: 入門、中学、3 級、実務レベル"
            className={inputClass}
          />
        </Field>
        <Field label="量" stacked hint="細かい数はテーマに合わせて外部 AI が決めます">
          <div className="flex flex-wrap gap-2">
            {(Object.keys(AMOUNT_LABELS) as MaterialAmount[]).map((a) => (
              <Chip key={a} active={amount === a} onClick={() => setAmount(a)}>
                {AMOUNT_LABELS[a]}
              </Chip>
            ))}
          </div>
        </Field>
        <Field
          label="項目の種類"
          stacked
          hint="おまかせなら、テーマに合う種類を外部 AI が選びます（組み合わせることもあります）"
        >
          <div className="flex flex-wrap gap-2">
            <Chip active={types.length === 0} onClick={() => setTypes([])}>
              おまかせ
            </Chip>
            {ITEM_TYPES.map((t) => (
              <Chip
                key={t}
                active={types.includes(t)}
                onClick={() => toggleType(t)}
                title={ITEM_TYPE_GUIDES[t]}
              >
                {ITEM_TYPE_LABELS[t]}
              </Chip>
            ))}
          </div>
        </Field>
        <div className={cn('grid', isLanguage && 'sm:grid-cols-2')}>
          {isLanguage && (
            <Field label="学ぶ言語" htmlFor="pb-target" stacked>
              <input
                id="pb-target"
                value={targetLang}
                onChange={(e) => setTargetLang(e.target.value)}
                className={inputClass}
              />
            </Field>
          )}
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
            placeholder="例: 実務でよく使うものを優先して、解説には間違えやすいポイントを入れて"
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
