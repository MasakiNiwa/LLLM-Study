/**
 * 外部 AI に教材を作ってもらうための「仕様書」と「プロンプト」を作る。
 *
 * - アプリの「教材」画面: プロンプトのコピー・仕様書（.md）のダウンロード
 * - docs/STUDY_PACK_FORMAT.md: scripts/build-packs.ts がここから生成する
 * どちらも schema.ts（zod）から作るので、形式を変えたら自動的に揃う。
 *
 * NOTE: scripts/build-packs.ts から Node で直接読み込むため、`@/` エイリアスを使わない。
 */
import {
  PACK_FORMAT,
  PACK_VERSION,
  packJsonSchema,
  type ItemType,
  type StudyPack,
} from './schema.ts';
import { ITEM_TYPE_LABELS } from './templates.ts';

export const ITEM_TYPE_GUIDES: Record<ItemType, string> = {
  vocab:
    '単語。term（見出し語）と meanings（意味の配列）が必須。reading（IPA）・pos（品詞）・examples（例文と訳）・collocations・synonyms・antonyms・forms（不規則な活用形。例: took, taken）・notes は任意',
  phrase: 'フレーズ・表現。phrase と meaning が必須。situation（使う場面）・examples・notes は任意',
  qa: '一問一答（どの分野にも使える）。question と answer が必須。accepted（別解・略称・表記揺れなど、正解にしてよい答え）・explanation・hints は任意',
  cloze:
    '穴埋め。text の中で答えにする部分を {{ }} で囲む（例: "I look {{forward}} to it."）。translation・hint・explanation は任意',
  choice:
    '選択問題。question・choices（2〜6 個）・answer（正解の番号。0 始まり）が必須。explanation は任意',
  order:
    '並べ替え。answer（正しい文）が必須。chunks（並べ替える語句を正しい順に。日本語など空白で区切らない言語では必須）・prompt（訳や問題文）・explanation は任意',
  journal:
    '仕訳（簿記・会計）。question（取引の内容）・debit（借方の行）・credit（貸方の行）が必須。各行は { "account": 勘定科目, "amount": 金額（数値） }。借方と貸方の合計を一致させる。accounts（選択肢に足す紛らわしい科目）・unit（単位。既定は円）・explanation は任意',
  multi:
    '複数選択（正しいものをすべて選ぶ）。question・choices（3〜8 個）・answers（正解の番号の配列。0 始まり、1 つ以上。全部を正解にはしない）が必須。explanation は任意',
  numeric:
    '数値入力（計算問題）。question・answer（正解の数値。単位は付けない）が必須。unit（単位。例: 円, %）・tolerance（許容する誤差）・hints・explanation は任意',
  truefalse:
    '○×（正誤）。statement（判断する文）・answer（正しければ true、誤りなら false）が必須。explanation（誤りの文ではどこが誤りか）は任意',
  match:
    '組み合わせ。pairs（[{ "left": 語句, "right": 対応する語句 }] を 2〜8 組。右の語句はどれも違うものにする）が必須。prompt（指示）・explanation は任意',
  table:
    '表の穴埋め（返済表・計算表など）。question・columns（列の見出し）・rows（行の配列。各マスは文字列で、答えにするマスを {{ }} で囲む）が必須。explanation は任意',
};

const EXAMPLE_ITEMS: Record<ItemType, StudyPack['items'][number]> = {
  vocab: {
    id: 'v-take',
    type: 'vocab',
    term: 'take',
    reading: '/teɪk/',
    pos: '動詞',
    meanings: ['取る', '（時間が）かかる', '連れて行く'],
    examples: [
      {
        text: 'It takes ten minutes to walk to the station.',
        translation: '駅まで歩いて 10 分かかる。',
      },
    ],
    collocations: ['take a break', 'take a photo'],
    notes: '「自分のところへ取り込む」がコアイメージ。',
  },
  phrase: {
    id: 'p-no-worries',
    type: 'phrase',
    phrase: 'No worries.',
    meaning: '気にしないで／大丈夫だよ',
    situation: 'お礼や謝罪への軽い返事',
    examples: [
      {
        text: "A: Sorry I'm late. B: No worries.",
        translation: 'A: 遅れてごめん。B: 大丈夫だよ。',
      },
    ],
  },
  // 一問一答・穴埋め・選択問題は語学以外にも使えることが伝わる例にする
  qa: {
    id: 'q-longest-river',
    type: 'qa',
    question: '日本で最も長い川は？',
    answer: '信濃川',
    explanation: '長さは約 367 km。長野県では千曲川と呼ばれる。',
  },
  cloze: {
    id: 'c-boiling-point',
    type: 'cloze',
    text: '1 気圧のもとで、水は約 {{100}} ℃で沸騰する。',
    hint: '温度の単位はセルシウス度',
  },
  choice: {
    id: 'ch-edo-shogunate',
    type: 'choice',
    question: '江戸幕府を開いた人物は？',
    choices: ['織田信長', '豊臣秀吉', '徳川家康', '足利尊氏'],
    answer: 2,
    explanation: '1603 年に征夷大将軍となり、江戸に幕府を開いた。',
  },
  order: {
    id: 'o-never-been',
    type: 'order',
    prompt: '私は一度もパリに行ったことがない。',
    answer: 'I have never been to Paris.',
    explanation: 'have never been to 〜 で「〜に行ったことがない」（経験）。',
  },
  journal: {
    id: 'j-credit-purchase',
    type: 'journal',
    question: '商品 100,000 円を仕入れ、代金は掛けとした。',
    debit: [{ account: '仕入', amount: 100000 }],
    credit: [{ account: '買掛金', amount: 100000 }],
    accounts: ['売掛金', '未払金', '現金'],
    explanation: '商品の仕入は「仕入」（費用）、代金の後払いは「買掛金」（負債）。',
  },
  multi: {
    id: 'm-assets',
    type: 'multi',
    question: '資産の勘定科目をすべて選びなさい。',
    choices: ['売掛金', '買掛金', '建物', '資本金', '前払費用'],
    answers: [0, 2, 4],
    explanation: '買掛金は負債、資本金は純資産。',
  },
  numeric: {
    id: 'n-straight-line',
    type: 'numeric',
    question:
      '取得原価 1,200,000 円、耐用年数 5 年、残存価額 0 円の備品を定額法で償却する。1 年分の減価償却費は？',
    answer: 240000,
    unit: '円',
    explanation: '1,200,000 ÷ 5 = 240,000 円。',
  },
  truefalse: {
    id: 'tf-capital',
    type: 'truefalse',
    statement: '日本の首都は大阪である。',
    answer: false,
    explanation: '首都は東京。',
  },
  match: {
    id: 'mt-capitals',
    type: 'match',
    prompt: '国と首都を組み合わせなさい。',
    pairs: [
      { left: 'フランス', right: 'パリ' },
      { left: 'イタリア', right: 'ローマ' },
      { left: 'スペイン', right: 'マドリード' },
    ],
  },
  table: {
    id: 't-interest',
    type: 'table',
    question: '元金 10,000 円を年利 5%（複利）で預けたときの残高の表を埋めなさい。',
    columns: ['年', '利息', '年末残高'],
    rows: [
      ['1', '500', '{{10,500}}'],
      ['2', '{{525}}', '11,025'],
    ],
    explanation: '利息は前年末の残高 × 5%。',
  },
};

export function examplePack(types: readonly ItemType[]): StudyPack {
  const language = types.some((t) => t === 'vocab' || t === 'phrase');
  return {
    format: PACK_FORMAT,
    version: PACK_VERSION,
    id: 'example-pack',
    title: '教材のタイトル',
    description: '教材の説明',
    subject: language ? 'english' : 'general',
    language: language ? { target: 'en', explanation: 'ja' } : { target: 'ja', explanation: 'ja' },
    level: language ? 'CEFR A2' : '中学',
    source: 'Generated by AI',
    revision: 1,
    items: types.map((t) => EXAMPLE_ITEMS[t]),
  };
}

/** 長文読解の例（本文 1 つと、それを参照する問題） */
function readingExample(types: readonly ItemType[]): StudyPack {
  const base = examplePack(types);
  return {
    ...base,
    passages: [
      {
        id: 'r1',
        title: 'A Letter from Kyoto',
        text: 'Dear Emma,\nI arrived in Kyoto last Monday. The weather has been cold, but the temples are beautiful. Tomorrow I will visit Kinkaku-ji with my host family.\nBest,\nKen',
        translation:
          'エマへ\n先週の月曜日に京都に着きました。寒い日が続いていますが、お寺はとても美しいです。明日はホストファミリーと金閣寺を訪れます。\nケンより',
      },
    ],
    items: [
      {
        id: 'r1-q1',
        type: 'choice',
        passage: 'r1',
        question: 'ケンが京都に着いたのはいつですか。',
        choices: ['先週の月曜日', '昨日', '今週の金曜日', '明日'],
        answer: 0,
        explanation: '"I arrived in Kyoto last Monday." とあります。',
      },
      {
        id: 'r1-q2',
        type: 'qa',
        passage: 'r1',
        question: 'ケンは明日、誰とどこを訪れますか。',
        answer: 'ホストファミリーと金閣寺',
      },
    ],
  };
}

const RULES = [
  `出力は JSON だけにする（前置きや説明文は付けない）。全体を 1 つの \`\`\`json コードブロックに入れてもよい`,
  `"format" は "${PACK_FORMAT}"、"version" は ${PACK_VERSION} にする`,
  '"id" はパックを表す英数字の ID（例: "en-basic-verbs-001"）。同じ教材を作り直すときは同じ ID と各項目の ID を使い、"revision" を増やす（学習記録が引き継がれる）',
  '各項目の "id" はパック内で一意にする（例: "v-take", "p-no-worries"）',
  '各項目の "type" で種類を指定する。種類ごとに必須のキーが違う',
  '"subject" には分野を表す短い英語（例: english, bookkeeping, history, programming）を入れる',
  '説明・意味・訳・解説は「説明の言語」で書く。語学の教材では、見出し語・例文を「学ぶ言語」で書く',
  'テーマに合った種類を選ぶ（語学なら単語・フレーズ、知識や資格なら一問一答・穴埋め・選択問題など）。種類は組み合わせてもよい',
  '1 つの項目では 1 つのことだけを問い、答えが一つに決まるようにする。解説には覚えるための要点を短く書く',
  '事実と異なる内容を入れない。自信がない情報は省略する',
  '長文読解・会話文の聞き取りなど、複数の問題が同じ本文を使うときは、本文をパックの "passages"（{ "id", "title", "text", "translation" }）に入れ、各問題の "passage" にその id を書く。本文は問題の上に表示される',
];

/** 項目数の目安（細かい数は外部 AI に任せる） */
export type MaterialAmount = 'auto' | 'few' | 'normal' | 'many';

export const AMOUNT_LABELS: Record<MaterialAmount, string> = {
  auto: 'おまかせ',
  few: '少なめ',
  normal: 'ふつう',
  many: '多め',
};

const AMOUNT_PROMPTS: Record<MaterialAmount, string> = {
  auto: 'テーマの広さに合わせて適切な数（目安 20〜100 個）',
  few: '少なめ（10〜20 個程度）',
  normal: 'ふつう（30〜50 個程度）',
  many: '多め（80〜150 個程度。途中で省略せず、最後の項目まで出力する）',
};

export interface MaterialRequest {
  topic: string;
  /** 分野（任意。例: 語学、資格・検定） */
  subject?: string;
  level: string;
  amount: MaterialAmount;
  /** 空ならテーマに合わせて外部 AI が選ぶ */
  types: ItemType[];
  /** 学ぶ言語（語学のときだけ。空なら指定しない） */
  targetLang?: string;
  explanationLang: string;
  extra: string;
  /** 本文（passages）を使った長文読解形式にする */
  reading?: boolean;
  /** 既存の教材を作り直す・増やすときの ID */
  packId?: string;
}

/** 外部 AI に渡すプロンプト（仕様の要点込み。これだけ貼れば作れるようにする） */
export function buildMaterialPrompt(req: MaterialRequest, options: { schema: boolean }): string {
  const auto = req.types.length === 0;
  const types = auto ? (Object.keys(ITEM_TYPE_GUIDES) as ItemType[]) : req.types;
  const lines = [
    '学習アプリ「LLLM Study」に取り込む学習教材を、下の形式の JSON で作ってください。',
    '',
    '## 作ってほしい教材',
    `- テーマ: ${req.topic.trim() || '（おまかせ）'}`,
  ];
  if (req.subject?.trim()) lines.push(`- 分野: ${req.subject.trim()}`);
  lines.push(
    `- レベル: ${req.level.trim() || '（おまかせ）'}`,
    `- 項目数: ${AMOUNT_PROMPTS[req.amount]}`,
    `- 種類: ${
      auto
        ? 'おまかせ（テーマに合う種類を選ぶ。組み合わせてもよい）'
        : types.map((t) => `${ITEM_TYPE_LABELS[t]}（${t}）`).join('、')
    }`,
  );
  if (req.targetLang?.trim()) lines.push(`- 学ぶ言語: ${req.targetLang.trim()}`);
  lines.push(`- 説明の言語: ${req.explanationLang.trim() || '日本語（ja）'}`);
  if (req.reading) {
    lines.push(
      '- 形式: 長文読解。テーマに合う本文をいくつか "passages" に入れ、各本文について内容を問う問題を 3〜5 問ずつ作り、問題の "passage" で本文を参照する（本文の訳も "translation" に入れる）',
    );
  }
  if (req.packId) lines.push(`- パックの ID: ${req.packId}（この ID を使う）`);
  if (req.extra.trim()) lines.push(`- そのほかの要望: ${req.extra.trim()}`);
  lines.push(
    '',
    '## 形式のルール',
    ...RULES.map((r) => `- ${r}`),
    '',
    '## 項目の種類',
    ...types.map((t) => `- ${t}: ${ITEM_TYPE_GUIDES[t]}`),
    '',
    '## 例（形の参考。内容はテーマに合わせる）',
    '```json',
    JSON.stringify(req.reading ? readingExample(types) : examplePack(types), null, 2),
    '```',
  );
  if (options.schema) {
    lines.push(
      '',
      '## JSON Schema（厳密な定義）',
      '```json',
      JSON.stringify(packJsonSchema()),
      '```',
    );
  }
  return lines.join('\n');
}

/** 仕様書（Markdown）。外部 AI にファイルとして渡したり、人が読んだりする */
export function buildSpecMarkdown(): string {
  const allTypes = Object.keys(ITEM_TYPE_GUIDES) as ItemType[];
  return [
    `# 教材パック形式（${PACK_FORMAT} v${PACK_VERSION}）`,
    '',
    '学習アプリ「LLLM Study」に取り込む学習教材の形式です。',
    '外部の AI（ChatGPT / Claude / Gemini など）にこのファイルを渡して、教材の JSON を作ってもらうことを想定しています。',
    '',
    '> このファイルは `src/lib/packs/spec.ts` から自動生成されます（`npm run packs`）。手で編集しないでください。',
    '',
    '## ルール',
    '',
    ...RULES.map((r) => `- ${r}`),
    '',
    '## パック全体のキー',
    '',
    '| キー | 必須 | 説明 |',
    '| --- | --- | --- |',
    `| format | ✓ | 固定値 \`"${PACK_FORMAT}"\` |`,
    `| version | ✓ | 固定値 \`${PACK_VERSION}\` |`,
    '| id | ✓ | パックの ID（英数字と `.` `_` `-`。同じ ID で取り込むと更新） |',
    '| title | ✓ | タイトル |',
    '| items | ✓ | 項目の配列（1〜5000 個） |',
    '| description |  | 説明 |',
    '| subject |  | 分野（例: english） |',
    '| language |  | `{ "target": 学ぶ言語, "explanation": 説明の言語 }`（BCP 47） |',
    '| level |  | 難易度の目安（例: CEFR A2） |',
    '| tags / author / license / source |  | タグ・作者・ライセンス・作り方や出典 |',
    '| revision |  | パックの版（更新するたびに増やす） |',
    '',
    '## 項目の種類',
    '',
    '| type | 名前 | 内容 |',
    '| --- | --- | --- |',
    ...allTypes.map((t) => `| ${t} | ${ITEM_TYPE_LABELS[t]} | ${ITEM_TYPE_GUIDES[t]} |`),
    '',
    'どの種類にも `id`（必須）・`tags`・`notes` を付けられます。',
    '',
    '## 例',
    '',
    '```json',
    JSON.stringify(examplePack(allTypes), null, 2),
    '```',
    '',
    '## JSON Schema',
    '',
    'アプリでも配信しています: `schema/study-pack.v1.schema.json`',
    '',
    '```json',
    JSON.stringify(packJsonSchema(), null, 2),
    '```',
    '',
  ].join('\n');
}
