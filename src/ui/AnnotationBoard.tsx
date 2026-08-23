/**
 * @文件 AnnotationBoard.tsx
 * @职责 标注看板：四列（待处理/进行中/已完成/不做了）拖拽流转，卡片带截图缩略图与关键字段
 *
 * 纯受控组件——数据与持久化都由宿主给，包内不发请求。这样同一个看板既能接本项目后端，
 * 也能接别人的任意后端。拖拽用原生 HTML5 DnD，不引第三方拖拽库，保持零依赖。
 */
import React, { useMemo, useState } from 'react';
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

const AnnotationBoard: React.FC<AnnotationBoardProps> = ({ pins, onMove, onOpen, renderCardExtra }) => {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const map: Record<string, AnnotationPin[]> = { OPEN: [], DOING: [], DONE: [], DROPPED: [] };
    pins.forEach((p) => (map[p.status] || (map[p.status] = [])).push(p));
    return map;
  }, [pins]);

  const now = Date.now();

  return (
    <div className="ra-board">
      {BOARD_COLUMNS.map((col) => (
        <div
          key={col.key}
          className={`ra-board__col${overCol === col.key ? ' ra-board__col--over' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setOverCol(col.key);
          }}
          onDragLeave={() => setOverCol((c) => (c === col.key ? null : c))}
          onDrop={() => {
            const pin = pins.find((p) => p.id === dragId);
            setOverCol(null);
            setDragId(null);
            if (pin && pin.status !== col.key) onMove?.(pin, col.key);
          }}
        >
          <div className="ra-board__head">
            <span>{col.title}</span>
            <span className="ra-tag">{(grouped[col.key] || []).length}</span>
          </div>
          {(grouped[col.key] || []).length === 0 && (
            <div className="ra-board__empty">把卡片拖到这里</div>
          )}
          {(grouped[col.key] || []).map((pin) => {
            const overdue = pin.dueAt && new Date(pin.dueAt).getTime() < now && pin.status !== 'DONE';
            const reports = pin.reportCount && pin.reportCount > 1 ? pin.reportCount : 0;
            return (
              <div
                key={pin.id}
                className="ra-card"
                draggable
                onDragStart={() => setDragId(pin.id)}
                onDragEnd={() => setDragId(null)}
                onClick={() => onOpen?.(pin)}
              >
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
                {renderCardExtra?.(pin)}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
};

export default AnnotationBoard;
