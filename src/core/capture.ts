/**
 * @文件 capture.ts
 * @职责 页面截图：只抓视口或框选区域，压成 JPEG，并把 WebGL canvas 像素盖回去
 *
 * 不要对 document.body 做整页栅格化：三维工作台的 body 比视口高得多，
 * 会出「大半张空白、内容挤在底下」、耗时数秒、体积超限（file too large）。
 *
 * snapdom 的 clip:'viewport' 只序列化看得见的子树。WebGL 画布经常因
 * preserveDrawingBuffer=false 被克隆成白块，所以导出后再把活 canvas drawImage 盖上。
 */

export interface CaptureClip {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CaptureOptions {
  target?: HTMLElement;
  /** 默认 1。三维页 dpr=2 再 × 整页宽度会轻易到几十 MB */
  scale?: number;
  hide?: HTMLElement[];
  /** 缺省只截当前视口，不要整页 */
  clip?: 'viewport' | CaptureClip;
  /** 长边上限（CSS 像素），再大就缩小 */
  maxEdge?: number;
  /** 体积上限，超出就降 JPEG 质量 */
  maxBytes?: number;
}

const MAX_EDGE = 1600;
const MAX_BYTES = 1_400_000;

let snapdomLoader: Promise<any | null> | null = null;

async function loadEngine(): Promise<any | null> {
  if (!snapdomLoader) {
    snapdomLoader = import(/* @vite-ignore */ '@zumer/snapdom')
      .then((m: any) => m.snapdom || m.default?.snapdom || m.default)
      .catch(() => null);
  }
  return snapdomLoader;
}

export async function isCaptureAvailable(): Promise<boolean> {
  return !!(await loadEngine());
}

function viewportClip(): CaptureClip {
  return { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight };
}

function resolveClip(clip?: CaptureOptions['clip']): CaptureClip {
  if (clip && clip !== 'viewport') return clip;
  return viewportClip();
}

/** 把视口内的活 canvas（含 WebGL）盖到截图上，位置按 clip 对齐 */
function stampLiveCanvases(out: HTMLCanvasElement, clip: CaptureClip) {
  const ctx = out.getContext('2d');
  if (!ctx) return;
  const sx = out.width / Math.max(1, clip.width);
  const sy = out.height / Math.max(1, clip.height);
  document.querySelectorAll('canvas').forEach((c) => {
    if (c.closest('[data-annotate-layer]')) return;
    const r = c.getBoundingClientRect();
    const left = Math.max(r.left, clip.x);
    const top = Math.max(r.top, clip.y);
    const right = Math.min(r.right, clip.x + clip.width);
    const bottom = Math.min(r.bottom, clip.y + clip.height);
    const w = right - left;
    const h = bottom - top;
    if (w < 2 || h < 2) return;
    const srcX = ((left - r.left) / r.width) * c.width;
    const srcY = ((top - r.top) / r.height) * c.height;
    const srcW = (w / r.width) * c.width;
    const srcH = (h / r.height) * c.height;
    try {
      ctx.drawImage(
        c,
        srcX,
        srcY,
        srcW,
        srcH,
        (left - clip.x) * sx,
        (top - clip.y) * sy,
        w * sx,
        h * sy,
      );
    } catch {
      /* 跨域污染则跳过这一块，保留 snapdom 底图 */
    }
  });
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

export async function captureToBlob(options: CaptureOptions = {}): Promise<Blob | null> {
  const engine = await loadEngine();
  if (!engine) return null;

  const clip = resolveClip(options.clip);
  const hidden = (options.hide || []).filter(Boolean);
  hidden.forEach((el) => el.setAttribute('data-annotate-hidden', '1'));

  try {
    const target = options.target || document.documentElement;
    const result = await engine(target, {
      fast: true,
      embedFonts: false,
      compress: true,
      scale: options.scale ?? 1,
      dpr: 1,
      backgroundColor: getComputedStyle(document.body).backgroundColor || '#fff',
      exclude: ['[data-annotate-hidden]', '[data-annotate-layer]'],
      clip:
        options.clip === 'viewport' || options.clip == null
          ? 'viewport'
          : {
              x: clip.x + window.scrollX,
              y: clip.y + window.scrollY,
              width: clip.width,
              height: clip.height,
            },
    });
    const canvas: HTMLCanvasElement = await result.toCanvas();
    stampLiveCanvases(canvas, clip);
    return await fitAndCompress(canvas, options.maxEdge ?? MAX_EDGE, options.maxBytes ?? MAX_BYTES);
  } catch (err) {
    console.warn('[annotate] 截图失败，将只保存元素锚点', err);
    return null;
  } finally {
    hidden.forEach((el) => el.removeAttribute('data-annotate-hidden'));
  }
}
