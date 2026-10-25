/**
 * Server-Sent Events（text/event-stream）を 1 件ずつ読み取る。
 * クラウド AI のストリーミング応答（data: {json}）に使う。
 */
export async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      // イベントは空行で区切られる（改行は \n でも \r\n でもよい）
      let sep: RegExpExecArray | null;
      while ((sep = /\r?\n\r?\n/.exec(buf))) {
        const event = buf.slice(0, sep.index);
        buf = buf.slice(sep.index + sep[0].length);
        const data = eventData(event);
        if (data !== null) yield data;
      }
    }
    buf += decoder.decode();
    const rest = eventData(buf);
    if (rest !== null) yield rest;
  } finally {
    reader.releaseLock();
  }
}

/** 1 件のイベントの data 行をつなげる（data が無ければ null） */
function eventData(event: string): string | null {
  const lines = event
    .split(/\r?\n/)
    .filter((l) => l.startsWith('data:'))
    .map((l) => l.slice(5).replace(/^ /, ''));
  return lines.length ? lines.join('\n') : null;
}
