/**
 * @文件 ElementPicker.tsx
 * @职责 选元素或拖出框选：单击吸附控件；拖动超过阈值则视为截图区域（不走选择器）
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { buildAnchor, describeElement } from '../core/anchor';
import type { CaptureClip } from '../core/capture';

export interface PickResult extends ReturnType<typeof buildAnchor> {
  element: HTMLElement;
}

export interface ElementPickerProps {
  /** 是否采集 DOM 片段与源码位置（默认采集；对外站点可关掉） */
  collectSource?: boolean;
  onPick: (result: PickResult) => void;
  /** 拖动框选：截当前框，不使用元素选择器 */
  onRegion?: (clip: CaptureClip) => void;
  onCancel: () => void;
  tip?: string;
}

const DRAG_PX = 8;

const ElementPicker: React.FC<ElementPickerProps> = ({ onPick, onRegion, onCancel, tip, collectSource = true }) => {
  const [hover, setHover] = useState<DOMRect | null>(null);
  const [label, setLabel] = useState('');
  const [marquee, setMarquee] = useState<CaptureClip | null>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const dragged = useRef(false);

  const hitTest = (x: number, y: number): HTMLElement | null => {
    const stack = document.elementsFromPoint(x, y) as HTMLElement[];
    return stack.find((el) => !el.closest('[data-annotate-layer]')) || null;
  };

  const onMove = useCallback((e: React.MouseEvent) => {
    if (drag.current) {
      const x = Math.min(drag.current.x, e.clientX);
      const y = Math.min(drag.current.y, e.clientY);
      const width = Math.abs(e.clientX - drag.current.x);
      const height = Math.abs(e.clientY - drag.current.y);
      if (width >= DRAG_PX || height >= DRAG_PX) {
        dragged.current = true;
        setMarquee({ x, y, width, height });
        setHover(null);
      }
      return;
    }
    const el = hitTest(e.clientX, e.clientY);
    setHover(el ? el.getBoundingClientRect() : null);
    setLabel(el ? describeElement(el) : '');
  }, []);

  const onDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY };
    dragged.current = false;
  }, []);

  const onUp = useCallback(
    (e: React.MouseEvent) => {
      if (!drag.current) return;
      const start = drag.current;
      drag.current = null;
      if (dragged.current && onRegion) {
        const x = Math.min(start.x, e.clientX);
        const y = Math.min(start.y, e.clientY);
        const width = Math.max(DRAG_PX, Math.abs(e.clientX - start.x));
        const height = Math.max(DRAG_PX, Math.abs(e.clientY - start.y));
        setMarquee(null);
        onRegion({ x, y, width, height });
        return;
      }
      setMarquee(null);
      const el = hitTest(e.clientX, e.clientY);
      if (!el) return;
      onPick({ ...buildAnchor(el, e.clientX, e.clientY, collectSource), element: el });
    },
    [onPick, onRegion],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div
      data-annotate-layer="pick"
      className="ra-layer ra-layer--pick"
      onMouseMove={onMove}
      onMouseDown={onDown}
      onMouseUp={onUp}
      onContextMenu={(e) => {
        e.preventDefault();
        onCancel();
      }}
    >
      {!marquee && hover && (
        <div
          className="ra-highlight"
          style={{ left: hover.left, top: hover.top, width: hover.width, height: hover.height }}
        >
          <span className="ra-highlight__tag">{label}</span>
        </div>
      )}
      {marquee && (
        <div
          className="ra-marquee"
          style={{ left: marquee.x, top: marquee.y, width: marquee.width, height: marquee.height }}
        />
      )}
      <div className="ra-tip">{tip || '点击选控件 · 拖动框选截图 · Esc 取消'}</div>
    </div>
  );
};

export default ElementPicker;
