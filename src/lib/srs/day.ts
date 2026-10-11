/**
 * 「学習日」の計算。
 * 夜更かしして 0 時を過ぎても前日の続きとして扱えるよう、1 日の始まりの時刻（既定 4 時）をずらす。
 */

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** 端末のローカル時刻で YYYY-MM-DD */
export function formatDayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 日時が属する学習日（YYYY-MM-DD） */
export function studyDayKey(time: number | Date, dayStartHour: number): string {
  const d = new Date(typeof time === 'number' ? time : time.getTime());
  d.setHours(d.getHours() - dayStartHour);
  return formatDayKey(d);
}

/** YYYY-MM-DD をローカル時刻の Date（その日の 0 時）にする */
export function parseDayKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** 学習日の始まりの時刻（エポックミリ秒） */
export function studyDayStart(key: string, dayStartHour: number): number {
  const d = parseDayKey(key);
  d.setHours(dayStartHour, 0, 0, 0);
  return d.getTime();
}

/** 学習日の終わり（次の学習日の始まり）の時刻 */
export function studyDayEnd(key: string, dayStartHour: number): number {
  const d = parseDayKey(key);
  d.setDate(d.getDate() + 1);
  d.setHours(dayStartHour, 0, 0, 0);
  return d.getTime();
}

/** key に days 日を足した学習日 */
export function addDays(key: string, days: number): string {
  const d = parseDayKey(key);
  d.setDate(d.getDate() + days);
  return formatDayKey(d);
}

/** 2 つの学習日の差（b - a の日数） */
export function diffDays(a: string, b: string): number {
  return Math.round((parseDayKey(b).getTime() - parseDayKey(a).getTime()) / 86_400_000);
}

/**
 * 連続学習日数。today に学習していなくても、昨日まで続いていれば途切れていない扱いにする。
 * days: 学習した日の集合
 */
export function computeStreak(days: Set<string>, today: string): number {
  let cursor = days.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (days.has(cursor)) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}
