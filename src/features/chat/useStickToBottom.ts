import { useCallback, useEffect, useRef, useState } from 'react';

const THRESHOLD_PX = 80;

/**
 * チャットの自動スクロール。
 * 末尾付近にいる間は内容が増えても末尾に追従し、ユーザーが上にスクロールしたら追従をやめる。
 */
export function useStickToBottom<T extends HTMLElement, C extends HTMLElement>() {
  const scrollRef = useRef<T>(null);
  const contentRef = useRef<C>(null);
  const stickRef = useRef(true);
  const [atBottom, setAtBottom] = useState(true);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const el = scrollRef.current;
    if (!el) return;
    stickRef.current = true;
    setAtBottom(true);
    el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    const content = contentRef.current;
    if (!el || !content) return;

    let lastTop = el.scrollTop;
    const onScroll = () => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      // 上方向へのスクロールだけを「追従解除」とみなす（内容増加による変化と区別）
      if (el.scrollTop < lastTop - 2 && distance > THRESHOLD_PX) stickRef.current = false;
      else if (distance <= THRESHOLD_PX) stickRef.current = true;
      lastTop = el.scrollTop;
      setAtBottom(distance <= THRESHOLD_PX);
    };
    const ro = new ResizeObserver(() => {
      if (stickRef.current) {
        el.scrollTop = el.scrollHeight;
        lastTop = el.scrollTop;
      }
    });
    el.addEventListener('scroll', onScroll, { passive: true });
    ro.observe(content);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', onScroll);
      ro.disconnect();
    };
  }, []);

  return { scrollRef, contentRef, atBottom, scrollToBottom };
}
