# @liuman/react-annotate

在应用里直接圈选、截图、手绘、指派 —— 把「这里要改」当场变成一张可跟踪的任务卡，不用再转录到别的任务系统。

> Pick any element in your running app → screenshot it → draw on it → it becomes an assignable kanban card.

## 特性

- **元素级锚点**：点谁标谁，存的是稳定选择器 + 元素内相对坐标，回到页面能高亮回原处
- **截图留证**：页面改版后选择器可能失效，截图让当时的现场永远看得见（截图引擎可选，不装也能用）
- **手绘批注**：画笔 / 箭头 / 矩形 / 椭圆 / 文字，图元是结构化数据，可撤销、可重绘、可后期改色
- **任务字段**：标题（默认取元素文本，可改名）、优先级、期望完成时间、指派给谁、标签、讨论线程
- **看板**：四列拖拽流转的 `<AnnotationBoard />`，纯受控，接任意后端
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
- **先选元素再截图**：浮层尚未盖上，截出来就是用户当时看到的画面。
- **手绘用 SVG 而非 canvas**：图元保持可编辑数据，canvas 一落笔就成像素。
- **看板不发请求**：数据与持久化全交给宿主，同一个看板能接任意后端。

## 稳定锚点

给关键元素加 `data-annotate-id="xxx"`，选择器会优先锚在它上面，页面重构也不失效。

## License

MIT
