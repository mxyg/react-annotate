/**
 * @文件 PinBubbles.tsx
 * @职责 把本页已有标注还原成页面上的气泡：按选择器定位元素 + 元素内相对坐标定位气泡
 *
 * 选择器失效（页面改版）时该气泡不渲染——与其飘在错误的位置误导人，不如让它只留在看板里。
 */
import React, { useEffect, useState } from 'react';
import { resolveSelector } from '../core/anchor';
import type { AnnotationPin } from '../types';

export interface PinBubblesProps {
  pins: AnnotationPin[];
  onOpen?: (pin: AnnotationPin) => void;
}

const PinBubbles: React.FC<PinBubblesProps> = ({ pins, onOpen }) => {
  const [, force] = useState(0);

  // 滚动/缩放/布局变化都会让锚点位移，统一用 rAF 节流后重算
  useEffect(() => {
    let raf = 0;
    const onAny = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => force((n) => n + 1));
    };
    window.addEventListener('scroll', onAny, true);
    window.addEventListener('resize', onAny);
    const timer = window.setInterval(onAny, 1000); // 兜底：异步渲染出来的内容不触发上面两个事件
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onAny, true);
      window.removeEventListener('resize', onAny);
      window.clearInterval(timer);
    };
  }, []);

  return (
    <div className="ra-layer ra-layer--pass" data-annotate-layer="bubbles">
      {pins.map((pin) => {
        const el = resolveSelector(pin.selector);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        if (!r.width && !r.height) return null;
        const left = r.left + r.width * pin.anchorX;
        const top = r.top + r.height * pin.anchorY;
        if (top < 0 || top > window.innerHeight || left < 0 || left > window.innerWidth) return null;
        return (
          <div
            key={pin.id}
            className={`ra-pin ra-pin--${pin.kind === 'FEEDBACK' ? 'FEEDBACK' : pin.status}`}
            style={{ left, top, pointerEvents: 'auto' }}
            title={`#${pin.seq} ${pin.title}（${pin.authorName}）`}
            onClick={() => onOpen?.(pin)}
          >
            {pin.seq}
          </div>
        );
      })}
    </div>
  );
};

export default PinBubbles;
