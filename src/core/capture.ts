/**
 * @文件 capture.ts
 * @职责 页面截图：把当前视口（或指定元素）转成 PNG Blob，供标注留证
 *
 * 截图能力做成**可选**：`@zumer/snapdom` 走 optional peerDependency + 动态 import，
 * 宿主没装就自动降级为「只存元素锚点」，本包依旧零运行时依赖。
 * 选 snapdom 而不是 html2canvas：后者不认 oklch 等现代颜色函数，遇到整张崩。
 *
 * 无论如何截图都只是**佐证**：跨域图片、WebGL 画布可能空白，真正的定位靠 selector 锚点。
 */

export interface CaptureOptions {
  /** 截图目标，默认 document.body（整页视口） */
  target?: HTMLElement;
  /** 缩放比，默认按 dpr 但封顶 2，避免大屏出几十 MB 的图 */
  scale?: number;
  /** 截图时需要临时隐藏的元素（标注浮层自身） */
  hide?: HTMLElement[];
}

let snapdomLoader: Promise<any> | null = null;

/** 动态加载截图引擎；未安装时返回 null 而不是抛错 */
async function loadEngine(): Promise<any | null> {
  if (!snapdomLoader) {
    snapdomLoader = import(/* @vite-ignore */ '@zumer/snapdom')
      .then((m: any) => m.snapdom || m.default?.snapdom || m.default)
      .catch(() => null);
  }
  return snapdomLoader;
}

/** 宿主可据此决定是否显示「重新截图」按钮 */
export async function isCaptureAvailable(): Promise<boolean> {
  return !!(await loadEngine());
}

export async function captureToBlob(options: CaptureOptions = {}): Promise<Blob | null> {
  const engine = await loadEngine();
  if (!engine) return null;

  const target = options.target || document.body;
  const scale = options.scale ?? Math.min(2, window.devicePixelRatio || 1);
  const hidden = (options.hide || []).filter(Boolean);
  hidden.forEach((el) => el.setAttribute('data-annotate-hidden', '1'));
  try {
    const result = await engine(target, {
      scale,
      backgroundColor: getComputedStyle(document.body).backgroundColor || '#fff',
      // 浮层自身不能出现在证据里
      exclude: ['[data-annotate-hidden]', '[data-annotate-layer]'],
    });
    return await result.toBlob({ type: 'png' });
  } catch (err) {
    console.warn('[annotate] 截图失败，将只保存元素锚点', err);
    return null;
  } finally {
    hidden.forEach((el) => el.removeAttribute('data-annotate-hidden'));
  }
}
