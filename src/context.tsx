/**
 * @文件 context.tsx
 * @职责 适配器注入与全局标注状态（当前页标注、打开/关闭标注模式）
 *
 * 内核不认任何具体后端：宿主提供 AnnotateAdapter，其余全在包内闭环。
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { AnnotateAdapter, AnnotateMode, AnnotationPin, AssignableUser } from './types';

interface AnnotateContextValue {
  adapter: AnnotateAdapter;
  mode: AnnotateMode;
  /** 是否采集 DOM 片段与源码位置 */
  collectSource: boolean;
  pins: AnnotationPin[];
  assignees: AssignableUser[];
  refresh: () => void;
  onCreated: (pin: AnnotationPin) => void;
}

const Ctx = createContext<AnnotateContextValue | null>(null);

export const useAnnotate = (): AnnotateContextValue => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAnnotate 必须在 <AnnotateProvider> 内使用');
  return v;
};

export interface AnnotateProviderProps {
  adapter: AnnotateAdapter;
  /** full=内部标注（可指派/优先级/截止），feedback=用户反馈（只填问题） */
  mode?: AnnotateMode;
  /**
   * 是否把 DOM 片段与源码位置一并存进卡片，默认 true。
   * 源码位置只有 React 开发构建才有（`_debugSource`），生产构建本就取不到；
   * 对外发布的站点建议显式关掉，连内部文件路径也不写进反馈库。
   */
  collectSource?: boolean;
  children?: React.ReactNode;
}

export const AnnotateProvider: React.FC<AnnotateProviderProps> = ({ adapter, mode = 'full', collectSource = true, children }) => {
  const [pins, setPins] = useState<AnnotationPin[]>([]);
  const [assignees, setAssignees] = useState<AssignableUser[]>([]);
  // 路由变化要重新拉本页标注；不假设宿主用哪个路由库，直接监听 history 与 popstate
  const [href, setHref] = useState(() => (typeof window === 'undefined' ? '' : window.location.href));
  const adapterRef = useRef(adapter);
  adapterRef.current = adapter;

  const refresh = useCallback(() => {
    const url = `${window.location.pathname}${window.location.search}`;
    adapterRef.current
      .listPagePins(url)
      .then(setPins)
      .catch(() => setPins([]));
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const notify = () => setHref(window.location.href);
    const wrap = (name: 'pushState' | 'replaceState') => {
      const orig = window.history[name];
      const patched = function (this: History, ...args: any[]) {
        const r = (orig as any).apply(this, args);
        notify();
        return r;
      };
      (window.history as any)[name] = patched;
      return () => {
        (window.history as any)[name] = orig;
      };
    };
    const un1 = wrap('pushState');
    const un2 = wrap('replaceState');
    window.addEventListener('popstate', notify);
    return () => {
      un1();
      un2();
      window.removeEventListener('popstate', notify);
    };
  }, []);

  useEffect(() => {
    refresh();
  }, [href, refresh]);

  useEffect(() => {
    if (mode !== 'full' || !adapter.listAssignees) return;
    adapter.listAssignees().then(setAssignees).catch(() => setAssignees([]));
  }, [adapter, mode]);

  const onCreated = useCallback((pin: AnnotationPin) => setPins((prev) => [pin, ...prev]), []);

  const value = useMemo(
    () => ({ adapter, mode, collectSource, pins, assignees, refresh, onCreated }),
    [adapter, mode, collectSource, pins, assignees, refresh, onCreated],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};
