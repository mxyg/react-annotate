/**
 * @文件 PinComposer.tsx
 * @职责 标注卡片编辑器：左侧截图+手绘工具条，右侧卡片字段（标题/描述/优先级/时间/指派/标签）
 *
 * mode=feedback 时右侧只留标题与问题描述——让用户填优先级和指派人没有意义，
 * 反馈进看板后由处理人补齐这些字段。
 */
import React, { useEffect, useMemo, useState } from 'react';
import DrawSurface, { DRAW_COLORS } from './DrawSurface';
import type { AnnotateMode, AssignableUser, DrawShape, PinAnchor, PinDraft, PinPriority } from '../types';

const TOOLS: Array<{ key: DrawShape['type']; label: string; hint: string }> = [
  { key: 'pen', label: '✎', hint: '画笔' },
  { key: 'arrow', label: '↗', hint: '箭头' },
  { key: 'rect', label: '▭', hint: '矩形' },
  { key: 'ellipse', label: '◯', hint: '椭圆' },
  { key: 'text', label: 'T', hint: '文字' },
];

const PRIORITIES: Array<{ v: PinPriority; t: string }> = [
  { v: 'URGENT', t: '紧急' },
  { v: 'HIGH', t: '高' },
  { v: 'NORMAL', t: '常规' },
  { v: 'LOW', t: '有空再说' },
];

export interface PinComposerProps {
  anchor: PinAnchor;
  shotUrl?: string | null;
  shotKey?: string | null;
  mode: AnnotateMode;
  authorName?: string;
  assignees?: AssignableUser[];
  submitting?: boolean;
  onRecapture?: () => void;
  onSubmit: (draft: PinDraft) => void;
  onCancel: () => void;
  /** 主按钮文案；默认「加入看板」。联系我们圈选应改成「添加到这条反馈」 */
  submitLabel?: string;
  /** 覆盖默认说明。不传则提示「重复提交会计入已有卡」 */
  hint?: string;
}

const PinComposer: React.FC<PinComposerProps> = ({
  anchor,
  shotUrl,
  shotKey,
  mode,
  authorName,
  assignees = [],
  submitting,
  onRecapture,
  onSubmit,
  onCancel,
  submitLabel,
  hint,
}) => {
  // 标题默认取选中元素描述——用户想改随时改，但空标题的卡片在看板里没法认
  const [title, setTitle] = useState(() => anchor.elementLabel.replace(/（[^）]*）$/, '').slice(0, 60));
  const [body, setBody] = useState('');
  const [priority, setPriority] = useState<PinPriority>('NORMAL');
  const [dueAt, setDueAt] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [labelText, setLabelText] = useState('');
  const [shapes, setShapes] = useState<DrawShape[]>([]);
  const [tool, setTool] = useState<DrawShape['type']>('pen');
  const [color, setColor] = useState(DRAW_COLORS[0]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const labels = useMemo(
    () => labelText.split(/[,，\s]+/).map((s) => s.trim()).filter(Boolean),
    [labelText],
  );

  const submit = () => {
    if (submitting) return;
    onSubmit({
      ...anchor,
      title: title.trim(),
      body: body.trim(),
      kind: mode === 'feedback' ? 'FEEDBACK' : 'TASK',
      priority: mode === 'feedback' ? 'NORMAL' : priority,
      labels,
      dueAt: dueAt || null,
      assigneeId: assigneeId || null,
      shotUrl: shotUrl || null,
      shotKey: shotKey || null,
      drawing: shapes,
    });
  };

  return (
    <div className="ra-modal" data-annotate-layer="composer">
      <div className="ra-panel">
        <div className="ra-panel__left">
          <div className="ra-toolbar">
            {TOOLS.map((t) => (
              <button
                key={t.key}
                type="button"
                title={t.hint}
                className={`ra-tool${tool === t.key ? ' ra-tool--on' : ''}`}
                onClick={() => setTool(t.key)}
              >
                {t.label}
              </button>
            ))}
            <span style={{ width: 8 }} />
            {DRAW_COLORS.map((c) => (
              <span
                key={c}
                className={`ra-swatch${color === c ? ' ra-swatch--on' : ''}`}
                style={{ background: c }}
                onClick={() => setColor(c)}
              />
            ))}
            <span style={{ flex: 1 }} />
            <button type="button" className="ra-tool" disabled={!shapes.length} onClick={() => setShapes((s) => s.slice(0, -1))}>
              撤销
            </button>
            <button type="button" className="ra-tool" disabled={!shapes.length} onClick={() => setShapes([])}>
              清空
            </button>
            {onRecapture && (
              <button type="button" className="ra-tool" onClick={onRecapture}>
                重新截图
              </button>
            )}
          </div>
          <div className="ra-canvas-wrap">
            <DrawSurface shotUrl={shotUrl} shapes={shapes} onChange={setShapes} tool={tool} color={color} />
          </div>
          {/* 源码位置放首位并默认展开，选择器与 DOM 片段收进折叠：
              定位一个问题真正有用的是「哪个文件第几行」，一屏 div 嵌套只会淹没它 */}
          {(anchor.snippet || anchor.sourceLoc || anchor.selector) && (
            <div className="ra-snippet-wrap">
              {anchor.sourceLoc && <div className="ra-snippet__loc">{anchor.sourceLoc}</div>}
              {(anchor.selector || anchor.snippet) && (
                <details className="ra-snippet__more">
                  <summary>DOM 定位</summary>
                  {anchor.selector && <div className="ra-snippet__sel">{anchor.selector}</div>}
                  {anchor.snippet && <pre className="ra-snippet">{anchor.snippet}</pre>}
                </details>
              )}
            </div>
          )}
        </div>

        <div className="ra-panel__right">
          <div className="ra-form">
            <div className="ra-field">
              <label>标题</label>
              <input className="ra-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="一句话说清要改什么" />
            </div>
            <div className="ra-field">
              <label>{mode === 'feedback' ? '问题描述' : '说明'}</label>
              <textarea
                className="ra-textarea"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={mode === 'feedback' ? '这里哪里不对、期望是什么样' : '要怎么改 / 背景'}
              />
            </div>

            {mode === 'full' && (
              <>
                <div className="ra-field">
                  <label>优先级</label>
                  <select className="ra-select" value={priority} onChange={(e) => setPriority(e.target.value as PinPriority)}>
                    {PRIORITIES.map((p) => (
                      <option key={p.v} value={p.v}>{p.t}</option>
                    ))}
                  </select>
                </div>
                <div className="ra-field">
                  <label>期望完成</label>
                  <input className="ra-input" type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
                </div>
                <div className="ra-field">
                  <label>谁来做</label>
                  <select className="ra-select" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
                    <option value="">暂不指派</option>
                    {assignees.map((a) => (
                      <option key={a.id} value={a.id}>{a.name || a.email || a.id}</option>
                    ))}
                  </select>
                </div>
                <div className="ra-field">
                  <label>标签（逗号分隔）</label>
                  <input className="ra-input" value={labelText} onChange={(e) => setLabelText(e.target.value)} placeholder="如：体验,文案" />
                </div>
              </>
            )}

            <div className="ra-meta">
              标注人：{authorName || '当前账号'}
              <br />
              位置：{anchor.routePattern} · {anchor.elementLabel}
              <br />
              {hint || '同一处界面或同一段描述再次提交时，会计入已有卡片的次数，不会再开一张卡。'}
            </div>
          </div>
          <div className="ra-actions">
            <button type="button" className="ra-btn" onClick={onCancel}>取消</button>
            <button type="button" className="ra-btn ra-btn--primary" disabled={submitting} onClick={submit}>
              {submitting ? '提交中…' : submitLabel || '加入看板'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PinComposer;
