/**
 * 英語の語形変化（活用形）を作る。AI 例文クイズで「答えが出題した語句の活用形か」を
 * プログラムで確かめるのに使う（編集距離だけだと take と table・task を区別できないため）。
 * 規則変化はルールで作り、よく使う不規則動詞は表で持つ。それ以外は教材の forms で指定してもらう。
 */

/** 原形 → 不規則な形（過去形・過去分詞など） */
const IRREGULAR: Record<string, string[]> = {
  be: ['am', 'is', 'are', 'was', 'were', 'been', 'being'],
  have: ['has', 'had', 'having'],
  do: ['does', 'did', 'done', 'doing'],
  go: ['goes', 'went', 'gone', 'going'],
  get: ['got', 'gotten', 'getting'],
  make: ['made'],
  take: ['took', 'taken'],
  give: ['gave', 'given'],
  come: ['came'],
  see: ['saw', 'seen'],
  know: ['knew', 'known'],
  think: ['thought'],
  find: ['found'],
  tell: ['told'],
  say: ['said'],
  run: ['ran', 'running'],
  write: ['wrote', 'written'],
  bring: ['brought'],
  buy: ['bought'],
  catch: ['caught'],
  teach: ['taught'],
  leave: ['left'],
  keep: ['kept'],
  feel: ['felt'],
  put: ['putting'],
  set: ['setting'],
  let: ['letting'],
  cut: ['cutting'],
  read: [],
  pay: ['paid'],
  lay: ['laid'],
  eat: ['ate', 'eaten'],
  drink: ['drank', 'drunk'],
  speak: ['spoke', 'spoken'],
  break: ['broke', 'broken'],
  choose: ['chose', 'chosen'],
  forget: ['forgot', 'forgotten', 'forgetting'],
  begin: ['began', 'begun', 'beginning'],
  swim: ['swam', 'swum', 'swimming'],
  sing: ['sang', 'sung'],
  sit: ['sat', 'sitting'],
  stand: ['stood'],
  understand: ['understood'],
  lose: ['lost'],
  meet: ['met'],
  send: ['sent'],
  spend: ['spent'],
  build: ['built'],
  hold: ['held'],
  sell: ['sold'],
  win: ['won', 'winning'],
  hear: ['heard'],
  mean: ['meant'],
  sleep: ['slept'],
  fall: ['fell', 'fallen'],
  drive: ['drove', 'driven'],
  ride: ['rode', 'ridden'],
  rise: ['rose', 'risen'],
  wear: ['wore', 'worn'],
  throw: ['threw', 'thrown'],
  grow: ['grew', 'grown'],
  fly: ['flew', 'flown'],
  draw: ['drew', 'drawn'],
  show: ['shown'],
  become: ['became'],
  hide: ['hid', 'hidden'],
  bite: ['bit', 'bitten'],
  shake: ['shook', 'shaken'],
  wake: ['woke', 'woken'],
  steal: ['stole', 'stolen'],
  freeze: ['froze', 'frozen'],
  hang: ['hung'],
  lead: ['led'],
  feed: ['fed'],
  fight: ['fought'],
  seek: ['sought'],
  light: ['lit'],
  deal: ['dealt'],
  shoot: ['shot'],
  stick: ['stuck'],
  strike: ['struck'],
  dig: ['dug', 'digging'],
  lend: ['lent'],
  bend: ['bent'],
  hit: ['hitting'],
  hurt: [],
  cost: [],
  quit: ['quitting'],
  shut: ['shutting'],
  spread: [],
  forgive: ['forgave', 'forgiven'],
  lie: ['lay', 'lain', 'lying', 'lied'],
  die: ['dying'],
  tie: ['tying'],
  good: ['better', 'best'],
  bad: ['worse', 'worst'],
  well: ['better', 'best'],
  many: ['more', 'most'],
  much: ['more', 'most'],
  child: ['children'],
  man: ['men'],
  woman: ['women'],
  person: ['people'],
  foot: ['feet'],
  tooth: ['teeth'],
  mouse: ['mice'],
};

const VOWEL = /[aeiou]/;

/** 規則変化の形（動詞の -s/-ed/-ing、名詞の複数形、形容詞の比較級など） */
function regularForms(w: string): string[] {
  const out = [w, `${w}s`, `${w}ed`, `${w}ing`, `${w}er`, `${w}est`, `${w}ly`];
  if (/(s|x|z|ch|sh|o)$/.test(w)) out.push(`${w}es`);
  if (w.endsWith('e')) {
    const stem = w.slice(0, -1);
    out.push(`${w}d`, `${w}r`, `${w}st`, `${stem}ing`);
  }
  if (/[^aeiou]y$/.test(w)) {
    const stem = w.slice(0, -1);
    out.push(`${stem}ies`, `${stem}ied`, `${stem}ier`, `${stem}iest`, `${stem}ily`);
  }
  if (w.endsWith('ie')) out.push(`${w.slice(0, -2)}ying`);
  // 子音 + 短母音 + 子音で終わる語は最後の子音を重ねる（stop → stopped）
  if (/[^aeiou][aeiou][^aeiouwxy]$/.test(w) && VOWEL.test(w)) {
    const last = w.at(-1);
    out.push(`${w}${last}ed`, `${w}${last}ing`, `${w}${last}er`, `${w}${last}est`);
  }
  return out;
}

/** 1 語の活用形の一覧（小文字） */
export function wordForms(word: string): Set<string> {
  const w = word.toLowerCase();
  return new Set([...regularForms(w), ...(IRREGULAR[w] ?? [])]);
}

/** 英語として扱える（アルファベット・空白・ハイフン・アポストロフィだけ）か */
export function isEnglishLike(s: string): boolean {
  return /^[a-z][a-z' -]*$/i.test(s.trim());
}

/**
 * answer が target（1 語またはフレーズ）の活用形と言えるか。
 * フレーズは先頭の語だけを活用させ、残りの語は同じ順番で含まれていればよい
 * （look forward to → looking forward to、pick up → picked it up）。
 */
export function isInflectionOf(answer: string, target: string, extraForms: string[] = []): boolean {
  const a = answer.toLowerCase().trim().split(/\s+/);
  const t = target.toLowerCase().trim().split(/\s+/);
  if (!a[0] || !t[0]) return false;
  const extra = new Set(extraForms.map((f) => f.toLowerCase().trim()));
  if (extra.has(a.join(' '))) return true;
  if (!wordForms(t[0]).has(a[0]) && !extra.has(a[0])) return false;
  // 残りの語が同じ順に出てくるか（間に目的語などが入ってもよい）
  let i = 1;
  for (const word of t.slice(1)) {
    while (i < a.length && a[i] !== word) i++;
    if (i >= a.length) return false;
    i++;
  }
  return true;
}
