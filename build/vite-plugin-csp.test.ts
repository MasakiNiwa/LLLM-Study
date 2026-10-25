import { describe, expect, it } from 'vitest';
import { buildCsp, cspPlugin, inlineScripts, sha256 } from './vite-plugin-csp';

describe('CSP', () => {
  it('インラインのスクリプトだけを取り出し、ハッシュで許可する', () => {
    const html =
      '<script>a()</script><script type="module" src="./x.js"></script><script>\nb()\n</script>';
    expect(inlineScripts(html)).toEqual(['a()', '\nb()\n']);
    // ブラウザが計算するのと同じ形（sha256 を base64 で）
    expect(sha256('a()')).toMatch(/^'sha256-[A-Za-z0-9+/]+=*'$/);
  });

  it('通信先はクラウド AI とモデルの入手元だけ。eval やほかのサイトのスクリプトは許可しない', () => {
    const csp = buildCsp(["'sha256-abc'"]);
    expect(csp).toContain("connect-src 'self' https://generativelanguage.googleapis.com");
    expect(csp).toContain("script-src 'self' 'sha256-abc' 'wasm-unsafe-eval'");
    expect(csp).not.toMatch(/'unsafe-eval'/);
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(csp).toContain("object-src 'none'");
  });

  it('index.html の charset の直後に入れる', () => {
    const plugin = cspPlugin();
    const transform = plugin.transformIndexHtml as { handler: (html: string) => string };
    const out = transform.handler('<head>\n<meta charset="UTF-8" />\n<script>x()</script></head>');
    expect(out.indexOf('Content-Security-Policy')).toBeGreaterThan(out.indexOf('charset'));
    expect(out.indexOf('Content-Security-Policy')).toBeLessThan(out.indexOf('<script>'));
    expect(out).toContain(sha256('x()'));
  });
});
