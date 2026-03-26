import { useRef, useCallback } from 'react';

interface UseSwipeableTabsOptions {
  onNext: () => void;
  onPrev: () => void;
  threshold?: number; // スワイプと判定する最小距離 (px)
}

export const useSwipeableTabs = ({ onNext, onPrev, threshold = 50 }: UseSwipeableTabsOptions) => {
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;

    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;

    const diffX = touchStartX.current - touchEndX;
    const diffY = touchStartY.current - touchEndY;

    // 垂直方向のスクロールと誤判定しないよう、水平方向の移動量が垂直方向より大きい場合のみ判定
    if (Math.abs(diffX) > Math.abs(diffY)) {
      if (Math.abs(diffX) > threshold) {
        if (diffX > 0) {
          // 右から左へスワイプ (指を左へ動かす) -> 次のタブへ
          onNext();
        } else {
          // 左から右へスワイプ (指を右へ動かす) -> 前のタブへ
          onPrev();
        }
      }
    }

    touchStartX.current = null;
    touchStartY.current = null;
  }, [onNext, onPrev, threshold]);

  return {
    onTouchStart,
    onTouchEnd,
  };
};
