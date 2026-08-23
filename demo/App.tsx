/**
 * 纯前端 demo：适配器用内存，截图走 blob URL，刷新即清空。
 * 用来在 GitHub Pages 上演示圈选 / 拖动框选 / 看板，不接真实后端。
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AnnotateProvider,
  AnnotateLauncher,
  AnnotationBoard,
  type AnnotateAdapter,
  type AnnotationPin,
  type PinDraft,
  type PinStatus,
} from '@liuman/react-annotate';
import '@liuman/react-annotate/style.css';

const ASSIGNEES = [
  { id: 'ada', name: 'Ada' },
  { id: 'lin', name: 'Lin' },
];

function toPin(draft: PinDraft, seq: number): AnnotationPin {
  const now = new Date().toISOString();
  return {
    ...draft,
    id: crypto.randomUUID(),
    seq,
    status: 'OPEN',
    rank: seq,
    authorId: 'demo',
    authorName: 'Demo',
    assigneeName: ASSIGNEES.find((a) => a.id === draft.assigneeId)?.name || '',
    createdAt: now,
    updatedAt: now,
  };
}

const SceneCanvas: React.FC = () => {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    const draw = (t: number) => {
      const w = (canvas.width = canvas.clientWidth * 2);
      const h = (canvas.height = canvas.clientHeight * 2);
      ctx.fillStyle = '#0b1220';
      ctx.fillRect(0, 0, w, h);
      const cx = w * 0.5;
      const cy = h * 0.55;
      ctx.strokeStyle = '#5b8dff';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.ellipse(cx, cy, w * 0.28, h * 0.18, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#a78bfa';
      ctx.beginPath();
      ctx.arc(cx + Math.cos(t / 600) * w * 0.22, cy + Math.sin(t / 600) * h * 0.1, 18, 0, Math.PI * 2);
      ctx.fill();
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div className="demo-canvas-wrap" data-annotate-id="scene">
      <canvas ref={ref} />
    </div>
  );
};

const App: React.FC = () => {
  const [pins, setPins] = useState<AnnotationPin[]>([]);
  const pinsRef = useRef(pins);
  pinsRef.current = pins;
  const seq = useRef(1);

  const adapter = useMemo<AnnotateAdapter>(
    () => ({
      currentUser: { id: 'demo', name: 'Demo' },
      listAssignees: async () => ASSIGNEES,
      listPagePins: async () => pinsRef.current.filter((p) => p.status === 'OPEN' || p.status === 'DOING'),
      uploadShot: async (blob) => {
        const key = crypto.randomUUID();
        return { url: URL.createObjectURL(blob), key };
      },
      createPin: async (draft) => {
        const pin = toPin(draft, seq.current++);
        setPins((prev) => [pin, ...prev]);
        return pin;
      },
    }),
    [],
  );

  return (
    <AnnotateProvider adapter={adapter} mode="full">
      <div className="demo-shell">
        <header className="demo-hero">
          <h1>@liuman/react-annotate</h1>
          <p>
            点右下角「标注」或按 <kbd>Alt</kbd>+<kbd>A</kbd>：单击选控件，拖动则框选截图。本页数据只在浏览器内存里，刷新即清空。
            源码{' '}
            <a href="https://github.com/mxyg/react-annotate">GitHub</a>
            {' · '}
            <a href="https://www.npmjs.com/package/@liuman/react-annotate">npm</a>
          </p>
        </header>

        <div className="demo-grid">
          <section className="demo-card">
            <h2 data-annotate-id="toolbar">模拟工作台</h2>
            <div className="demo-row">
              <button type="button" className="demo-btn demo-btn--primary" data-annotate-id="save">
                保存
              </button>
              <button type="button" className="demo-btn" data-annotate-id="export">
                导出
              </button>
              <button type="button" className="demo-btn" data-annotate-id="settings">
                设置
              </button>
            </div>
            <SceneCanvas />
            <p className="demo-hint">
              这块画布用来演示三维页：框选时会把 canvas 像素盖进截图，而不是只抓一整页空白 DOM。
            </p>
          </section>
          <section className="demo-card">
            <h2 data-annotate-id="form">模拟表单</h2>
            <input className="demo-input" defaultValue="示例矿井" data-annotate-id="mine-name" />
            <select className="demo-select" data-annotate-id="mode" defaultValue="3d">
              <option value="2d">2D</option>
              <option value="3d">3D</option>
            </select>
            <p className="demo-hint">点输入框或按钮会记下选择器；在画面上拖一圈只留截图、不写选择器。</p>
          </section>
        </div>

        <section className="demo-board">
          <h2>看板（拖卡片改列）</h2>
          <AnnotationBoard
            pins={pins}
            onMove={(pin, status: PinStatus) =>
              setPins((prev) => prev.map((p) => (p.id === pin.id ? { ...p, status } : p)))
            }
          />
        </section>
      </div>
      <AnnotateLauncher hotkey="alt+a" fabText="标注" />
    </AnnotateProvider>
  );
};

export default App;
