/**
 * カードの中で答えてアプリが判定する種類の表示: 仕訳・複数選択・数値入力・○×・組み合わせ・表の穴埋め。
 * 判定は lib/packs/interactiveCheck.ts（プログラムが決める）。
 */
import { useMemo, useState, type ReactNode } from 'react';
import { CheckCircle2, Plus, Square, SquareCheck, X, XCircle } from 'lucide-react';
import {
  checkJournal,
  checkMatch,
  checkMulti,
  checkNumeric,
  checkTable,
  formatAmount,
  journalAccounts,
  parseNumber,
  seededShuffle,
  tableBlanks,
  type JournalInput,
  type JournalInputLine,
} from '@/lib/packs/interactiveCheck';
import type {
  JournalItem,
  JournalLine,
  MatchItem,
  MultiItem,
  NumericItem,
  TableItem,
  TrueFalseItem,
} from '@/lib/packs/schema';
import { cn } from '@/lib/utils/cn';
import { Explanation, Hints, Label, Notes, Prompt } from './cardParts';

/** カードの中で答えた結果（value は種類ごとの入力。画面を移っても答えを表示し直すために保つ） */
export interface InteractiveResult {
  correct: boolean;
  value: unknown;
}

export interface InteractiveProps<T> {
  item: T;
  side: 'front' | 'back';
  seed?: string;
  result?: InteractiveResult;
  onSubmit?: (result: InteractiveResult) => void;
  /** 答えを表示したあと（答えずに「わからない」で見たときは入力できないようにする） */
  locked?: boolean;
}

const FIELD =
  'h-11 min-w-0 rounded-xl border border-slate-300 bg-white px-3 text-base dark:border-slate-700 dark:bg-slate-950';

function SubmitButton({ disabled, onClick }: { disabled?: boolean; onClick: () => void }) {
  return (
    <div className="flex justify-center">
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className="rounded-xl bg-accent-600 px-6 py-2.5 font-semibold text-white hover:bg-accent-700 disabled:bg-slate-300 dark:disabled:bg-slate-700"
      >
        答え合わせ
      </button>
    </div>
  );
}

function Verdict({ correct, wrong = '不正解' }: { correct: boolean; wrong?: string }) {
  return (
    <p
      className={cn(
        'flex items-center justify-center gap-1 font-semibold',
        correct ? 'text-emerald-600' : 'text-rose-600',
      )}
    >
      {correct ? <CheckCircle2 className="size-5" /> : <XCircle className="size-5" />}
      {correct ? '正解！' : wrong}
    </p>
  );
}

function SkippedNote() {
  return (
    <p className="rounded-xl border-2 border-dashed border-slate-300 px-3 py-3 text-center text-sm text-slate-500 dark:border-slate-700">
      答えずに答えを見ました
    </p>
  );
}

function Mark({ ok }: { ok: boolean }) {
  return ok ? (
    <CheckCircle2 className="size-4 shrink-0 text-emerald-600" aria-label="正しい" />
  ) : (
    <XCircle className="size-4 shrink-0 text-rose-600" aria-label="違う" />
  );
}

function BackSection({
  title,
  children,
  explanation,
  notes,
}: {
  title?: string;
  children: ReactNode;
  explanation?: string;
  notes?: string;
}) {
  return (
    <div className="space-y-4">
      <div>
        {title && <Label>{title}</Label>}
        {children}
      </div>
      <Explanation text={explanation} />
      <Notes text={notes} />
    </div>
  );
}

// ---- 仕訳 ----

const EMPTY_LINE: JournalInputLine = { account: '', amount: '' };

/** 正しい仕訳の表（借方 | 貸方） */
export function JournalTable({
  debit,
  credit,
  unit,
}: {
  debit: JournalLine[];
  credit: JournalLine[];
  unit?: string;
}) {
  const n = Math.max(debit.length, credit.length);
  const cell = (l?: JournalLine) =>
    l ? (
      <>
        <td className="py-1.5 pr-2 align-top">{l.account}</td>
        <td className="py-1.5 pr-2 text-right align-top whitespace-nowrap tabular-nums">
          {formatAmount(l.amount)}
        </td>
      </>
    ) : (
      <>
        <td />
        <td />
      </>
    );
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-xs text-slate-500 dark:border-slate-700">
            <th colSpan={2} className="py-1 text-left font-semibold">
              借方
            </th>
            <th
              colSpan={2}
              className="border-l border-slate-200 py-1 pl-2 text-left font-semibold dark:border-slate-700"
            >
              貸方
            </th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: n }, (_, i) => (
            <tr key={i} className="border-b border-slate-100 dark:border-slate-800">
              {cell(debit[i])}
              {credit[i] ? (
                <>
                  <td className="border-l border-slate-200 py-1.5 pr-2 pl-2 align-top dark:border-slate-700">
                    {credit[i].account}
                  </td>
                  <td className="py-1.5 text-right align-top whitespace-nowrap tabular-nums">
                    {formatAmount(credit[i].amount)}
                  </td>
                </>
              ) : (
                <>
                  <td className="border-l border-slate-200 dark:border-slate-700" />
                  <td />
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {unit && unit !== '円' && (
        <p className="mt-1 text-right text-xs text-slate-500">単位: {unit}</p>
      )}
    </div>
  );
}

function JournalSide({
  title,
  lines,
  accounts,
  unit,
  onChange,
  marks,
  readOnly,
}: {
  title: string;
  lines: JournalInputLine[];
  accounts: string[];
  unit: string;
  onChange?: (lines: JournalInputLine[]) => void;
  marks?: boolean[];
  readOnly?: boolean;
}) {
  const set = (i: number, patch: Partial<JournalInputLine>) =>
    onChange?.(lines.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 text-sm font-semibold text-slate-600 dark:text-slate-300">
        {title}
      </legend>
      {lines.map((l, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <select
            value={l.account}
            disabled={readOnly}
            onChange={(e) => set(i, { account: e.target.value })}
            aria-label={`${title}の科目 ${i + 1}`}
            className={cn(FIELD, 'flex-1 pr-1')}
          >
            <option value="">科目を選ぶ</option>
            {accounts.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <input
            value={l.amount}
            readOnly={readOnly}
            onChange={(e) => set(i, { amount: e.target.value })}
            onBlur={() => {
              const n = parseNumber(l.amount);
              if (n !== null && !readOnly) set(i, { amount: formatAmount(n) });
            }}
            inputMode="decimal"
            autoComplete="off"
            placeholder="金額"
            aria-label={`${title}の金額 ${i + 1}（${unit}）`}
            className={cn(FIELD, 'w-28 text-right tabular-nums sm:w-36')}
          />
          <span className="flex size-8 shrink-0 items-center justify-center">
            {marks ? (
              <Mark ok={marks[i]} />
            ) : (
              lines.length > 1 &&
              !readOnly && (
                <button
                  type="button"
                  onClick={() => onChange?.(lines.filter((_, k) => k !== i))}
                  aria-label={`${title}の行 ${i + 1} を消す`}
                  className="flex size-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="size-4" />
                </button>
              )
            )}
          </span>
        </div>
      ))}
      {!readOnly && lines.length < 8 && (
        <button
          type="button"
          onClick={() => onChange?.([...lines, EMPTY_LINE])}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-accent-700 hover:bg-accent-50 dark:text-accent-300 dark:hover:bg-accent-900/30"
        >
          <Plus className="size-4" />
          行を追加
        </button>
      )}
    </fieldset>
  );
}

export function JournalFace({
  item,
  side,
  seed,
  result,
  onSubmit,
  locked,
}: InteractiveProps<JournalItem>) {
  const accounts = useMemo(() => journalAccounts(item, seed ?? item.id), [item, seed]);
  const [input, setInput] = useState<JournalInput>({ debit: [EMPTY_LINE], credit: [EMPTY_LINE] });
  const unit = item.unit ?? '円';

  if (side === 'back') {
    return (
      <BackSection title="正しい仕訳" explanation={item.explanation} notes={item.notes}>
        <JournalTable debit={item.debit} credit={item.credit} unit={item.unit} />
      </BackSection>
    );
  }
  const answered = result?.value as JournalInput | undefined;
  const shown = answered ?? input;
  const check = answered ? checkJournal(answered, item) : null;
  const filled = (lines: JournalInputLine[]) =>
    lines.some((l) => l.account && parseNumber(l.amount) !== null);
  return (
    <div className="space-y-4">
      <Prompt>{item.question}</Prompt>
      {!answered && locked ? (
        <SkippedNote />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <JournalSide
              title="借方"
              lines={shown.debit}
              accounts={accounts}
              unit={unit}
              onChange={(debit) => setInput((v) => ({ ...v, debit }))}
              marks={check?.debit.rows}
              readOnly={!!answered}
            />
            <JournalSide
              title="貸方"
              lines={shown.credit}
              accounts={accounts}
              unit={unit}
              onChange={(credit) => setInput((v) => ({ ...v, credit }))}
              marks={check?.credit.rows}
              readOnly={!!answered}
            />
          </div>
          {unit !== '円' && (
            <p className="text-center text-xs text-slate-500">金額の単位: {unit}</p>
          )}
          {check ? (
            <Verdict correct={check.correct} wrong="仕訳が違います" />
          ) : (
            <SubmitButton
              disabled={!filled(input.debit) || !filled(input.credit)}
              onClick={() =>
                onSubmit?.({ correct: checkJournal(input, item).correct, value: input })
              }
            />
          )}
        </>
      )}
    </div>
  );
}

// ---- 複数選択 ----

export function MultiFace({ item, side, result, onSubmit, locked }: InteractiveProps<MultiItem>) {
  const [picked, setPicked] = useState<number[]>([]);
  if (side === 'back') {
    return (
      <BackSection title="正解" explanation={item.explanation} notes={item.notes}>
        <ul className="list-disc space-y-1 pl-5 font-medium">
          {item.answers.map((i) => (
            <li key={i}>{item.choices[i]}</li>
          ))}
        </ul>
      </BackSection>
    );
  }
  const answered = result?.value as number[] | undefined;
  const shown = answered ?? picked;
  const done = !!answered || !!locked;
  return (
    <div className="space-y-4">
      <Prompt>{item.question}</Prompt>
      <p className="text-center text-xs text-slate-500">当てはまるものをすべて選んでください</p>
      <div className="grid gap-2">
        {item.choices.map((c, i) => {
          const on = shown.includes(i);
          const isAnswer = item.answers.includes(i);
          return (
            <button
              key={i}
              type="button"
              disabled={done}
              aria-pressed={on}
              onClick={() =>
                setPicked((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i]))
              }
              className={cn(
                'flex items-center gap-2 rounded-xl border px-4 py-3 text-left font-medium transition-colors',
                !done &&
                  (on
                    ? 'border-accent-500 bg-accent-50 dark:bg-accent-900/30'
                    : 'border-slate-300 bg-white hover:border-accent-400 dark:border-slate-700 dark:bg-slate-900'),
                done &&
                  isAnswer &&
                  (on || !answered
                    ? 'border-emerald-400 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200'
                    : 'border-amber-400 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200'),
                done &&
                  !isAnswer &&
                  on &&
                  'border-rose-400 bg-rose-50 text-rose-900 dark:border-rose-700 dark:bg-rose-950/40 dark:text-rose-200',
                done && !isAnswer && !on && 'border-slate-200 opacity-60 dark:border-slate-800',
              )}
            >
              {on ? (
                <SquareCheck className="size-5 shrink-0" />
              ) : (
                <Square className="size-5 shrink-0 text-slate-400" />
              )}
              <span className="flex-1">{c}</span>
              {answered && isAnswer && !on && <span className="text-xs">選び漏れ</span>}
            </button>
          );
        })}
      </div>
      {answered ? (
        <Verdict correct={checkMulti(answered, item)} />
      ) : (
        !locked && (
          <SubmitButton
            disabled={picked.length === 0}
            onClick={() => onSubmit?.({ correct: checkMulti(picked, item), value: picked })}
          />
        )
      )}
    </div>
  );
}

// ---- 数値入力 ----

export function NumericFace({
  item,
  side,
  result,
  onSubmit,
  locked,
}: InteractiveProps<NumericItem>) {
  const [text, setText] = useState('');
  if (side === 'back') {
    return (
      <BackSection explanation={item.explanation} notes={item.notes}>
        <p className="text-center text-xl font-semibold tabular-nums">
          答え: {formatAmount(item.answer)}
          {item.unit && <span className="ml-1 text-base font-normal">{item.unit}</span>}
        </p>
      </BackSection>
    );
  }
  const answered = result?.value as string | undefined;
  const submit = () => {
    if (!text.trim()) return;
    onSubmit?.({ correct: checkNumeric(text, item).correct, value: text });
  };
  return (
    <div className="space-y-4">
      <Prompt>{item.question}</Prompt>
      {answered !== undefined ? (
        <>
          <p className="text-center tabular-nums">
            <span className="text-sm text-slate-500">あなたの答え: </span>
            <span className="font-semibold">{answered}</span>
            {item.unit && !/[^\d,.\s]$/.test(answered) && <span className="ml-1">{item.unit}</span>}
          </p>
          <Verdict correct={result?.correct ?? false} />
        </>
      ) : locked ? (
        <SkippedNote />
      ) : (
        <>
          <Hints hints={item.hints} />
          <form
            className="flex items-center justify-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              inputMode="decimal"
              autoComplete="off"
              enterKeyHint="done"
              aria-label="答えの数値"
              placeholder="数値を入力"
              className={cn(FIELD, 'w-44 text-right text-lg tabular-nums')}
            />
            {item.unit && <span className="text-slate-600 dark:text-slate-300">{item.unit}</span>}
          </form>
          <SubmitButton disabled={!text.trim()} onClick={submit} />
        </>
      )}
    </div>
  );
}

// ---- ○× ----

export function TrueFalseFace({
  item,
  side,
  result,
  onSubmit,
  locked,
}: InteractiveProps<TrueFalseItem>) {
  if (side === 'back') {
    return (
      <BackSection explanation={item.explanation} notes={item.notes}>
        <p className="text-center text-xl font-semibold">
          答え: {item.answer ? '○（正しい）' : '×（誤り）'}
        </p>
      </BackSection>
    );
  }
  const answered = result?.value as boolean | undefined;
  const done = answered !== undefined || !!locked;
  const button = (value: boolean) => {
    const on = answered === value;
    const isAnswer = item.answer === value;
    return (
      <button
        type="button"
        disabled={done}
        onClick={() => onSubmit?.({ correct: value === item.answer, value })}
        aria-label={value ? '○（正しい）' : '×（誤り）'}
        className={cn(
          'flex h-20 flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl border-2 text-3xl font-bold transition-colors',
          !done &&
            'border-slate-300 bg-white hover:border-accent-400 hover:bg-accent-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-accent-900/20',
          done &&
            isAnswer &&
            'border-emerald-400 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
          done &&
            on &&
            !isAnswer &&
            'border-rose-400 bg-rose-50 text-rose-700 dark:border-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
          done && !isAnswer && !on && 'border-slate-200 opacity-50 dark:border-slate-800',
        )}
      >
        {value ? '○' : '×'}
        <span className="text-xs font-medium">{value ? '正しい' : '誤り'}</span>
      </button>
    );
  };
  return (
    <div className="space-y-4">
      <Prompt>{item.statement}</Prompt>
      <div className="mx-auto flex max-w-sm gap-3">
        {button(true)}
        {button(false)}
      </div>
      {answered !== undefined && <Verdict correct={answered === item.answer} />}
    </div>
  );
}

// ---- 組み合わせ ----

export function MatchFace({
  item,
  side,
  seed,
  result,
  onSubmit,
  locked,
}: InteractiveProps<MatchItem>) {
  const rights = useMemo(
    () =>
      seededShuffle(
        item.pairs.map((p) => p.right),
        seed ?? item.id,
      ),
    [item, seed],
  );
  const [picks, setPicks] = useState<(string | null)[]>(() => item.pairs.map(() => null));
  if (side === 'back') {
    return (
      <BackSection title="正しい組み合わせ" explanation={item.explanation} notes={item.notes}>
        <ul className="space-y-1">
          {item.pairs.map((p, i) => (
            <li key={i} className="flex flex-wrap gap-x-2">
              <span className="font-medium">{p.left}</span>
              <span className="text-slate-400">→</span>
              <span>{p.right}</span>
            </li>
          ))}
        </ul>
      </BackSection>
    );
  }
  const answered = result?.value as (string | null)[] | undefined;
  const shown = answered ?? picks;
  const check = answered ? checkMatch(answered, item) : null;
  return (
    <div className="space-y-4">
      {item.prompt && <Prompt>{item.prompt}</Prompt>}
      {!answered && locked ? (
        <SkippedNote />
      ) : (
        <>
          <div className="space-y-2">
            {item.pairs.map((p, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 basis-32 font-medium">{p.left}</span>
                <div className="flex min-w-0 flex-1 basis-40 items-center gap-1.5">
                  <select
                    value={shown[i] ?? ''}
                    disabled={!!answered}
                    onChange={(e) =>
                      setPicks((v) => v.map((x, k) => (k === i ? e.target.value || null : x)))
                    }
                    aria-label={`${p.left} に合うもの`}
                    className={cn(FIELD, 'w-full')}
                  >
                    <option value="">選ぶ</option>
                    {rights.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                  {check && <Mark ok={check.rows[i]} />}
                </div>
              </div>
            ))}
          </div>
          {check ? (
            <Verdict correct={check.correct} wrong="組み合わせが違います" />
          ) : (
            <SubmitButton
              disabled={picks.some((p) => !p)}
              onClick={() => onSubmit?.({ correct: checkMatch(picks, item).correct, value: picks })}
            />
          )}
        </>
      )}
    </div>
  );
}

// ---- 表の穴埋め ----

type CellPart = { text: string } | { blank: string; index: number };

/** 表のマスを文字と空欄に分け、空欄に通し番号（行の順、左から）を付ける */
function tableLayout(rows: string[][]): CellPart[][][] {
  let n = 0;
  return rows.map((row) =>
    row.map((cell) =>
      cell
        .split(/(\{\{[^{}]+\}\})/g)
        .filter(Boolean)
        .map((p) => {
          const m = /^\{\{([^{}]+)\}\}$/.exec(p);
          return m ? { blank: m[1], index: n++ } : { text: p };
        }),
    ),
  );
}

export function TableFace({ item, side, result, onSubmit, locked }: InteractiveProps<TableItem>) {
  const blanks = tableBlanks(item);
  const [inputs, setInputs] = useState<string[]>(() => blanks.map(() => ''));
  const answered = result?.value as string[] | undefined;
  const check = answered ? checkTable(answered, item) : null;
  const front = side === 'front';

  const layout = tableLayout(item.rows);
  const table = (
    <div className="overflow-x-auto">
      <table className="w-full text-xs sm:text-sm">
        <thead>
          <tr className="border-b border-slate-300 dark:border-slate-600">
            {item.columns.map((c, i) => (
              <th
                key={i}
                className="px-1 py-1.5 text-left text-xs font-semibold whitespace-nowrap text-slate-500 sm:px-1.5"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {layout.map((row, r) => (
            <tr key={r} className="border-b border-slate-100 dark:border-slate-800">
              {row.map((cell, c) => (
                <td
                  key={c}
                  className="px-1 py-1 align-middle whitespace-nowrap tabular-nums sm:px-1.5"
                >
                  {cell.map((part, j) => {
                    if ('text' in part) return <span key={j}>{part.text}</span>;
                    const idx = part.index;
                    if (!front)
                      return (
                        <mark
                          key={j}
                          className="rounded-md bg-accent-100 px-1 text-accent-900 dark:bg-accent-900/50 dark:text-accent-100"
                        >
                          {part.blank}
                        </mark>
                      );
                    if (locked && !answered)
                      return (
                        <span
                          key={j}
                          className="inline-block min-w-12 border-b-2 border-slate-300 dark:border-slate-600"
                        >
                          &nbsp;
                        </span>
                      );
                    const value = answered ? answered[idx] : inputs[idx];
                    return (
                      <input
                        key={j}
                        value={value ?? ''}
                        readOnly={!!answered}
                        onChange={(e) =>
                          setInputs((v) => v.map((x, n) => (n === idx ? e.target.value : x)))
                        }
                        inputMode={parseNumber(part.blank) !== null ? 'decimal' : 'text'}
                        autoComplete="off"
                        aria-label={`${item.columns[c]}（${r + 1} 行目）`}
                        className={cn(
                          'h-9 w-20 rounded-lg border-2 bg-white px-1.5 text-right text-sm dark:bg-slate-950 sm:w-28',
                          !check && 'border-accent-400 dark:border-accent-600',
                          check?.cells[idx] &&
                            'border-emerald-500 bg-emerald-50 dark:border-emerald-600 dark:bg-emerald-950/40',
                          check &&
                            !check.cells[idx] &&
                            'border-rose-500 bg-rose-50 dark:border-rose-600 dark:bg-rose-950/40',
                        )}
                      />
                    );
                  })}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  if (!front) {
    return (
      <BackSection title="答え" explanation={item.explanation} notes={item.notes}>
        {table}
      </BackSection>
    );
  }
  return (
    <div className="space-y-4">
      <Prompt>{item.question}</Prompt>
      {table}
      {locked && !answered && <SkippedNote />}
      {check ? (
        <Verdict correct={check.correct} wrong="違うマスがあります" />
      ) : (
        !locked && (
          <SubmitButton
            disabled={inputs.some((v) => !v.trim())}
            onClick={() => onSubmit?.({ correct: checkTable(inputs, item).correct, value: inputs })}
          />
        )
      )}
    </div>
  );
}
