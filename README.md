# @liuman/react-annotate

在应用里直接圈选、截图、手绘、指派 —— 把「这里要改」当场变成一张可跟踪的任务卡，不用再转录到别的任务系统。

> Pick any element in your running app → screenshot it → draw on it → it becomes an assignable kanban card.

**[在线演示（GitHub Pages）](https://mxyg.github.io/react-annotate/)** · 右下角「标注」或 `Alt+A`：单击选控件，拖动框选截图。

## 语言与发布形态

这个包的入口就是 **TypeScript**（`main` / `module` / `types` / `exports` 全部指向 `src/index.ts`）。npm 只发 `src/`，不发编译后的 JS。宿主用 Vite / webpack 等打包器时按源码编译。样式：`import '@liuman/react-annotate/style.css'`。

## 特性

- **元素级锚点**：点谁标谁，存的是稳定选择器 + 元素内相对坐标，回到页面能高亮回原处
- **截图留证**：页面改版后选择器可能失效，截图让当时的现场永远看得见（截图引擎可选，不装也能用）
- **手绘批注**：画笔 / 箭头 / 矩形 / 椭圆 / 文字，图元是结构化数据，可撤销、可重绘、可后期改色
- **任务字段**：标题（默认取元素文本，可改名）、优先级、期望完成时间、指派给谁、标签、讨论线程
- **看板**：四列拖拽流转的 `<AnnotationBoard />`，纯受控，接任意后端；空列仍占位可拖入；`reportCount > 1` 时卡片显示「×N」
- **去重键**：`buildDupKey()` 纯函数。同一页同一选择器，或同一段归一化正文，应并入已有卡并 `reportCount += 1`。持久化由宿主做，前后端必须用同一函数（或同规则的后端实现）
- **双入口**：内部标注（`mode="full"`）与用户反馈（`mode="feedback"`，字段收敛）共用同一条处理流水线
- **零运行时依赖**：只要 React；截图能力由可选 peer `@zumer/snapdom` 提供

## 安装

```bash
npm i @liuman/react-annotate
# 需要截图能力时再装（可选）
npm i @zumer/snapdom
```

## 用法

```tsx
import { AnnotateProvider, AnnotateLauncher, type AnnotateAdapter } from '@liuman/react-annotate';
import '@liuman/react-annotate/style.css';

const adapter: AnnotateAdapter = {
  createPin: (draft) => api.post('/annotations', draft).then((r) => r.data.data),
  uploadShot: (blob) => {
    const fd = new FormData();
    fd.append('file', blob, 'shot.png');
    return api.post('/annotations/shot', fd).then((r) => r.data.data);
  },
  listPagePins: (url) => api.get('/annotations/page', { params: { url } }).then((r) => r.data.data),
  listAssignees: () => api.get('/admin/annotations/assignees').then((r) => r.data.data),
  currentUser: { id: me.id, name: me.name },
};

<AnnotateProvider adapter={adapter} mode="full">
  <AnnotateLauncher hotkey="alt+a" onOpenPin={(pin) => navigate(`/board?pin=${pin.id}`)} />
</AnnotateProvider>;
```

看板：

```tsx
import { AnnotationBoard } from '@liuman/react-annotate';

<AnnotationBoard pins={pins} onMove={(pin, status) => save(pin.id, { status })} onOpen={openDetail} />;
```

联系我们这类「只要截图、不要进看板」的场景：

```tsx
<AnnotateLauncher
  submitKind="collect"
  onCollected={(draft) => attachToTicket(draft.shotUrl, draft)}
/>
```

`createPin` 若命中已有问题，应返回那张卡并带 `merged: true`、`reportCount` 为累加后的次数，而不是新建。

去重键：

```ts
import { buildDupKey } from '@liuman/react-annotate';

const key = buildDupKey({
  routePattern: draft.routePattern,
  selector: draft.selector,
  title: draft.title,
  body: draft.body,
  kind: draft.kind,
});
```

## 适配器契约

| 方法 | 作用 |
| --- | --- |
| `createPin(draft)` | 建卡，返回完整卡片 |
| `uploadShot(blob)` | 上传 PNG 截图，返回 `{ url, key }` |
| `listPagePins(url)` | 取当前页已有标注（用于页面气泡） |
| `listAssignees?()` | 可指派人列表（`mode="full"` 才用） |
| `currentUser?` | 默认标注人 |

## 设计取舍

- **双锚点**：只存选择器 → 改版即失联；只存截图 → 回不到现场。两个都存，缺一都会丢线索。
- **先选再截、或拖动框选**：单击记选择器并截当前视口；拖动只截框内、不走选择器。不截整页 `body`（三维页会又慢又大又错位）。
- **手绘用 SVG 而非 canvas**：图元保持可编辑数据，canvas 一落笔就成像素。
- **看板不发请求**：数据与持久化全交给宿主，同一个看板能接任意后端。

## 源码定位（含生产环境）

光有选择器不够用：`div > div:nth-of-type(2) > span` 这种东西没人读得动。开发构建能从 React 的
`_debugSource` 拿到 `文件:行号`，生产构建没有——而把源码路径随包发给用户本身也不合适。

所以本包提供一个构建插件：给每个 DOM 元素注入 7 位**不可反解**的短 id（属性 `data-sl`），
锚点里带走的就是这个 `sourceRef`；`id → 文件:行:列` 的对照表交给服务端，由后台解析。
浏览器里始终只有那串 id，拿不到对照表就什么也不是。

```ts
// vite.config.ts
import { createAnnotateSource } from '@liuman/react-annotate/vite';

const annotate = createAnnotateSource({
  root: __dirname,
  prefix: 'Web/',
  version: pkg.version,
  // 同机部署：后端直接读这份 JSON（默认写在 build-artifacts/，务必在 dist 之外）
  // 分离部署：再把对照表注入后端源码树，随后端代码包一起发布
  emitModule: { file: path.resolve(__dirname, '../api/src/annotation/source-map.generated.ts') },
});

export default defineConfig({
  plugins: [react({ babel: { plugins: [annotate.babelPlugin] } }), annotate.vitePlugin],
});
```

开发期同样注入（默认开），所以本机调试时圈到哪就是哪一行，不用再对着选择器猜。

> ⚠️ **对照表不能进静态托管**。放在 `dist/` 里、或跟着前端一起同步到 OSS/CDN，
> 等于把整张对照表公开发布，短 id 就白设计了。插件默认写到 `build-artifacts/`，
> 记得把它排除在部署同步之外。
>
> 只读文件系统的部署形态（阿里云函数计算这类）拿不到前端产物目录，用 `emitModule`
> 把对照表编进后端代码包即可，不需要数据库、也不需要共享盘。

`collectSource={false}` 只关掉可读的 `sourceLoc` 与 DOM 片段，不影响 `sourceRef`。

## 稳定锚点

给关键元素加 `data-annotate-id="xxx"`，选择器会优先锚在它上面，页面重构也不失效。

## License

MIT
