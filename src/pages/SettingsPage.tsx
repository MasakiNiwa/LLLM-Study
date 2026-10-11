import { useEffect, useRef, useState } from 'react';
import {
  Bot,
  Brain,
  Database,
  Gauge,
  GraduationCap,
  HardDrive,
  Palette,
  RotateCcw,
  Volume2,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageBody, PageHeader } from '@/app/PageHeader';
import { Button } from '@/components/ui/Button';
import { Section } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Field } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import { Slider } from '@/components/ui/Slider';
import { Switch } from '@/components/ui/Switch';
import { clearAllData, clearAllProgress, exportBackup, restoreBackup } from '@/lib/db/backup';
import { deleteAllStoredModels, isOpfsSupported } from '@/lib/llm/modelStorage';
import { getVoices, isSpeechSupported, speak } from '@/lib/speech/tts';
import { downloadText } from '@/lib/utils/download';
import { cn } from '@/lib/utils/cn';
import { errorMessage, formatBytes } from '@/lib/utils/format';
import { CUSTOM_PERSONA_ID, PERSONAS } from '@/features/ai/personas';
import { useChat } from '@/features/chat/chatStore';
import { useEngine } from '@/features/engine/engineStore';
import { useLibrary } from '@/features/library/libraryStore';
import {
  BACKEND_SETTING_LABELS,
  NEW_CARD_ORDER_LABELS,
  REACTION_LABELS,
  THEME_LABELS,
} from '@/features/settings/labels';
import {
  useSettings,
  type BackendSetting,
  type NewCardOrder,
  type ReactionMode,
  type ThemeSetting,
} from '@/features/settings/settingsStore';
import { useStudy } from '@/features/study/studyStore';

const CONTEXT_OPTIONS = [2048, 4096, 8192, 16384, 32768].map((n) => ({
  value: String(n),
  label: `${n.toLocaleString()} トークン`,
}));

const numberInput =
  'h-10 w-24 shrink-0 rounded-xl border border-slate-300 bg-white px-3 text-right text-sm tabular-nums dark:border-slate-700 dark:bg-slate-900';

function StorageUsage() {
  const [est, setEst] = useState<{ usage: number; quota: number } | null>(null);
  const storedModels = useEngine((s) => s.storedModels);
  useEffect(() => {
    void navigator.storage
      ?.estimate?.()
      .then((e) => setEst({ usage: e.usage ?? 0, quota: e.quota ?? 0 }));
  }, [storedModels]);
  if (!est) return <span className="text-sm text-slate-500">-</span>;
  return (
    <span className="font-mono text-sm tabular-nums">
      {formatBytes(est.usage)} / {formatBytes(est.quota)}
    </span>
  );
}

function VoiceSelect() {
  const voice = useSettings((s) => s.speechVoice);
  const update = useSettings((s) => s.update);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    void getVoices().then((v) => setVoices(v.filter((x) => /^en/i.test(x.lang))));
  }, []);
  return (
    <Select
      id="voice"
      value={voice}
      onChange={(v) => update({ speechVoice: v })}
      options={[
        { value: '', label: '自動' },
        ...voices.map((v) => ({ value: v.voiceURI, label: `${v.name}（${v.lang}）` })),
      ]}
      className="w-44 sm:w-56"
    />
  );
}

function NumberField({
  id,
  value,
  min,
  max,
  onChange,
}: {
  id: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <input
      id={id}
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      value={value}
      onChange={(e) => {
        const n = Number(e.target.value);
        if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, Math.round(n))));
      }}
      className={numberInput}
    />
  );
}

type ConfirmKind = null | 'models' | 'reset' | 'progress' | 'all' | 'restore';

export default function SettingsPage() {
  const s = useSettings();
  const update = s.update;
  const unload = useEngine((st) => st.unload);
  const refreshStored = useEngine((st) => st.refreshStoredModels);
  const storedCount = useEngine((st) => st.storedModels.length);
  const webgpu = useEngine((st) => st.webgpu);
  const [confirm, setConfirm] = useState<ConfirmKind>(null);
  const restoreText = useRef<string | null>(null);
  const restoreInput = useRef<HTMLInputElement>(null);

  const afterDataChange = () => {
    useStudy.getState().end();
    void useLibrary.getState().refresh();
  };

  const deleteModels = async () => {
    try {
      await unload();
      await deleteAllStoredModels();
      update({ lastModelName: null });
      toast.success('保存済みモデルをすべて削除しました');
    } catch (e) {
      toast.error('削除に失敗しました', { description: errorMessage(e) });
    }
    void refreshStored();
  };

  const backup = async () => {
    try {
      const data = await exportBackup();
      const date = data.exportedAt.slice(0, 10);
      downloadText(`lllm-study-backup-${date}.json`, JSON.stringify(data), 'application/json');
      toast.success('バックアップを書き出しました');
    } catch (e) {
      toast.error('書き出しに失敗しました', { description: errorMessage(e) });
    }
  };

  const restore = async () => {
    const text = restoreText.current;
    restoreText.current = null;
    if (!text) return;
    try {
      const r = await restoreBackup(text);
      await useChat.getState().clear();
      afterDataChange();
      toast.success('バックアップから復元しました', {
        description: `教材 ${r.packs} 件・学習記録 ${r.reviews} 件`,
      });
    } catch (e) {
      toast.error('復元できませんでした', { description: errorMessage(e) });
    }
  };

  return (
    <>
      <PageHeader title="設定" />
      <PageBody>
        <Section
          title="学習"
          icon={<GraduationCap />}
          description="1 日に出すカードの量と、1 日の区切り"
        >
          <Field label="1 日の新しいカード" htmlFor="new-per-day" hint="初めて学ぶカードの上限">
            <NumberField
              id="new-per-day"
              value={s.newPerDay}
              min={0}
              max={500}
              onChange={(v) => update({ newPerDay: v })}
            />
          </Field>
          <Field
            label="1 日の復習の上限"
            htmlFor="max-reviews"
            hint="多すぎる日は翌日以降に回します"
          >
            <NumberField
              id="max-reviews"
              value={s.maxReviewsPerDay}
              min={10}
              max={9999}
              onChange={(v) => update({ maxReviewsPerDay: v })}
            />
          </Field>
          <Field label="新しいカードの順番" htmlFor="new-order">
            <Select
              id="new-order"
              value={s.newCardOrder}
              onChange={(v) => update({ newCardOrder: v as NewCardOrder })}
              options={(Object.keys(NEW_CARD_ORDER_LABELS) as NewCardOrder[]).map((v) => ({
                value: v,
                label: NEW_CARD_ORDER_LABELS[v],
              }))}
              className="w-40"
            />
          </Field>
          <Field
            label="1 日の始まり"
            htmlFor="day-start"
            hint="この時刻より前は前日として数えます（夜更かし対策）"
          >
            <Select
              id="day-start"
              value={String(s.dayStartHour)}
              onChange={(v) => update({ dayStartHour: Number(v) })}
              options={[0, 1, 2, 3, 4, 5, 6].map((h) => ({ value: String(h), label: `${h}:00` }))}
              className="w-28"
            />
          </Field>
          <Field
            label="次の復習までの間隔を表示"
            htmlFor="show-intervals"
            hint="評価ボタンに「3日」などを表示"
          >
            <Switch
              id="show-intervals"
              checked={s.showIntervals}
              onChange={(v) => update({ showIntervals: v })}
            />
          </Field>
        </Section>

        <Section
          title="記憶のアルゴリズム（FSRS）"
          icon={<Brain />}
          description="復習のタイミングは FSRS が計算します。AI が勝手に決めることはありません"
        >
          <Field
            label="目標の記憶率"
            htmlFor="retention"
            hint="高いほど忘れにくくなりますが、復習が増えます（おすすめ 85〜92%）"
          >
            <Slider
              id="retention"
              value={s.retention}
              min={0.75}
              max={0.97}
              step={0.01}
              onChange={(v) => update({ retention: v })}
              format={(v) => `${Math.round(v * 100)}%`}
            />
          </Field>
          <Field label="最大の間隔（日）" htmlFor="max-interval" hint="これより長くは空けません">
            <NumberField
              id="max-interval"
              value={s.maxIntervalDays}
              min={7}
              max={36500}
              onChange={(v) => update({ maxIntervalDays: v })}
            />
          </Field>
          <Field
            label="覚えたてのカードは当日中に復習"
            htmlFor="short-term"
            hint="数分〜数十分あとにもう一度出します"
          >
            <Switch
              id="short-term"
              checked={s.shortTerm}
              onChange={(v) => update({ shortTerm: v })}
            />
          </Field>
          <Field
            label="予定を少し散らす"
            htmlFor="fuzz"
            hint="同じ日に覚えたカードの復習日が重ならないようにします"
          >
            <Switch id="fuzz" checked={s.fuzz} onChange={(v) => update({ fuzz: v })} />
          </Field>
        </Section>

        <Section title="読み上げ" icon={<Volume2 />} description="端末の音声で英語を読み上げます">
          {isSpeechSupported() ? (
            <>
              <Field label="カードを表示したら自動で読み上げる" htmlFor="auto-speak">
                <Switch
                  id="auto-speak"
                  checked={s.autoSpeak}
                  onChange={(v) => update({ autoSpeak: v })}
                />
              </Field>
              <Field label="速さ" htmlFor="speech-rate">
                <Slider
                  id="speech-rate"
                  value={s.speechRate}
                  min={0.5}
                  max={1.5}
                  step={0.05}
                  onChange={(v) => update({ speechRate: v })}
                  format={(v) => `${v.toFixed(2)}x`}
                />
              </Field>
              <Field label="声" htmlFor="voice">
                <VoiceSelect />
              </Field>
              <div className="px-4 py-3 sm:px-5">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    void speak('Hello! Nice to meet you.', {
                      rate: s.speechRate,
                      voiceURI: s.speechVoice || undefined,
                    })
                  }
                >
                  <Volume2 />
                  試しに聞く
                </Button>
              </div>
            </>
          ) : (
            <p className="px-4 py-3 text-sm text-slate-500 sm:px-5">
              このブラウザは読み上げに対応していません
            </p>
          )}
        </Section>

        <Section title="AI パートナー" icon={<Bot />} description="性格と、AI にどこまで任せるか">
          <div className="space-y-2 px-4 py-3.5 sm:px-5">
            <div className="text-sm font-medium">性格</div>
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                ...PERSONAS,
                {
                  id: CUSTOM_PERSONA_ID,
                  name: 'カスタム',
                  emoji: '✨',
                  tagline: '性格を自分で書く',
                },
              ].map((p) => (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={s.persona === p.id}
                  onClick={() => update({ persona: p.id })}
                  className={cn(
                    'flex items-start gap-3 rounded-xl border p-3 text-left transition-colors',
                    s.persona === p.id
                      ? 'border-accent-500 bg-accent-50 dark:bg-accent-900/20'
                      : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/50',
                  )}
                >
                  <span className="text-2xl" aria-hidden>
                    {p.emoji}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{p.name}</span>
                    <span className="block text-xs text-slate-500 dark:text-slate-400">
                      {p.tagline}
                    </span>
                  </span>
                </button>
              ))}
            </div>
            {s.persona === CUSTOM_PERSONA_ID && (
              <textarea
                value={s.customPersona}
                onChange={(e) => update({ customPersona: e.target.value })}
                rows={3}
                placeholder="例: あなたは関西弁で話す陽気な先輩です。ツッコミを入れつつ、要点はしっかり教えます。"
                className="mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-950"
              />
            )}
          </div>
          <Field label="評価したときのひとこと" htmlFor="reaction">
            <Select
              id="reaction"
              value={s.reaction}
              onChange={(v) => update({ reaction: v as ReactionMode })}
              options={(Object.keys(REACTION_LABELS) as ReactionMode[]).map((v) => ({
                value: v,
                label: REACTION_LABELS[v],
              }))}
              className="w-48 sm:w-64"
            />
          </Field>
          <Field
            label="学習状況を AI に伝える"
            htmlFor="share-state"
            hint="今日の学習数・連続日数・見ているカードなどを構造化データで渡します（端末の外には出ません）"
          >
            <Switch
              id="share-state"
              checked={s.shareStudyState}
              onChange={(v) => update({ shareStudyState: v })}
            />
          </Field>
          <Field
            label="AI にツールを使わせる"
            htmlFor="use-tools"
            hint="学習記録の検索・苦手な項目の確認などを AI が自分で調べます"
          >
            <Switch id="use-tools" checked={s.useTools} onChange={(v) => update({ useTools: v })} />
          </Field>
          <Field
            label="追加の指示（任意）"
            htmlFor="extra"
            stacked
            hint="AI へのお願いを書けます（例: 解説は短めに、例文はビジネスの場面で）"
          >
            <textarea
              id="extra"
              value={s.extraInstructions}
              onChange={(e) => update({ extraInstructions: e.target.value })}
              rows={2}
              className="w-full rounded-xl border border-slate-300 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
          </Field>
        </Section>

        <Section title="生成" icon={<Gauge />} description="AI の応答のしかた（次の送信から反映）">
          <Field
            label="Temperature"
            htmlFor="temperature"
            hint="高いほど多様、低いほど安定（0 で常に同じ応答）"
          >
            <Slider
              id="temperature"
              value={s.temperature}
              min={0}
              max={2}
              step={0.05}
              onChange={(v) => update({ temperature: v })}
              format={(v) => v.toFixed(2)}
            />
          </Field>
          <Field label="最大出力トークン数" htmlFor="max-output">
            <Slider
              id="max-output"
              value={s.maxOutputTokens}
              min={128}
              max={4096}
              step={128}
              onChange={(v) => update({ maxOutputTokens: v })}
            />
          </Field>
          <Field
            label="考えてから答える（思考モード）"
            htmlFor="thinking"
            hint="対応モデルのみ。回答の質が上がることがありますが遅くなります"
          >
            <Switch
              id="thinking"
              checked={s.enableThinking}
              onChange={(v) => update({ enableThinking: v })}
            />
          </Field>
          <Field label="生成の統計を表示" htmlFor="show-stats">
            <Switch
              id="show-stats"
              checked={s.showStats}
              onChange={(v) => update({ showStats: v })}
            />
          </Field>
          <Field
            label="Enter で送信"
            htmlFor="enter-send"
            hint="オフ: Ctrl/⌘ + Enter で送信（スマホは常に改行）"
          >
            <Switch
              id="enter-send"
              checked={s.enterToSend}
              onChange={(v) => update({ enterToSend: v })}
            />
          </Field>
        </Section>

        <Section
          title="エンジン"
          icon={<HardDrive />}
          description="変更後はモデルの再読み込みが必要です"
        >
          <Field
            label="バックエンド"
            htmlFor="backend"
            hint={
              webgpu === false
                ? 'この端末では WebGPU が使えません（自動なら CPU で実行）'
                : '自動: WebGPU が使えれば GPU、使えなければ CPU'
            }
          >
            <Select
              id="backend"
              value={s.backend}
              onChange={(v) => update({ backend: v as BackendSetting })}
              options={(Object.keys(BACKEND_SETTING_LABELS) as BackendSetting[]).map((v) => ({
                value: v,
                label: BACKEND_SETTING_LABELS[v],
              }))}
              className="w-40"
            />
          </Field>
          <Field
            label="文脈長"
            htmlFor="context"
            hint="会話で覚えておける長さ。大きいほどメモリを使います"
          >
            <Select
              id="context"
              value={String(s.maxNumTokens)}
              onChange={(v) => update({ maxNumTokens: Number(v) })}
              options={CONTEXT_OPTIONS}
              className="w-40"
            />
          </Field>
          <Field label="起動時に前回のモデルを読み込む" htmlFor="auto-load">
            <Switch
              id="auto-load"
              checked={s.autoLoadLastModel}
              onChange={(v) => update({ autoLoadLastModel: v })}
            />
          </Field>
          <Field
            label="取り込んだモデルをブラウザに保存"
            htmlFor="save-models"
            hint="他の github.io のサイトとも共有されます"
          >
            <Switch
              id="save-models"
              checked={s.saveImportedModels && isOpfsSupported()}
              disabled={!isOpfsSupported()}
              onChange={(v) => update({ saveImportedModels: v })}
            />
          </Field>
        </Section>

        <Section title="表示" icon={<Palette />}>
          <Field label="テーマ" htmlFor="theme">
            <Select
              id="theme"
              value={s.theme}
              onChange={(v) => update({ theme: v as ThemeSetting })}
              options={(Object.keys(THEME_LABELS) as ThemeSetting[]).map((v) => ({
                value: v,
                label: THEME_LABELS[v],
              }))}
              className="w-44"
            />
          </Field>
        </Section>

        <Section
          title="データ"
          icon={<Database />}
          description="データはすべてこの端末のブラウザ内に保存されています"
        >
          <Field label="ストレージ使用量">
            <StorageUsage />
          </Field>
          <Field
            label="学習データのバックアップ"
            hint="教材・学習記録・チャットを JSON ファイルに書き出します"
          >
            <Button size="sm" variant="secondary" onClick={() => void backup()}>
              書き出す
            </Button>
          </Field>
          <Field label="バックアップから復元" hint="今のデータはすべて置き換わります">
            <Button size="sm" variant="secondary" onClick={() => restoreInput.current?.click()}>
              ファイルを選ぶ
            </Button>
            <input
              ref={restoreInput}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                restoreText.current = await file.text();
                setConfirm('restore');
              }}
            />
          </Field>
          <Field label="学習記録をクリア" hint="教材は残して、すべて未学習に戻します">
            <Button size="sm" variant="danger" onClick={() => setConfirm('progress')}>
              クリア
            </Button>
          </Field>
          <Field
            label="すべての学習データを削除"
            hint="教材・学習記録・チャットを削除します（モデルは残ります）"
          >
            <Button size="sm" variant="danger" onClick={() => setConfirm('all')}>
              削除
            </Button>
          </Field>
          <Field
            label="保存済みモデルを削除"
            hint={`${storedCount} 個（同じ github.io の他のサイトのモデルも消えます）`}
          >
            <Button
              size="sm"
              variant="danger"
              disabled={storedCount === 0}
              onClick={() => setConfirm('models')}
            >
              削除
            </Button>
          </Field>
          <Field label="設定を初期値に戻す">
            <Button size="sm" variant="secondary" onClick={() => setConfirm('reset')}>
              <RotateCcw />
              リセット
            </Button>
          </Field>
        </Section>
      </PageBody>

      <ConfirmDialog
        open={confirm === 'progress'}
        title="学習記録をクリアしますか？"
        description="すべてのカードを未学習に戻し、カレンダーの記録も消えます。この操作は取り消せません。"
        confirmLabel="クリア"
        danger
        onConfirm={async () => {
          await clearAllProgress();
          afterDataChange();
          toast.success('学習記録をクリアしました');
        }}
        onClose={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === 'all'}
        title="すべての学習データを削除しますか？"
        description="教材・学習記録・チャットをすべて削除します。必要ならバックアップを書き出してください。"
        confirmLabel="削除"
        danger
        onConfirm={async () => {
          await clearAllData();
          await useChat.getState().clear();
          afterDataChange();
          toast.success('すべての学習データを削除しました');
        }}
        onClose={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === 'restore'}
        title="バックアップから復元しますか？"
        description="今の教材・学習記録・チャットはすべてバックアップの内容に置き換わります。"
        confirmLabel="復元"
        danger
        onConfirm={() => void restore()}
        onClose={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === 'models'}
        title="保存済みモデルをすべて削除しますか？"
        description="ブラウザに保存したモデルを削除します。同じ github.io の他のサイトからも使えなくなります。"
        confirmLabel="削除"
        danger
        onConfirm={() => void deleteModels()}
        onClose={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === 'reset'}
        title="設定を初期値に戻しますか？"
        description="学習・AI・表示の設定がすべて初期値に戻ります（学習データは消えません）。"
        confirmLabel="リセット"
        onConfirm={() => {
          s.reset();
          toast.success('設定を初期値に戻しました');
        }}
        onClose={() => setConfirm(null)}
      />
    </>
  );
}
