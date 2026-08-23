/**
 * @文件 AnnotateLauncher.tsx
 * @职责 标注入口与状态机：待机 → 选元素 → 截图 → 编辑卡片 → 提交，外加本页气泡与快捷键
 *
 * 截图时机刻意放在「选完元素之后」：先选后截，浮层还没盖上去，截出来就是用户当时看到的画面；
 * 反过来先截再选，用户会对着一张静止图去选元素，锚点和真实 DOM 容易对不上。
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import ElementPicker, { type PickResult } from './ElementPicker';
import PinComposer from './PinComposer';
import PinBubbles from './PinBubbles';
import { afterPaint, captureToBlob, clipFromElement, type CaptureClip, type CaptureOptions } from '../core/capture';
import { buildRegionAnchor } from '../core/anchor';
import { useAnnotate } from '../context';
import type { AnnotateSubmitKind, AnnotationPin, PinAnchor, PinDraft } from '../types';

export interface AnnotateLauncherProps {
  /** 触发标注模式的快捷键，默认 Alt+A；传 null 关闭快捷键 */
  hotkey?: string | null;
  /** 是否显示右下角浮动按钮 */
  fab?: boolean;
  /**
   * 外部触发标注：每次数值变化即进入「选元素」阶段。
   * 用数值而不是布尔，是为了让「再点一次」也能重新触发，不必先复位。
   */
  openSignal?: number;
  fabText?: string;
  /** 打开已有标注（宿主通常跳看板详情） */
  onOpenPin?: (pin: AnnotationPin) => void;
  onSubmitted?: (pin: AnnotationPin) => void;
  /**
   * pin（默认）建看板卡；collect 只把圈选结果交回，不调 createPin。
   * 联系我们要用圈选截图当附件，不能一提交就进内部看板。
   */
  submitKind?: AnnotateSubmitKind;
  onCollected?: (draft: PinDraft) => void;
  /** 看板页关掉气泡，避免超高 z-index 浮层盖住拖拽预览 */
  showBubbles?: boolean;
}

type Stage = 'idle' | 'picking' | 'shooting' | 'composing';

/** 截图硬超时：超过就放弃截图直接进编辑器，绝不把用户留在无 UI 的截图态 */
const CAPTURE_TIMEOUT_MS = 8000;

const AnnotateLauncher: React.FC<AnnotateLauncherProps> = ({
  hotkey = 'alt+a',
  fab = true,
  openSignal,
  fabText = '标注',
  onOpenPin,
  onSubmitted,
  submitKind = 'pin',
  onCollected,
  showBubbles = true,
}) => {
  const { adapter, mode, collectSource, pins, assignees, onCreated } = useAnnotate();
  const [stage, setStage] = useState<Stage>('idle');
  const [anchor, setAnchor] = useState<PinAnchor | null>(null);
  const [shot, setShot] = useState<{ url: string; key: string } | null>(null);
  const [localShotUrl, setLocalShotUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const objectUrl = useRef<string | null>(null);
  const lastClip = useRef<CaptureOptions['clip']>('viewport');

  const cleanup = useCallback(() => {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = null;
    setLocalShotUrl(null);
    setShot(null);
    setAnchor(null);
    setStage('idle');
  }, []);

  /**
   * 先卸掉圈选浮层再截；点选裁元素框，拖选裁拖出的框。
   *
   * 截图阶段界面上不留任何浮层（见下方 render 注释），所以这一步**绝不能没有出口**：
   * 截图卡住就等于整个页面上什么都没有、也退不出去。故加硬超时，超时就当没截到，
   * 照常进编辑器——只保留元素锚点，比让人对着卡死的界面强。
   */
  const shoot = useCallback(async (clip: CaptureOptions['clip'] = lastClip.current) => {
    lastClip.current = clip;
    flushSync(() => setStage('shooting'));
    await afterPaint();
    const blob = await Promise.race([
      captureToBlob({ clip, scale: 1, prepareCapture: adapter.prepareCapture }),
      new Promise<null>((resolve) => window.setTimeout(() => resolve(null), CAPTURE_TIMEOUT_MS)),
    ]).catch(() => null);
    if (blob) {
      objectUrl.current = URL.createObjectURL(blob);
      setLocalShotUrl(objectUrl.current);
      try {
        setShot(await adapter.uploadShot(blob));
      } catch {
        setShot(null);
      }
    }
    setStage('composing');
  }, [adapter]);

  const onPick = useCallback(
    (r: PickResult) => {
      const { element, ...rest } = r;
      setAnchor(rest);
      void shoot(clipFromElement(element));
    },
    [shoot],
  );

  const onRegion = useCallback(
    (clip: CaptureClip) => {
      setAnchor(buildRegionAnchor(clip));
      void shoot(clip);
    },
    [shoot],
  );

  // 外部入口（如「联系我们」页的「圈选问题」按钮）触发
  const firstSignal = useRef(true);
  useEffect(() => {
    if (openSignal === undefined) return;
    if (firstSignal.current) {
      firstSignal.current = false;
      return;
    }
    setStage((s) => (s === 'idle' ? 'picking' : s));
  }, [openSignal]);

  useEffect(() => {
    if (!hotkey) return;
    const parts = hotkey.toLowerCase().split('+').filter(Boolean);
    const wantKey = parts.find((p) => !['alt', 'option', 'shift', 'ctrl', 'control', 'meta', 'cmd', 'mod'].includes(p));
    if (!wantKey) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const needAlt = parts.includes('alt') || parts.includes('option');
      const needShift = parts.includes('shift');
      const needCtrl = parts.includes('ctrl') || parts.includes('control') || parts.includes('meta') || parts.includes('cmd') || parts.includes('mod');
      const alt = e.altKey || e.getModifierState('Alt') || e.getModifierState('AltGraph');
      // Option+A 在 Mac 上可能是 å，且中文输入法会把 isComposing 置 true
      const optionLetter = wantKey === 'a' && (e.key === 'å' || e.key === 'Å');
      const codeOk = (e.code || '').toLowerCase() === `key${wantKey}`;
      const keyOk = e.key.toLowerCase() === wantKey || optionLetter;
      if (!codeOk && !keyOk) return;
      if (needShift !== !!e.shiftKey) return;
      if (needCtrl !== (e.ctrlKey || e.metaKey)) return;
      if (needAlt && !alt && !optionLetter) return;
      if (!needAlt && alt) return;
      e.preventDefault();
      e.stopPropagation();
      setStage((s) => (s === 'idle' ? 'picking' : s));
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [hotkey]);

  const submit = async (draft: PinDraft) => {
    const packed: PinDraft = { ...draft, shotUrl: shot?.url || null, shotKey: shot?.key || null };
    if (submitKind === 'collect') {
      onCollected?.(packed);
      cleanup();
      return;
    }
    setSubmitting(true);
    try {
      const pin = await adapter.createPin(packed);
      onCreated(pin);
      onSubmitted?.(pin);
      cleanup();
    } finally {
      setSubmitting(false);
    }
  };

  // composing 却没有锚点，会渲染出「什么都没有」——浮动按钮、气泡、编辑器全不见且退不出去。
  // 与其相信状态一定成对，不如在这里兜底当成空闲。
  const view: Stage = stage === 'composing' && !anchor ? 'idle' : stage;

  return (
    <>
      {view === 'idle' && showBubbles && <PinBubbles pins={pins} onOpen={onOpenPin} />}

      {view === 'picking' && (
        <ElementPicker
          collectSource={collectSource}
          onPick={onPick}
          onRegion={onRegion}
          onCancel={cleanup}
          tip="点击选控件 · 拖动框选截图 · Esc 取消"
        />
      )}

      {/* 截图阶段不盖浮层：遮罩若被 snapdom 剔除会留下空洞，拖选更容易截空 */}

      {view === 'composing' && anchor && (
        <PinComposer
          anchor={anchor}
          shotUrl={localShotUrl}
          shotKey={shot?.key}
          mode={submitKind === 'collect' ? 'feedback' : mode}
          authorName={adapter.currentUser?.name}
          /* 自己标的默认自己认领：绝大多数标注就是标注人自己去改 */
          defaultAssigneeId={adapter.currentUser?.id}
          assignees={assignees}
          submitting={submitting}
          submitLabel={submitKind === 'collect' ? '添加到这条反馈' : undefined}
          hint={
            submitKind === 'collect'
              ? '截图和圈选位置会带回联系我们，作为这条工单的附件，不会进内部看板。'
              : undefined
          }
          onRecapture={() => void shoot()}
          onSubmit={submit}
          onCancel={cleanup}
        />
      )}

      {fab && view === 'idle' && (
        <button type="button" className="ra-fab" data-annotate-layer="fab" onClick={() => setStage('picking')}>
          <span>◎</span>
          <span>{fabText}</span>
          {pins.length > 0 && <span className="ra-fab__count">{pins.length}</span>}
        </button>
      )}
    </>
  );
};

export default AnnotateLauncher;
