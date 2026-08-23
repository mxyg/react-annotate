/**
 * @文件 AnnotationBoard.tsx
 * @职责 标注看板：四列（待处理/进行中/已完成/不做了）拖拽流转，卡片带截图缩略图与关键字段
 *
 * 纯受控组件——数据与持久化都由宿主给，包内不发请求。拖拽用原生 HTML5 DnD。
 * 拖拽预览用 portal 挂到 body：宿主页面若有 overflow + sticky 顶栏，浏览器默认 ghost 会被裁切/遮挡。
 */
import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { AnnotationPin, PinStatus } from '../types';

export const BOARD_COLUMNS: Array<{ key: PinStatus; title: string }> = [
  { key: 'OPEN', title: '待处理' },
  { key: 'DOING', title: '进行中' },
  { key: 'DONE', title: '已完成' },
  { key: 'DROPPED', title: '不做了' },
];

const PRIORITY_TEXT: Record<string, string> = {
  URGENT: '紧急',
  HIGH: '高',
  NORMAL: '常规',
  LOW: '低',
};

export interface AnnotationBoardProps {
  pins: AnnotationPin[];
  onMove?: (pin: AnnotationPin, status: PinStatus) => void;
  onOpen?: (pin: AnnotationPin) => void;
  renderCardExtra?: (pin: AnnotationPin) => React.ReactNode;
}

type GhostState = { pin: AnnotationPin; x: number; y: number; w: number; ox: number; oy: number };

const PinCardBody: React.FC<{ pin: AnnotationPin; extra?: React.ReactNode }> = ({ pin, extra }) => {
  const now = Date.now();
  const overdue = pin.dueAt && new Date(pin.dueAt).getTime() < now && pin.status !== 'DONE';
  const reports = pin.reportCount && pin.reportCount > 1 ? pin.reportCount : 0;
  return (
    <>
      {pin.shotUrl && <img className="ra-card__thumb" src={pin.shotUrl} alt="" loading="lazy" />}
      <div className="ra-card__title">
        #{pin.seq} {pin.title}
        {reports > 0 && (
          <span className="ra-tag ra-tag--count" title={`同一问题被提交 ${reports} 次`}>
            ×{reports}
          </span>
        )}
      </div>
      <div className="ra-card__meta">
        <span className={`ra-tag ra-tag--${pin.priority}`}>{PRIORITY_TEXT[pin.priority] || pin.priority}</span>
        {pin.kind === 'FEEDBACK' && <span className="ra-tag">用户反馈</span>}
        <span className="ra-tag">{pin.assigneeName || '未指派'}</span>
        {pin.dueAt && (
          <span className={`ra-tag${overdue ? ' ra-tag--overdue' : ''}`}>
            {new Date(pin.dueAt).toLocaleDateString()}
          </span>
        )}
        {pin.labels?.map((l) => (
          <span key={l} className="ra-tag">{l}</span>
        ))}
      </div>
      <div className="ra-card__meta" style={{ marginTop: 4 }}>
        <span>{pin.authorName} 标注</span>
        <span>{pin.routePattern}</span>
        {!!pin.commentCount && <span>💬 {pin.commentCount}</span>}
      </div>
      {extra}
    </>
  );
};

const AnnotationBoard: React.FC<AnnotationBoardProps> = ({ pins, onMove, onOpen, renderCardExtra }) => {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);
  const [ghost, setGhost] = useState<GhostState | null>(null);

  const grouped = useMemo(() => {
    const map: Record<string, AnnotationPin[]> = { OPEN: [], DOING: [], DONE: [], DROPPED: [] };
    pins.forEach((p) => (map[p.status] || (map[p.status] = [])).push(p));
    return map;
  }, [pins]);

  const endDrag = () => {
    setOverCol(null);
    setDragId(null);
    setGhost(null);
  };

  return (
    <div className="ra-board">
      {BOARD_COLUMNS.map((col) => {
        const list = grouped[col.key] || [];
        return (
          <div
            key={col.key}
            className={`ra-board__col ra-board__col--${col.key}${overCol === col.key ? ' ra-board__col--over' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setOverCol(col.key);
              if (e.clientX || e.clientY) {
                setGhost((g) => (g ? { ...g, x: e.clientX, y: e.clientY } : g));
              }
            }}
            onDragLeave={() => setOverCol((c) => (c === col.key ? null : c))}
            onDrop={() => {
              const pin = pins.find((p) => p.id === dragId);
              endDrag();
              if (pin && pin.status !== col.key) onMove?.(pin, col.key);
            }}
          >
            <div className="ra-board__head">
              <span>{col.title}</span>
              <span className="ra-tag">{list.length}</span>
            </div>
            <div className="ra-board__well">
              {list.length === 0 && <div className="ra-board__empty">把卡片拖到这里</div>}
              {list.map((pin) => (
                <div
                  key={pin.id}
                  className={`ra-card${dragId === pin.id ? ' ra-card--dragging' : ''}`}
                  draggable
                  onDragStart={(e) => {
                    setDragId(pin.id);
                    const r = e.currentTarget.getBoundingClientRect();
                    setGhost({
                      pin,
                      x: e.clientX,
                      y: e.clientY,
                      w: r.width,
                      ox: e.clientX - r.left,
                      oy: e.clientY - r.top,
                    });
                    e.dataTransfer.setData('text/plain', pin.id);
                    e.dataTransfer.effectAllowed = 'move';
                    const blank = document.createElement('canvas');
                    blank.width = 1;
                    blank.height = 1;
                    blank.style.position = 'fixed';
                    blank.style.left = '-9999px';
                    document.body.appendChild(blank);
                    e.dataTransfer.setDragImage(blank, 0, 0);
                    requestAnimationFrame(() => blank.remove());
                  }}
                  onDrag={(e) => {
                    if (!e.clientX && !e.clientY) return;
                    setGhost((g) => (g ? { ...g, x: e.clientX, y: e.clientY } : g));
                  }}
                  onDragEnd={endDrag}
                  onClick={() => onOpen?.(pin)}
                >
                  <PinCardBody pin={pin} extra={renderCardExtra?.(pin)} />
                </div>
              ))}
            </div>
          </div>
        );
      })}
      {ghost &&
        createPortal(
          <div
            className="ra-card ra-card--ghost"
            style={{
              width: ghost.w,
              left: ghost.x - ghost.ox,
              top: ghost.y - ghost.oy,
            }}
          >
            <PinCardBody pin={ghost.pin} extra={renderCardExtra?.(ghost.pin)} />
          </div>,
          document.body,
        )}
    </div>
  );
};

export default AnnotationBoard;
