/**
 * @文件 anchor.ts
 * @职责 元素锚点：生成稳定选择器、反查元素、归一化路由模板、生成可读元素描述
 * @路径 Poincare/src/components/annotate/anchor.ts
 *
 * 选择器策略（按稳定性从高到低取用）：
 *   1. `[data-annotate-id]`  —— 宿主主动标的锚点，改版也不失效，最优先
 *   2. `#id`                 —— 但要跳过一看就是自动生成的（含长 hash / 随机数）
 *   3. `tag.稳定类名:nth-of-type(n)` 逐级向上拼，最多 6 级
 * 不用完整 DOM 路径是因为它对任何一次布局微调都过敏，存下来的锚点两周后全废。
 */

/** 一看就是构建产物/运行时生成的 id 或 class，拿来做锚点等于没锚 */
const VOLATILE = /(^|[-_])(\d{4,}|[0-9a-f]{8,})([-_]|$)|^(css|sc|jsx|emotion|ant-motion)[-_]/i;

const isStableToken = (t: string) => !!t && t.length <= 40 && !VOLATILE.test(t);

/** 元素上任意可用的显式锚点标记 */
const explicitId = (el: Element): string | null => {
  const v = el.getAttribute('data-annotate-id');
  return v ? `[data-annotate-id="${CSS.escape(v)}"]` : null;
};

const nthOfType = (el: Element): number => {
  let i = 1;
  let sib = el.previousElementSibling;
  while (sib) {
    if (sib.tagName === el.tagName) i += 1;
    sib = sib.previousElementSibling;
  }
  return i;
};

const segmentFor = (el: Element): string => {
  const tag = el.tagName.toLowerCase();
  const cls = Array.from(el.classList).filter(isStableToken).slice(0, 2);
  const base = cls.length ? `${tag}.${cls.map((c) => CSS.escape(c)).join('.')}` : tag;
  return `${base}:nth-of-type(${nthOfType(el)})`;
};

/** 为元素生成选择器；返回值保证在生成时刻能被 document.querySelector 反查到 */
export function buildSelector(target: Element): string {
  const marked = target.closest('[data-annotate-id]');
  if (marked) {
    const sel = explicitId(marked)!;
    if (marked === target) return sel;
    // 元素本身没标记但祖先标了：锚到祖先 + 相对路径，比一路 nth 到 body 稳
    const rel: string[] = [];
    let cur: Element | null = target;
    while (cur && cur !== marked && rel.length < 5) {
      rel.unshift(segmentFor(cur));
      cur = cur.parentElement;
    }
    return `${sel} ${rel.join(' > ')}`;
  }

  if (target.id && isStableToken(target.id)) return `#${CSS.escape(target.id)}`;

  const parts: string[] = [];
  let cur: Element | null = target;
  while (cur && cur !== document.body && parts.length < 6) {
    if (cur.id && isStableToken(cur.id)) {
      parts.unshift(`#${CSS.escape(cur.id)}`);
      return parts.join(' > ');
    }
    parts.unshift(segmentFor(cur));
    cur = cur.parentElement;
  }
  return `body > ${parts.join(' > ')}`;
}

/** 反查：选择器失效时返回 null，由调用方降级到「只看截图」 */
export function resolveSelector(selector: string): HTMLElement | null {
  if (!selector) return null;
  try {
    return document.querySelector<HTMLElement>(selector);
  } catch {
    return null;
  }
}

/** 元素的人话描述：选择器失效后，这是人工找回现场的唯一线索 */
export function describeElement(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const clean = (v?: string | null) => (v || '').replace(/\s+/g, ' ').trim();

  // 顺序是刻意的：显式无障碍标签 > 自身直接文本 > 后代文本。
  // 直接用 textContent 的话，点中一个容器 div 会把满屏子孙的文字全抄一遍
  // （「当前版本v34最新版本v34待更新任务0…」），既当不成标题也读不成位置。
  const explicit = clean(
    el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('placeholder') || el.getAttribute('alt'),
  );
  const own = clean(
    [...el.childNodes]
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent || '')
      .join(' '),
  );
  const descendant = clean(el.textContent);

  const label = explicit || own || descendant;
  if (!label) return tag;

  const MAX = 24;
  // 取自后代文本说明点中的是容器，标出来免得当成按钮本身的名字
  const isContainer = !explicit && !own && descendant.length > MAX;
  const short = label.length > MAX ? `${label.slice(0, MAX)}…` : label;
  return isContainer ? `${short}（${tag} 区域）` : `${short}（${tag}）`;
}


/** 精简 outerHTML：去掉脚本/内联大图，方便和截图一起贴进卡片 */
export function htmlSnippet(el: Element, max = 1800): string {
  const clone = el.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('script, style').forEach((n) => n.remove());
  clone.querySelectorAll('svg, canvas, video').forEach((n) => {
    n.replaceWith(clone.ownerDocument.createComment(n.tagName.toLowerCase()));
  });
  clone.querySelectorAll('img').forEach((img) => {
    const src = img.getAttribute('src') || '';
    if (src.startsWith('data:') || src.length > 80) img.setAttribute('src', '…');
  });
  const walk = (n: Element) => {
    [...n.attributes].forEach((a) => {
      if ((a.name === 'style' || a.name.startsWith('data-react')) && a.value.length > 80) {
        n.removeAttribute(a.name);
      }
    });
    [...n.children].forEach(walk);
  };
  walk(clone);
  const extra = [...clone.children];
  if (extra.length > 6) {
    extra.slice(6).forEach((c) => c.remove());
    clone.append('…');
  }
  let html = (clone.outerHTML || '').replace(/\s+/g, ' ').trim();
  if (html.length > max) html = `${html.slice(0, max)}…`;
  return html;
}

/** 开发态沿 React fiber 往上找 _debugSource，生产包通常没有 */
export function reactSourceLoc(el: Element): string {
  const fiberKey = Object.keys(el).find(
    (k) => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'),
  );
  if (!fiberKey) return '';
  let fiber: { return?: unknown; type?: unknown; _debugSource?: { fileName?: string; lineNumber?: number; columnNumber?: number } } | undefined = (
    el as unknown as Record<string, typeof fiber>
  )[fiberKey];
  const names: string[] = [];
  for (let i = 0; i < 40 && fiber; i += 1, fiber = fiber.return as typeof fiber) {
    const t = fiber.type;
    const name = typeof t === 'string' ? t : (t as { displayName?: string; name?: string } | undefined)?.displayName || (t as { name?: string } | undefined)?.name;
    if (name && name !== 'Anonymous' && names.length < 4 && !names.includes(name)) names.push(name);
    const src = fiber._debugSource;
    if (src?.fileName) {
      const file = String(src.fileName).replace(/^.*?(\/Poincare\/|\/Shannon\/|\/src\/)/, (_, m: string) =>
        m.includes('Poincare') ? 'Poincare/' : m.includes('Shannon') ? 'Shannon/' : 'src/',
      );
      const loc = `${file}:${src.lineNumber}${src.columnNumber ? `:${src.columnNumber}` : ''}`;
      return names.length ? `${names.join(' < ')}  @ ${loc}` : loc;
    }
  }
  return names.length ? names.join(' < ') : '';
}

/** 与后端 AnnotationService.toRoutePattern 保持同一套规则：uuid/数字/长 hash 段归一为 :id */
export function toRoutePattern(url: string): string {
  const path = (url || '').split('?')[0].split('#')[0];
  return path
    .split('/')
    .map((seg) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seg) ||
      /^\d+$/.test(seg) ||
      /^[0-9a-f]{16,}$/i.test(seg)
        ? ':id'
        : seg,
    )
    .join('/');
}

/** 框选截图：没有 DOM 选择器，只记下当时视口与框 */
export function buildRegionAnchor(clip: { x: number; y: number; width: number; height: number }) {
  const url = `${window.location.pathname}${window.location.search}`;
  return {
    url,
    routePattern: toRoutePattern(url),
    selector: '',
    anchorX: 0.5,
    anchorY: 0.5,
    elementLabel: `框选 ${Math.round(clip.width)}×${Math.round(clip.height)}`,
    viewport: {
      w: window.innerWidth,
      h: window.innerHeight,
      dpr: window.devicePixelRatio || 1,
      theme: document.documentElement.getAttribute('data-theme') || undefined,
    },
  };
}

/**
 * 生产构建注入的源码短 id：向上找最近一个带 `data-sl` 的节点。
 *
 * 它是**不可反解**的哈希（对照表只在服务端），所以不受 collectSource 开关限制——
 * 发出去的只是一串 7 位字符，拿不到它就什么也不是；后台解析后才是真实文件行号。
 * 这样「用户端不带路径」和「我们能一键定位」两件事才能同时成立。
 */
export function sourceRefOf(el: Element): string {
  const holder = el.closest('[data-sl]');
  return holder?.getAttribute('data-sl') || '';
}

/**
 * 由点击点与目标元素算出锚点数据。
 *
 * `collectSource=false` 时不采集 DOM 片段与源码位置：这两项只在开发/内部环境有意义
 * （源码位置本就只有 React 开发构建才有），对外发布的站点没必要把内部文件路径写进反馈库。
 */
export function buildAnchor(el: Element, clientX: number, clientY: number, collectSource = true) {
  const rect = el.getBoundingClientRect();
  const url = `${window.location.pathname}${window.location.search}`;
  const snippet = collectSource ? htmlSnippet(el) : '';
  const sourceLoc = collectSource ? reactSourceLoc(el) : '';
  const sourceRef = sourceRefOf(el);
  return {
    url,
    routePattern: toRoutePattern(url),
    selector: buildSelector(el),
    anchorX: rect.width ? Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) : 0.5,
    anchorY: rect.height ? Math.min(1, Math.max(0, (clientY - rect.top) / rect.height)) : 0.5,
    elementLabel: describeElement(el),
    snippet,
    sourceLoc,
    sourceRef,
    viewport: {
      w: window.innerWidth,
      h: window.innerHeight,
      dpr: window.devicePixelRatio || 1,
      theme: document.documentElement.getAttribute('data-theme') || undefined,
      snippet,
      sourceLoc,
      sourceRef,
    },
  };
}
