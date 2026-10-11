import { memo, useMemo } from 'react';
import ReactMarkdown, { type Components, type Options } from 'react-markdown';
import remarkCjkFriendly from 'remark-cjk-friendly';
import remarkGfm from 'remark-gfm';
import { splitMarkdownBlocks } from './splitBlocks';

// remark-cjk-friendly: 「**「強調」**です」のような日本語の括弧と ** の組み合わせでも太字にする
const remarkPlugins: Options['remarkPlugins'] = [remarkGfm, remarkCjkFriendly];

const components: Components = {
  a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
};

const Block = memo(function Block({ text }: { text: string }) {
  return (
    <ReactMarkdown remarkPlugins={remarkPlugins} components={components}>
      {text}
    </ReactMarkdown>
  );
});

/**
 * ブロック単位でメモ化した Markdown レンダラー。
 * 生成中でも変化した末尾ブロックだけを再パースするため、長文でも軽い。
 */
export default function Markdown({ text }: { text: string }) {
  const blocks = useMemo(() => splitMarkdownBlocks(text), [text]);
  return (
    <>
      {blocks.map((b, i) => (
        <Block key={i} text={b} />
      ))}
    </>
  );
}
