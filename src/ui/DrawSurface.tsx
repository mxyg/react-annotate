/**
 * @文件 DrawSurface.tsx
 * @职责 在截图上手绘：画笔 / 箭头 / 矩形 / 椭圆 / 文字，输出归一化坐标的图元数组
 *
 * 用 SVG 而不是 canvas：图元始终是可编辑的数据（能撤销、能改色、能在看板里重绘），
 * 而 canvas 一落笔就成了像素，改不了也导不出结构。
 */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import type { DrawShape } from '../types';

export const DRAW_COLORS = ['#e5484d', '#f5a524', '#2f6fed', '#12a594', '#1f2329'];

export interface DrawSurfaceProps {
  shotUrl?: string | null;
  shapes: DrawShape[];
  onChange?: (shapes: DrawShape[]) => void;
  readOnly?: boolean;
  tool?: DrawShape['type'];
  color?: string;
  width?: number;
}

/** 归一化坐标 → SVG 坐标（viewBox 固定 0~1000，避免依赖真实像素尺寸） */
const S = 1000;
const toPath = (pts: number[]) =>
  pts.length < 4
    ? ''
    : pts.reduce((acc, v, i) => (i % 2 === 0 ? `${acc}${i === 0 ? 'M' : 'L'}${v * S} ` : `${acc}${v * S} `), '');

const DrawSurface: React.FC<DrawSurfaceProps> = ({
  shotUrl,
  shapes,
  onChange,
  readOnly,
  tool = 'pen',
  color = DRAW_COLORS[0],
  width = 3,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [drafting, setDrafting] = useState<DrawShape | null>(null);

  const rel = useCallback((e: React.PointerEvent): [number, number] => {
    const box = svgRef.current!.getBoundingClientRect();
    return [
      Math.min(1, Math.max(0, (e.clientX - box.left) / box.width)),
      Math.min(1, Math.max(0, (e.clientY - box.top) / box.height)),
    ];
  }, []);

  const onDown = (e: React.PointerEvent) => {
    if (readOnly) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const [x, y] = rel(e);
    if (tool === 'text') {
      const text = window.prompt('标注文字');
      if (text) onChange?.([...shapes, { type: 'text', points: [x, y], text, color, width }]);
      return;
    }
    setDrafting({ type: tool, points: [x, y, x, y], color, width });
  };

  const onMove = (e: React.PointerEvent) => {
    if (!drafting) return;
    const [x, y] = rel(e);
    setDrafting((d) =>
      !d ? d : { ...d, points: d.type === 'pen' ? [...d.points, x, y] : [d.points[0], d.points[1], x, y] },
    );
  };

  const onUp = () => {
    if (!drafting) return;
    const p = drafting.points;
    // 手抖点一下不算一笔：起止距离过小直接丢弃，否则截图上会积一堆小点
    const moved = drafting.type === 'pen' ? p.length > 6 : Math.hypot(p[2] - p[0], p[3] - p[1]) > 0.01;
    if (moved) onChange?.([...shapes, drafting]);
    setDrafting(null);
  };

  const all = useMemo(() => (drafting ? [...shapes, drafting] : shapes), [shapes, drafting]);

  return (
    <div className="ra-canvas-stage">
      {shotUrl ? <img src={shotUrl} alt="标注截图" draggable={false} /> : <div className="ra-noshot">（无截图，仅记录元素位置）</div>}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${S} ${S}`}
        preserveAspectRatio="none"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={onUp}
        style={readOnly ? { pointerEvents: 'none' } : undefined}
      >
        <defs>
          {DRAW_COLORS.map((c) => (
            <marker key={c} id={`ra-arrow-${c.slice(1)}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M0,0 L10,5 L0,10 z" fill={c} />
            </marker>
          ))}
        </defs>
        {all.map((s, i) => {
          const stroke = s.color || DRAW_COLORS[0];
          const sw = (s.width || 3) * 1.5;
          const [x1, y1, x2, y2] = s.points;
          if (s.type === 'pen') return <path key={i} d={toPath(s.points)} fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />;
          if (s.type === 'arrow')
            return <line key={i} x1={x1 * S} y1={y1 * S} x2={x2 * S} y2={y2 * S} stroke={stroke} strokeWidth={sw} markerEnd={`url(#ra-arrow-${stroke.slice(1)})`} />;
          if (s.type === 'rect')
            return <rect key={i} x={Math.min(x1, x2) * S} y={Math.min(y1, y2) * S} width={Math.abs(x2 - x1) * S} height={Math.abs(y2 - y1) * S} fill="none" stroke={stroke} strokeWidth={sw} />;
          if (s.type === 'ellipse')
            return <ellipse key={i} cx={((x1 + x2) / 2) * S} cy={((y1 + y2) / 2) * S} rx={(Math.abs(x2 - x1) / 2) * S} ry={(Math.abs(y2 - y1) / 2) * S} fill="none" stroke={stroke} strokeWidth={sw} />;
          return (
            <text key={i} x={x1 * S} y={y1 * S} fill={stroke} fontSize={22 * (s.width || 3) / 3} style={{ paintOrder: 'stroke' }} stroke="#fff" strokeWidth={4}>
              {s.text}
            </text>
          );
        })}
      </svg>
    </div>
  );
};

export default DrawSurface;
