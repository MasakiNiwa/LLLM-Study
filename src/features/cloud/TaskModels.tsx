/**
 * 「応答ごとの AI」: 応答の種類ごとに、使う AI（API キーとモデル）を変える。
 * たとえば、回数の多い「ひとこと」は安いモデルや無料のモデル、解説は賢いモデル、のように分けられる。
 * 選べるのは、各キーのマイモデル（★）と今使っているモデル。決めていない種類は、いつもの AI で答える。
 */
import { SlidersHorizontal } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { CLOUD_PROVIDERS } from '@/lib/cloud/providers';
import type { AiTask } from '@/features/ai/aiBusy';
import { useSettings, type TaskRoute } from '@/features/settings/settingsStore';
import { keyLabel, useCloud } from './cloudStore';

const TASKS: { task: AiTask; label: string; hint: string }[] = [
  {
    task: 'reaction',
    label: 'ひとこと',
    hint: '答えを見たときのリアクション。回数が多いので、安いモデル・無料のモデルがおすすめ',
  },
  {
    task: 'assist',
    label: '解説・例文・判定',
    hint: '学習画面の「AI に聞く」、答えの判定、カードの下書きなど',
  },
  { task: 'chat', label: 'チャット', hint: 'チャット画面の会話' },
  { task: 'practice', label: '会話練習', hint: 'AI 練習の会話練習' },
  { task: 'review', label: '記録のふりかえり', hint: '学習記録のふりかえり' },
];

const DEFAULT = 'default';
const encode = (r: TaskRoute) =>
  r.provider === 'local' ? 'local' : `${r.provider}|${r.model ?? ''}`;

function useOptions() {
  const keys = useCloud((s) => s.keys);
  const cloudModels = useSettings((s) => s.cloudModels);
  const options: { value: string; label: string }[] = [
    { value: DEFAULT, label: 'いつもの AI' },
    { value: 'local', label: '端末内の AI' },
  ];
  for (const k of keys) {
    const models = [...new Set([cloudModels[k.id], ...k.models].filter(Boolean) as string[])];
    for (const m of models)
      options.push({
        value: `${k.id}|${m}`,
        label: `${keyLabel(k)} · ${CLOUD_PROVIDERS[k.provider].shortModel(m)}${k.unlocked ? '' : '（ロック中）'}`,
      });
  }
  return options;
}

function TaskRow({
  task,
  label,
  hint,
  options,
}: (typeof TASKS)[number] & { options: { value: string; label: string }[] }) {
  const route = useSettings((s) => s.taskModels[task]);
  const taskModels = useSettings((s) => s.taskModels);
  const update = useSettings((s) => s.update);
  const value = route ? encode(route) : DEFAULT;
  const all = options.some((o) => o.value === value)
    ? options
    : [...options, { value, label: `${route?.model ?? value}（キーがありません）` }];

  const choose = (v: string) => {
    const copy = { ...taskModels };
    if (v === DEFAULT) delete copy[task];
    else if (v === 'local') copy[task] = { provider: 'local' };
    else {
      const i = v.indexOf('|');
      copy[task] = { provider: v.slice(0, i), model: v.slice(i + 1) };
    }
    update({ taskModels: copy });
  };

  return (
    <li className="flex flex-col gap-1.5 rounded-xl border border-slate-200 p-3 sm:flex-row sm:items-center sm:gap-3 dark:border-slate-700">
      <div className="min-w-0 sm:w-48">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-slate-500 dark:text-slate-400">{hint}</span>
      </div>
      <Select
        value={value}
        onChange={choose}
        options={all}
        aria-label={`${label}に使う AI`}
        className="min-w-0 flex-1"
      />
    </li>
  );
}

export function TaskModels() {
  const any = useCloud((s) => s.keys.length > 0);
  const options = useOptions();
  if (!any) return null;
  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
          <SlidersHorizontal className="size-5" />
        </div>
        <div className="min-w-0">
          <h2 className="font-semibold">応答ごとの AI（任意）</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            応答の種類ごとに、使う API
            キーとモデルを変えられます。たとえば「ひとこと」は安いモデルや無料のモデル、解説は賢いモデルにすると、料金を抑えながら使えます。選べるのは各キーのマイモデル（モデルの一覧で
            ★ を付けたもの）と今使っているモデルです。使えないとき（ロック中など）は、いつもの AI
            で答えます。
          </p>
        </div>
      </div>
      <ul className="space-y-2">
        {TASKS.map((t) => (
          <TaskRow key={t.task} {...t} options={options} />
        ))}
      </ul>
    </Card>
  );
}
