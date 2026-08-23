/**
 * @文件 capture.ts
 * @职责 页面截图：始终先抓当前视口，再裁成元素框或拖选框；WebGL 像素单独盖回去
 *
 * 不要对 document.body 做整页栅格化，也不要把框选坐标当成文档坐标丢给 snapdom——
 * 三维页 body 比视口高，整页抓会「大半张空白、内容挤在底下」；框选再叠 scroll
 * 容易裁到空区域。视口抓完再 crop，圈选元素和拖选都能对上屏幕上看到的那一块。
 */

export interface CaptureClip {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CaptureOptions {
  target?: HTMLElement;
  scale?: number;
  hide?: HTMLElement[];
  /** 视口坐标。缺省当前视口；点选元素 / 拖选框传入屏幕矩形 */
  clip?: 'viewport' | CaptureClip;
  maxEdge?: number;
  maxBytes?: number;
  /** 盖 WebGL 像素前强制重绘（宿主三维画布） */
  prepareCapture?: () => void;
}

const MAX_EDGE = 1600;
const MAX_BYTES = 1_400_000;

/** snapdom 回传的几何真源；缺失时按「整元素捕获」兜底 */
export interface CaptureMeta {
  w0: number;
  h0: number;
  vbW: number;
  vbH: number;
  contentX: number;
  contentY: number;
  clip: { x: number; y: number; width: number; height: number } | null;
}

interface CaptureResult {
  meta?: CaptureMeta;
  toCanvas: () => Promise<HTMLCanvasElement>;
}

let snapdomLoader: Promise<((el: Element, opts?: Record<string, unknown>) => Promise<CaptureResult>) | null> | null = null;

async function loadEngine() {
  if (!snapdomLoader) {
    snapdomLoader = import(/* @vite-ignore */ '@zumer/snapdom')
      .then((m: { snapdom?: unknown; default?: { snapdom?: unknown } }) => {
        const fn = m.snapdom || m.default?.snapdom || m.default;
        return typeof fn === 'function' ? (fn as NonNullable<Awaited<typeof snapdomLoader>>) : null;
      })
      .catch(() => null);
  }
  return snapdomLoader;
}

export async function isCaptureAvailable(): Promise<boolean> {
  return !!(await loadEngine());
}

export function viewportClip(): CaptureClip {
  return { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight };
}

/** 元素在屏幕上的可见部分，外扩一点边，避免贴边裁掉阴影 */
export function clipFromElement(el: Element, pad = 12): CaptureClip {
  const r = el.getBoundingClientRect();
  const vp = viewportClip();
  const x = Math.max(vp.x, Math.floor(r.left - pad));
  const y = Math.max(vp.y, Math.floor(r.top - pad));
  const right = Math.min(vp.x + vp.width, Math.ceil(r.right + pad));
  const bottom = Math.min(vp.y + vp.height, Math.ceil(r.bottom + pad));
  return {
    x,
    y,
    width: Math.max(16, right - x),
    height: Math.max(16, bottom - y),
  };
}

export function resolveClip(clip?: CaptureOptions['clip']): CaptureClip {
  if (clip && clip !== 'viewport') {
    const vp = viewportClip();
    const x = Math.max(vp.x, clip.x);
    const y = Math.max(vp.y, clip.y);
    const right = Math.min(vp.x + vp.width, clip.x + clip.width);
    const bottom = Math.min(vp.y + vp.height, clip.y + clip.height);
    return { x, y, width: Math.max(1, right - x), height: Math.max(1, bottom - y) };
  }
  return viewportClip();
}

/**
 * 等圈选浮层卸掉、当前帧画完再截。
 *
 * 必须带超时：页面在后台标签、被节流或最小化时 rAF 根本不回调，纯 rAF 版本会**永远 pending**，
 * 整个标注流程卡死在「截图中」且界面上什么都不剩（连 Esc 都无处可按）。宁可少等一帧也不能挂死。
 */
export function afterPaint(timeoutMs = 400): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    const timer = window.setTimeout(finish, timeoutMs);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        window.clearTimeout(timer);
        finish();
      }),
    );
  });
}

/**
 * 画布几何：把视口坐标映射成画布像素。
 *
 * 关键教训——**不能假设 snapdom 回来的画布就等于视口**。`clip: 'viewport'` 只是请求：
 * 视口度量异常（后台标签页 innerWidth=0、窗口切换瞬间）时 snapdom 会把 clip 判成无效，
 * 静默降级为「整篇文档捕获」，回来的画布是文档高而不是视口高。此时若还按视口去裁，
 * 裁出来就是「顶部一条 + 一大片空白」。所以一律以 meta 为准反推，meta 缺失才退回视口假设。
 */
export interface CanvasGeometry {
  /** 视口 x/y → 画布像素的缩放与偏移 */
  scaleX: number;
  scaleY: number;
  offsetX: number;
  offsetY: number;
  /** snapdom 是否真的按我们要的窗口裁了（false = 它给了整页） */
  clipped: boolean;
}

export function geometryOf(canvas: HTMLCanvasElement, meta: CaptureMeta | undefined, vp: CaptureClip): CanvasGeometry {
  const sx = meta?.vbW ? canvas.width / meta.vbW : canvas.width / Math.max(1, vp.width);
  const sy = meta?.vbH ? canvas.height / meta.vbH : canvas.height / Math.max(1, vp.height);
  // meta.clip 是页面坐标；无 clip 时画布覆盖整个文档，原点即页面 (0,0)
  const originPageX = meta?.clip ? meta.clip.x : 0;
  const originPageY = meta?.clip ? meta.clip.y : 0;
  const scrollLeft = window.scrollX || document.documentElement.scrollLeft || 0;
  const scrollTop = window.scrollY || document.documentElement.scrollTop || 0;
  return {
    scaleX: sx,
    scaleY: sy,
    // contentX/contentY 是捕获框在 viewBox 内的原点（阴影/模糊会外扩出留白）
    offsetX: ((meta?.contentX ?? 0) + (scrollLeft - originPageX)) * sx,
    offsetY: ((meta?.contentY ?? 0) + (scrollTop - originPageY)) * sy,
    clipped: !!meta?.clip,
  };
}

function stampLiveCanvases(out: HTMLCanvasElement, geo: CanvasGeometry, prepareCapture?: () => void) {
  const ctx = out.getContext('2d');
  if (!ctx) return;
  try {
    prepareCapture?.();
  } catch {
    /* 宿主 flush 失败则仍尝试直接 drawImage */
  }
  document.querySelectorAll('canvas').forEach((c) => {
    if (c.closest('[data-annotate-layer]')) return;
    const r = c.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    // 目标位置由几何映射算出：画布可能是整页也可能是视口窗口，这里不做假设
    const dx = r.left * geo.scaleX + geo.offsetX;
    const dy = r.top * geo.scaleY + geo.offsetY;
    const dw = r.width * geo.scaleX;
    const dh = r.height * geo.scaleY;
    if (dx + dw <= 0 || dy + dh <= 0 || dx >= out.width || dy >= out.height) return;
    try {
      ctx.drawImage(c, dx, dy, dw, dh);
    } catch {
      /* 跨域污染则跳过 */
    }
  });
}

function cropCanvas(src: HTMLCanvasElement, geo: CanvasGeometry, to: CaptureClip): HTMLCanvasElement {
  const sx = to.x * geo.scaleX + geo.offsetX;
  const sy = to.y * geo.scaleY + geo.offsetY;
  const sw = to.width * geo.scaleX;
  const sh = to.height * geo.scaleY;
  if (Math.abs(sx) < 0.5 && Math.abs(sy) < 0.5 && Math.abs(sw - src.width) < 1 && Math.abs(sh - src.height) < 1) {
    return src;
  }
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(sw));
  out.height = Math.max(1, Math.round(sh));
  const ctx = out.getContext('2d');
  if (!ctx) return src;
  ctx.drawImage(src, sx, sy, sw, sh, 0, 0, out.width, out.height);
  return out;
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/jpeg', quality);
  });
}

async function fitAndCompress(canvas: HTMLCanvasElement, maxEdge: number, maxBytes: number): Promise<Blob | null> {
  const edge = Math.max(canvas.width, canvas.height);
  let work = canvas;
  if (edge > maxEdge) {
    const k = maxEdge / edge;
    const smaller = document.createElement('canvas');
    smaller.width = Math.max(1, Math.round(canvas.width * k));
    smaller.height = Math.max(1, Math.round(canvas.height * k));
    const ctx = smaller.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, smaller.width, smaller.height);
      ctx.drawImage(canvas, 0, 0, smaller.width, smaller.height);
      work = smaller;
    }
  }
  let q = 0.72;
  let blob = await canvasToJpeg(work, q);
  while (blob && blob.size > maxBytes && q > 0.4) {
    q -= 0.12;
    blob = await canvasToJpeg(work, q);
  }
  return blob;
}

/**
 * 判断裁出来的图是不是「一片空白」。
 *
 * 首屏还没画完 / 内容异步渲染时，截出来会是纯色一张。与其把空白图当证据存下去
 * （看板上一张白图，谁也不知道当时发生了什么），不如识别出来重试一次，再不行就不附图。
 */
function looksBlank(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return false;
  const w = canvas.width;
  const h = canvas.height;
  if (w < 4 || h < 4) return false;
  let first: string | null = null;
  const rows = 12;
  for (let i = 0; i < rows; i += 1) {
    const y = Math.min(h - 1, Math.floor(((i + 0.5) / rows) * h));
    let data: Uint8ClampedArray;
    try {
      data = ctx.getImageData(0, y, w, 1).data;
    } catch {
      return false; // 画布被跨域污染读不了，别据此下结论
    }
    for (let x = 0; x < w; x += 8) {
      const p = x * 4;
      const key = `${data[p]},${data[p + 1]},${data[p + 2]}`;
      if (first === null) first = key;
      else if (key !== first) return false;
    }
  }
  return true;
}

async function renderOnce(
  engine: NonNullable<Awaited<ReturnType<typeof loadEngine>>>,
  options: CaptureOptions,
  clip: CaptureClip,
): Promise<HTMLCanvasElement | null> {
  const result = await engine(options.target || document.documentElement, {
    fast: true,
    embedFonts: false,
    compress: true,
    scale: options.scale ?? 1,
    dpr: 1,
    backgroundColor: getComputedStyle(document.body).backgroundColor || '#fff',
    exclude: ['[data-annotate-hidden]', '[data-annotate-layer]'],
    excludeMode: 'remove',
    clip: 'viewport',
  });
  const raw = await result.toCanvas();
  // 以 snapdom 自报的几何为准；它可能没按我们要的窗口裁，而是给了整页
  const geo = geometryOf(raw, result.meta, viewportClip());
  stampLiveCanvases(raw, geo, options.prepareCapture);
  return cropCanvas(raw, geo, clip);
}

export async function captureToBlob(options: CaptureOptions = {}): Promise<Blob | null> {
  const engine = await loadEngine();
  if (!engine) return null;

  const clip = resolveClip(options.clip);
  const hidden = (options.hide || []).filter(Boolean);
  hidden.forEach((el) => el.setAttribute('data-annotate-hidden', '1'));

  try {
    let canvas = await renderOnce(engine, options, clip);
    if (canvas && looksBlank(canvas)) {
      // 多半是首屏/异步内容还没画上；隔一帧再来一次，仍空白就宁可不附图
      await afterPaint();
      await new Promise((r) => window.setTimeout(r, 120));
      const retry = await renderOnce(engine, options, clip);
      if (retry && !looksBlank(retry)) canvas = retry;
      else {
        console.warn('[annotate] 截图内容为空白，已放弃截图，只保留元素锚点');
        return null;
      }
    }
    if (!canvas) return null;
    return await fitAndCompress(canvas, options.maxEdge ?? MAX_EDGE, options.maxBytes ?? MAX_BYTES);
  } catch (err) {
    console.warn('[annotate] 截图失败，将只保存元素锚点', err);
    return null;
  } finally {
    hidden.forEach((el) => el.removeAttribute('data-annotate-hidden'));
  }
}
