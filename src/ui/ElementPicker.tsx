/**
 * @文件 ElementPicker.tsx
 * @职责 标注模式的「选元素」阶段：整层接管指针，跟随鼠标高亮命中元素，点击即确定锚点
 *
 * 实现要点：浮层本身铺满视口接收事件，命中元素靠 elementsFromPoint 跳过浮层自身，
 * 这样既不破坏页面事件（不会误触发按钮），也能精确吸附。
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { buildAnchor, describeElement } from '../core/anchor';

export interface PickResult extends ReturnType<typeof buildAnchor> {
  element: HTMLElement;
}

export interface ElementPickerProps {
  onPick: (result: PickResult) => void;
  onCancel: () => void;
  tip?: string;
}

const ElementPicker: React.FC<ElementPickerProps> = ({ onPick, onCancel, tip }) => {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [label, setLabel] = useState('');
  const hovered = useRef<HTMLElement | null>(null);

  /** 命中当前指针下、且不属于标注浮层的最上层元素 */
  const hitTest = (x: number, y: number): HTMLElement | null => {
    const stack = document.elementsFromPoint(x, y) as HTMLElement[];
    return stack.find((el) => !el.closest('[data-annotate-layer]')) || null;
  };

  const onMove = useCallback((e: React.MouseEvent) => {
    const el = hitTest(e.clientX, e.clientY);
    hovered.current = el;
    setRect(el ? el.getBoundingClientRect() : null);
    setLabel(el ? describeElement(el) : '');
  }, []);

  const onClick = useCallback(
    (e: React.MouseEvent) => {
      const el = hitTest(e.clientX, e.clientY);
      if (!el) return;
      onPick({ ...buildAnchor(el, e.clientX, e.clientY), element: el });
    },
    [onPick],
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
      onClick={onClick}
      onContextMenu={(e) => {
        e.preventDefault();
        onCancel();
      }}
    >
      {rect && (
        <div
          className="ra-highlight"
          style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
        >
          <span className="ra-highlight__tag">{label}</span>
        </div>
      )}
      <div className="ra-tip">{tip || '点击要标注的元素 · Esc 取消'}</div>
    </div>
  );
};

export default ElementPicker;
