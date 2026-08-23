/**
 * @文件 AnnotateLauncher.tsx
 * @职责 标注入口与状态机：待机 → 选元素 → 截图 → 编辑卡片 → 提交，外加本页气泡与快捷键
 *
 * 截图时机刻意放在「选完元素之后」：先选后截，浮层还没盖上去，截出来就是用户当时看到的画面；
 * 反过来先截再选，用户会对着一张静止图去选元素，锚点和真实 DOM 容易对不上。
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import ElementPicker, { type PickResult } from './ElementPicker';
import PinComposer from './PinComposer';
import PinBubbles from './PinBubbles';
import { captureToBlob, type CaptureClip, type CaptureOptions } from '../core/capture';
import { buildRegionAnchor } from '../core/anchor';
import { useAnnotate } from '../context';
import type { AnnotationPin, PinAnchor, PinDraft } from '../types';

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
}

type Stage = 'idle' | 'picking' | 'shooting' | 'composing';

const AnnotateLauncher: React.FC<AnnotateLauncherProps> = ({
  hotkey = 'alt+a',
  fab = true,
  openSignal,
  fabText = '标注',
  onOpenPin,
  onSubmitted,
}) => {
  const { adapter, mode, pins, assignees, onCreated } = useAnnotate();
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

  /** 只截视口或框选，失败降级为无截图 */
  const shoot = useCallback(async (clip: CaptureOptions['clip'] = lastClip.current) => {
    lastClip.current = clip;
    setStage('shooting');
    const blob = await captureToBlob({ clip, scale: 1 });
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
      void shoot('viewport');
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
    const parts = hotkey.toLowerCase().split('+');
    const key = parts[parts.length - 1];
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== key) return;
      if (parts.includes('alt') !== e.altKey) return;
      if (parts.includes('shift') !== e.shiftKey) return;
      if (parts.includes('ctrl') !== (e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      setStage((s) => (s === 'idle' ? 'picking' : s));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hotkey]);

  const submit = async (draft: PinDraft) => {
    setSubmitting(true);
    try {
      const pin = await adapter.createPin({ ...draft, shotUrl: shot?.url || null, shotKey: shot?.key || null });
      onCreated(pin);
      onSubmitted?.(pin);
      cleanup();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {stage === 'idle' && <PinBubbles pins={pins} onOpen={onOpenPin} />}

      {stage === 'picking' && (
        <ElementPicker
          onPick={onPick}
          onRegion={onRegion}
          onCancel={cleanup}
          tip="点击选控件 · 拖动框选截图 · Esc 取消"
        />
      )}

      {stage === 'shooting' && (
        <div className="ra-layer" data-annotate-layer="shooting">
          <div className="ra-tip">正在截图…</div>
        </div>
      )}

      {stage === 'composing' && anchor && (
        <PinComposer
          anchor={anchor}
          shotUrl={localShotUrl}
          shotKey={shot?.key}
          mode={mode}
          authorName={adapter.currentUser?.name}
          assignees={assignees}
          submitting={submitting}
          onRecapture={() => void shoot()}
          onSubmit={submit}
          onCancel={cleanup}
        />
      )}

      {fab && stage === 'idle' && (
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
