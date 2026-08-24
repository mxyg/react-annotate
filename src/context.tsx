/**
 * @文件 context.tsx
 * @职责 适配器注入与全局标注状态（当前页标注、打开/关闭标注模式）
 *
 * 内核不认任何具体后端：宿主提供 AnnotateAdapter，其余全在包内闭环。
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { toRoutePattern } from './core/anchor';
import type { AnnotateAdapter, AnnotateMode, AnnotationPin, AssignableUser } from './types';

interface AnnotateContextValue {
  adapter: AnnotateAdapter;
  mode: AnnotateMode;
  /** 是否采集 DOM 片段与源码位置 */
  collectSource: boolean;
  pins: AnnotationPin[];
  assignees: AssignableUser[];
  refresh: (force?: boolean) => void;
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

  /**
   * 拉本页标注。两道闸：
   * 1. 同一个页面（routePattern 相同）不重复拉——应用为同步筛选条件而频繁 replaceState 时，
   *    每次 query 变化都重拉一遍纯属浪费。
   * 2. 失败后退避，且失败次数越多等得越久。后端没起来时（本机 yarn dev 前十几秒必然如此），
   *    否则会跟着其它失败请求一起把日志刷满。
   */
  const lastKey = useRef('');
  const failedAt = useRef(0);
  const failCount = useRef(0);

  const refresh = useCallback((force = false) => {
    const url = `${window.location.pathname}${window.location.search}`;
    const key = toRoutePattern(url);
    if (!force) {
      if (key === lastKey.current) return;
      const backoff = Math.min(30_000, 2000 * 2 ** Math.max(0, failCount.current - 1));
      if (failCount.current && Date.now() - failedAt.current < backoff) return;
    }
    lastKey.current = key;
    adapterRef.current
      .listPagePins(url)
      .then((list) => {
        failCount.current = 0;
        setPins(list);
      })
      .catch(() => {
        failedAt.current = Date.now();
        failCount.current += 1;
        // 失败不认账：下次同页面仍要重试，否则后端恢复了也再不拉
        lastKey.current = '';
        setPins([]);
      });
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

  // 回到这个标签页时刷新一次：同页面被去重挡着，别人新标的卡片否则一直看不到。
  // 限流 30 秒，来回切标签页不至于变成轮询。
  const lastVisibleFetch = useRef(0);
  useEffect(() => {
    const onVisible = () => {
      if (document.hidden) return;
      if (Date.now() - lastVisibleFetch.current < 30_000) return;
      lastVisibleFetch.current = Date.now();
      refresh(true);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  // 指派候选只拉一次：adapter 是宿主 useMemo 出来的，登录态一变它就换新对象，
  // 挂在 [adapter] 上会跟着 /account/me 的每次重试一起重打。失败才允许再拉。
  const assigneesTried = useRef(false);
  useEffect(() => {
    if (mode !== 'full' || assigneesTried.current) return;
    const fn = adapterRef.current.listAssignees;
    if (!fn) return;
    assigneesTried.current = true;
    fn()
      .then(setAssignees)
      .catch(() => {
        assigneesTried.current = false;
        setAssignees([]);
      });
  }, [mode]);

  const onCreated = useCallback((pin: AnnotationPin) => setPins((prev) => [pin, ...prev]), []);

  const value = useMemo(
    () => ({ adapter, mode, collectSource, pins, assignees, refresh, onCreated }),
    [adapter, mode, collectSource, pins, assignees, refresh, onCreated],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};
