/**
 * Markdown を「空行で区切られたブロック」に分割する。
 * コードフェンス（``` / ~~~）の内側は分割しない。
 *
 * ストリーミング中は最後のブロックだけが変化するため、
 * ブロック単位でメモ化すれば再パースは末尾のみで済む。
 */
export function splitMarkdownBlocks(text: string): string[] {
  const lines = text.split('\n');
  const blocks: string[] = [];
  let current: string[] = [];
  let fence: string | null = null;

  const push = () => {
    if (current.length > 0) {
      blocks.push(current.join('\n'));
      current = [];
    }
  };

  for (const line of lines) {
    const m = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (m) {
      const marker = m[1];
      if (fence === null) {
        fence = marker;
      } else if (marker[0] === fence[0] && marker.length >= fence.length) {
        fence = null;
      }
      current.push(line);
      continue;
    }
    if (fence === null && line.trim() === '') {
      push();
      continue;
    }
    current.push(line);
  }
  push();
  return blocks;
}
