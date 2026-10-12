import { useEffect, useRef, type RefObject } from 'react';

/** これ以上下げたら閉じる（シートの高さに対する割合と、上限の px） */
const CLOSE_RATIO = 0.2;
const CLOSE_MAX = 120;
/** 最後のひと払いの速さ（px/ms）がこれより速ければ、距離が短くても閉じる・広げる */
const FLICK_SPEED = 0.35;
/** 速さを見るのは直前のこの時間だけ（指を止めてから離したら「勢いなし」） */
const RECENT_MS = 160;
/** どちらの操作か決めるまでの遊び */
const DECIDE_PX = 6;
/** 上へこれだけ払ったら広げる */
const EXPAND_PX = 40;

const MOBILE = '(max-width: 767px)';

interface Options {
  enabled: boolean;
  sheetRef: RefObject<HTMLElement | null>;
  /** スクロールする中身（スクロールの途中は払う操作より優先する） */
  bodyRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  /** 上へ払ったとき（広げられるときだけ渡す） */
  onExpand?: () => void;
  /** 広げた状態で下へ払ったとき（閉じずに元の高さへ戻す） */
  onCollapse?: () => void;
}

/**
 * ボトムシートを指で上下に払えるようにする（スマホだけ）。
 *
 * 忘却曲線カレンダー（Forgetting-Curve-Calendar の ui/overlays.js）の実装を React 向けに移したもの:
 * - 指の操作はブラウザのスクロールと取り合いになる。先にスクロールが始まると pointercancel で
 *   打ち切られて「たまに閉じない」ので、指は touch イベントで受ける
 * - 最初のひと動き（DECIDE_PX）で「払う」か「スクロール」かを決め、決めたら最後までそのまま扱う
 * - 下へ: 引き下げた距離か最後の勢いで閉じる。足りなければ元に戻す
 * - 上へ: 広げられるシートなら広げる。それ以外はスクロールとして扱う
 * - 払ったあとに続く click は 1 回だけ止める（ボタンの上から払ってもボタンを押したことにしない）
 */
export function useSheetSwipe({
  enabled,
  sheetRef,
  bodyRef,
  onClose,
  onExpand,
  onCollapse,
}: Options): void {
  // 最新のコールバックを、イベントの登録をやり直さずに使う
  const handlers = useRef({ onClose, onExpand, onCollapse });
  useEffect(() => {
    handlers.current = { onClose, onExpand, onCollapse };
  });

  useEffect(() => {
    const sheet = sheetRef.current;
    if (!enabled || !sheet) return;

    let startY = 0;
    let recent: { y: number; at: number }[] = [];
    let delta = 0;
    let dragging = false;
    let decided: 'drag' | 'expand' | 'scroll' | null = null;
    let pointerId: number | null = null;

    const height = () => sheet.getBoundingClientRect().height || 1;
    const threshold = () => Math.min(height() * CLOSE_RATIO, CLOSE_MAX);

    const canStart = (target: EventTarget | null) => {
      if (!window.matchMedia(MOBILE).matches) return false;
      const el = target as HTMLElement | null;
      if (el?.closest?.('[data-sheet-handle], [data-sheet-header]')) return true;
      // 文字を選んだり書いたりするところは、そちらを優先する
      if (el?.closest?.('input, textarea, select, [contenteditable]')) return false;
      return (bodyRef.current?.scrollTop ?? 0) <= 0;
    };

    const swallowClick = (e: Event) => {
      e.stopPropagation();
      e.preventDefault();
    };
    const suppressNextClick = () => {
      sheet.addEventListener('click', swallowClick, true);
      setTimeout(() => sheet.removeEventListener('click', swallowClick, true), 400);
    };

    const setOffset = (y: number) => {
      sheet.style.transform = y ? `translateY(${y}px)` : '';
      sheet.style.setProperty('--sheet-backdrop', String(Math.max(0, 1 - (y / height()) * 1.2)));
    };

    const reset = () => {
      sheet.style.transition = 'transform 0.2s ease-out';
      setOffset(0);
      sheet.style.removeProperty('--sheet-backdrop');
      setTimeout(() => {
        sheet.style.transition = '';
      }, 220);
    };

    const speedNow = () => {
      const last = recent.at(-1);
      if (!last || Date.now() - last.at > RECENT_MS) return 0;
      const from = recent.find((p) => last.at - p.at <= RECENT_MS) ?? recent[0];
      const ms = last.at - from.at;
      return ms > 0 ? (last.y - from.y) / ms : 0;
    };

    const begin = (y: number) => {
      dragging = true;
      decided = null;
      delta = 0;
      startY = y;
      recent = [{ y: 0, at: Date.now() }];
    };

    /** 動いた量から操作を決めて、払う操作なら追従する。追従したら true */
    const track = (dy: number) => {
      if (decided === 'scroll') return false;
      let moved = dy;
      if (!decided) {
        if (Math.abs(moved) < DECIDE_PX) return false;
        if (moved > 0) decided = 'drag';
        else decided = handlers.current.onExpand ? 'expand' : 'scroll';
        if (decided === 'scroll') return false;
        // 決めるまでの遊びのぶんを外して、指の動きと段差が出ないようにする
        startY += moved > 0 ? DECIDE_PX : -DECIDE_PX;
        moved += moved > 0 ? -DECIDE_PX : DECIDE_PX;
      }
      if (decided === 'drag') {
        delta = Math.max(0, moved);
        setOffset(delta);
      } else {
        delta = Math.min(0, moved);
      }
      recent.push({ y: delta, at: Date.now() });
      if (recent.length > 8) recent.shift();
      return true;
    };

    const finish = () => {
      const { onClose: close, onExpand: expand, onCollapse: collapse } = handlers.current;
      if (decided === 'expand') {
        if (expand && (-delta > EXPAND_PX || speedNow() < -FLICK_SPEED)) expand();
        return;
      }
      if (delta > threshold() || speedNow() > FLICK_SPEED) {
        if (collapse) {
          // 広げていたら、閉じずに元の高さへ
          reset();
          collapse();
          return;
        }
        close();
        return;
      }
      reset();
    };

    const end = () => {
      if (!dragging) return;
      dragging = false;
      const swiped = decided === 'drag' || decided === 'expand';
      if (swiped) suppressNextClick();
      if (swiped && delta !== 0) finish();
      else if (delta !== 0) reset();
      decided = null;
    };

    /* ---- マウス（指は touch イベントで扱う） ---- */
    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'touch' || e.button !== 0 || !canStart(e.target)) return;
      pointerId = e.pointerId;
      begin(e.clientY);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!dragging || e.pointerType === 'touch' || e.pointerId !== pointerId) return;
      if (track(e.clientY - startY) && !sheet.hasPointerCapture(e.pointerId)) {
        sheet.setPointerCapture(e.pointerId);
      }
    };
    const onPointerEnd = (e: PointerEvent) => {
      if (e.pointerType === 'touch' || e.pointerId !== pointerId) return;
      if (sheet.hasPointerCapture(e.pointerId)) sheet.releasePointerCapture(e.pointerId);
      pointerId = null;
      end();
    };

    /* ---- 指 ---- */
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        end();
        return;
      }
      if (!canStart(e.target)) return;
      begin(e.touches[0].clientY);
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!dragging) return;
      if (e.touches.length !== 1) {
        end();
        return;
      }
      // 払う操作だと決めたら、ブラウザのスクロールには渡さない
      if (track(e.touches[0].clientY - startY) && e.cancelable) e.preventDefault();
    };

    sheet.addEventListener('pointerdown', onPointerDown);
    sheet.addEventListener('pointermove', onPointerMove);
    sheet.addEventListener('pointerup', onPointerEnd);
    sheet.addEventListener('pointercancel', onPointerEnd);
    sheet.addEventListener('touchstart', onTouchStart, { passive: true });
    sheet.addEventListener('touchmove', onTouchMove, { passive: false });
    sheet.addEventListener('touchend', end, { passive: true });
    sheet.addEventListener('touchcancel', end, { passive: true });
    return () => {
      sheet.removeEventListener('pointerdown', onPointerDown);
      sheet.removeEventListener('pointermove', onPointerMove);
      sheet.removeEventListener('pointerup', onPointerEnd);
      sheet.removeEventListener('pointercancel', onPointerEnd);
      sheet.removeEventListener('touchstart', onTouchStart);
      sheet.removeEventListener('touchmove', onTouchMove);
      sheet.removeEventListener('touchend', end);
      sheet.removeEventListener('touchcancel', end);
    };
  }, [enabled, sheetRef, bodyRef]);
}
