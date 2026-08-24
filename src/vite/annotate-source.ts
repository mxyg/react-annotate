/**
 * @文件 annotate-source.ts
 * @职责 构建/开发期给 JSX 宿主元素注入不可反解的源码短 id（data-sl），并产出 id→源码位置的对照表
 *
 * 解决的问题：圈选反馈要能一键定位到出问题的那一行。
 * - 开发期：靠选择器和 outerHTML 找位置太难读（`div > div:nth-of-type(2) > span`），
 *   注入后每个节点自带精确的 `文件:行:列`。
 * - 生产期：**不能**把源码路径随包发到浏览器，那等于公开工程结构。所以浏览器里只留
 *   7 位哈希 id，`id → 文件:行:列` 的对照表交给服务端，由后台解析。
 *
 * 对照表两个出口，按部署形态选：
 * - `manifestFile`：JSON 清单。同机部署时后端直接读它。**务必放在 dist 之外**，
 *   否则跟着静态资源传上 CDN/对象存储就等于公开发布。
 * - `emitModule`：把对照表写成一个 TS 模块直接注入后端源码树，随后端代码包一起发布。
 *   函数计算（只读文件系统、代码包与前端产物分开部署、多实例无共享盘）只能走这条。
 */
import { promises as fs } from 'fs';
import path from 'path';

/**
 * 只给**真正的 HTML/SVG 标签**注入属性。
 *
 * 不能简单按「小写 JSX 就是宿主元素」判断：react-three-fiber 把 `<mesh>`、`<group>`、
 * `<bufferGeometry>` 这类小写 JSX 当成 three.js 对象，它的 applyProps 会按 `-` 拆键
 * 去写 `instance.data.sl`，属性一带上整棵三维场景就崩
 * （`Cannot read properties of undefined (reading 'sl')`）。
 * 同类风险还有任何把小写标签当自定义渲染器指令的库，所以这里用白名单而不是黑名单。
 */
const HTML_TAGS = new Set(
  ('a abbr address area article aside audio b base bdi bdo big blockquote body br button canvas caption cite code col ' +
    'colgroup data datalist dd del details dfn dialog div dl dt em embed fieldset figcaption figure footer form h1 h2 ' +
    'h3 h4 h5 h6 head header hgroup hr html i iframe img input ins kbd keygen label legend li link main map mark menu ' +
    'menuitem meta meter nav noscript object ol optgroup option output p param picture pre progress q rp rt ruby s ' +
    'samp script section select slot small source span strong style sub summary sup table tbody td template textarea ' +
    'tfoot th thead time title tr track u ul var video wbr').split(' '),
);
const SVG_TAGS = new Set(
  ('svg animate animateMotion animateTransform circle clipPath defs desc ellipse feBlend feColorMatrix ' +
    'feComponentTransfer feComposite feConvolveMatrix feDiffuseLighting feDisplacementMap feDistantLight feDropShadow ' +
    'feFlood feFuncA feFuncB feFuncG feFuncR feGaussianBlur feImage feMerge feMergeNode feMorphology feOffset ' +
    'fePointLight feSpecularLighting feSpotLight feTile feTurbulence filter foreignObject g image line linearGradient ' +
    'marker mask metadata mpath path pattern polygon polyline radialGradient rect stop switch symbol text textPath ' +
    'tspan use view').split(' '),
);

/** FNV-1a：够稳、够短；没有对照表在手就是一串废字符，反解不出任何东西 */
export function shortSourceHash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36).padStart(7, '0').slice(-7);
}

export interface EmitModuleOptions {
  /** 生成的 TS 文件路径（写进后端源码树，随代码包发布） */
  file: string;
  /** 导出的常量名，默认 ANNOTATE_SOURCE_MAP */
  exportName?: string;
  /** 是否连开发期也写。默认只在 build 时写——开发期频繁写会把后端 watch 重启刷屏 */
  onDev?: boolean;
}

export interface AnnotateSourceOptions {
  /** 前端包根目录（把绝对路径裁成相对路径用） */
  root: string;
  /** 路径前缀，便于在多包仓库里区分是哪个前端，如 `Poincare/` */
  prefix?: string;
  /** JSON 清单输出路径；**必须在 dist 之外** */
  manifestFile?: string;
  /** 额外把对照表注入后端源码树 */
  emitModule?: EmitModuleOptions;
  /** 是否注入。默认 true（开发期也注入，这样定位在哪都好使） */
  enabled?: boolean;
  /** 版本号，写进产物便于核对前后端是否配套 */
  version?: string;
  /** 额外放行的标签名（默认只认 HTML/SVG 标准标签，见 HTML_TAGS/SVG_TAGS 注释） */
  extraTags?: string[];
  /**
   * 引了这些模块的文件整份跳过注入。默认 three / @react-three/*。
   * 白名单挡不住**重名**：`line`、`text`、`image`、`audio`、`view` 既是 SVG 标签，
   * 也是 three.js 元素名，光看标签名分不出来。所以再按「这个文件是不是三维文件」兜一道。
   */
  skipModules?: (string | RegExp)[];
}

/**
 * 返回 `{ babelPlugin, vitePlugin }`：babel 注入属性并登记映射，vite 负责落盘。
 * 两者共享同一个 Map，必须来自同一次调用。
 *
 * 用法（vite.config.ts）：
 * ```ts
 * const annotate = createAnnotateSource({ root: __dirname, prefix: 'Web/' })
 * plugins: [react({ babel: { plugins: [annotate.babelPlugin] } }), annotate.vitePlugin]
 * ```
 */
export function createAnnotateSource(options: AnnotateSourceOptions) {
  const { root } = options;
  const enabled = options.enabled ?? true;
  const prefix = options.prefix ?? '';
  const manifestFile =
    options.manifestFile || path.resolve(root, 'build-artifacts/annotate-source-manifest.json');
  const map = new Map<string, string>();
  const extraTags = new Set(options.extraTags || []);
  const skipModules = options.skipModules ?? [/^three($|\/)/, /^@react-three\//];
  const shouldSkipSource = (src: string) =>
    skipModules.some((m) => (typeof m === 'string' ? src === m || src.startsWith(`${m}/`) : m.test(src)));
  let isBuild = false;
  let dirty = false;
  let devTimer: ReturnType<typeof setTimeout> | null = null;

  const babelPlugin = ({ types: t }: { types: any }) => ({
    name: 'annotate-source-id',
    visitor: {
      Program(programPath: any, state: any) {
        // 整份跳过三维文件：见 skipModules 注释
        state.__annotateSkipFile = programPath.node.body.some(
          (n: any) => n.type === 'ImportDeclaration' && shouldSkipSource(String(n.source?.value || '')),
        );
      },
      JSXOpeningElement(nodePath: any, state: any) {
        if (!enabled || state.__annotateSkipFile) return;
        const name = nodePath.node.name;
        // 只标真正会落到 DOM 上的 HTML/SVG 标签。组件元素标了也落不到节点上；
        // 而 three.js 这类自定义渲染器的小写标签标了会直接把页面搞崩（见 HTML_TAGS 注释）
        if (name?.type !== 'JSXIdentifier') return;
        const tag: string = name.name;
        if (!HTML_TAGS.has(tag) && !SVG_TAGS.has(tag) && !extraTags.has(tag)) return;
        const attrs = nodePath.node.attributes || [];
        if (attrs.some((a: any) => a.type === 'JSXAttribute' && a.name?.name === 'data-sl')) return;

        const filename: string = state.filename || state.file?.opts?.filename || '';
        if (!filename || filename.includes('node_modules')) return;
        const loc = nodePath.node.loc?.start;
        if (!loc) return;

        const rel = `${prefix}${path.relative(root, filename).split(path.sep).join('/')}`;
        const full = `${rel}:${loc.line}:${loc.column + 1}`;
        const id = shortSourceHash(full);
        if (map.get(id) !== full) {
          map.set(id, full);
          dirty = true;
        }
        nodePath.node.attributes.push(t.jsxAttribute(t.jsxIdentifier('data-sl'), t.stringLiteral(id)));
      },
    },
  });

  /** 排序后写：对照表要能进 diff 看变化，随机顺序每次都是全量改动 */
  const sortedEntries = () => Object.fromEntries([...map.entries()].sort(([a], [b]) => a.localeCompare(b)));

  async function writeManifest() {
    if (!map.size) return;
    await fs.mkdir(path.dirname(manifestFile), { recursive: true });
    await fs.writeFile(
      manifestFile,
      `${JSON.stringify({ version: options.version || '', count: map.size, entries: sortedEntries() })}\n`,
      'utf8',
    );
  }

  async function writeModule() {
    const emit = options.emitModule;
    if (!emit || !map.size) return;
    const exportName = emit.exportName || 'ANNOTATE_SOURCE_MAP';
    const body = `/* eslint-disable */
/**
 * 本文件由 @liuman/react-annotate 的构建插件自动生成，请勿手改。
 *
 * 内容是「圈选反馈的源码短 id → 源码位置」对照表。它随后端代码包一起发布，
 * 这样函数计算这类只读文件系统、且与前端产物分开部署的环境也能解析。
 * 前端发布后请重新生成并同步部署，否则新 id 解析不出来（自检接口能看出来）。
 */
export const ${exportName}_VERSION = ${JSON.stringify(options.version || '')};
export const ${exportName}: Record<string, string> = ${JSON.stringify(sortedEntries(), null, 2)};
`;
    await fs.mkdir(path.dirname(emit.file), { recursive: true });
    await fs.writeFile(emit.file, body, 'utf8');
  }

  const vitePlugin = {
    name: 'annotate-source-manifest',
    configResolved(config: { command: string }) {
      isBuild = config.command === 'build';
    },
    /** 开发期：按需转换，攒够一批再落盘，避免每改一个文件就写一次 */
    configureServer() {
      if (!enabled) return;
      const flush = async () => {
        if (!dirty) return;
        dirty = false;
        await writeManifest();
        if (options.emitModule?.onDev) await writeModule();
      };
      const tick = () => {
        if (devTimer) clearTimeout(devTimer);
        devTimer = setTimeout(() => {
          void flush();
          tick();
        }, 1500);
      };
      tick();
    },
    async closeBundle() {
      if (!enabled || !isBuild) return;
      await writeManifest();
      await writeModule();
      // eslint-disable-next-line no-console
      console.log(`[annotate-source] ${map.size} 条源码映射 → ${manifestFile}${options.emitModule ? ` + ${options.emitModule.file}` : ''}`);
    },
  };

  return { babelPlugin, vitePlugin };
}
