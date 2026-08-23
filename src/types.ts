/**
 * @文件 types.ts
 * @职责 屏幕标注内核的公共类型与适配器契约（本目录不依赖任何业务代码，可整体开源复用）
 * @路径 Poincare/src/components/annotate/types.ts
 */

/** 手绘图元。坐标一律相对截图归一化（0~1）——存像素的话换分辨率就全歪 */
export interface DrawShape {
  type: 'pen' | 'arrow' | 'rect' | 'ellipse' | 'text';
  /** pen: [x1,y1,x2,y2,...]；其余: [x1,y1,x2,y2] */
  points: number[];
  text?: string;
  color?: string;
  width?: number;
}

export type PinStatus = 'OPEN' | 'DOING' | 'DONE' | 'DROPPED';
export type PinPriority = 'URGENT' | 'HIGH' | 'NORMAL' | 'LOW';
export type PinKind = 'TASK' | 'FEEDBACK';

/** 现场锚点：路由 + 选择器 + 元素内相对坐标，三者共同决定「跳回现场」时高亮到哪 */
export interface PinAnchor {
  url: string;
  routePattern: string;
  selector: string;
  anchorX: number;
  anchorY: number;
  elementLabel: string;
  viewport: { w: number; h: number; dpr: number; theme?: string };
}

export interface AnnotationPin extends PinAnchor {
  id: string;
  seq: number;
  title: string;
  body: string;
  kind: PinKind;
  status: PinStatus;
  priority: PinPriority;
  labels: string[];
  dueAt?: string | null;
  rank: number;
  shotUrl?: string | null;
  shotKey?: string | null;
  drawing: DrawShape[];
  authorId?: string | null;
  authorName: string;
  assigneeId?: string | null;
  assigneeName: string;
  contactId?: string | null;
  commentCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface PinDraft extends PinAnchor {
  title: string;
  body: string;
  kind: PinKind;
  priority: PinPriority;
  labels: string[];
  dueAt?: string | null;
  assigneeId?: string | null;
  shotUrl?: string | null;
  shotKey?: string | null;
  drawing: DrawShape[];
  contactId?: string | null;
}

export interface AssignableUser {
  id: string;
  name: string;
  email?: string | null;
}

/**
 * 宿主适配器：内核只认这四件事，换一套后端只需换这一层。
 * 之所以把「上传截图」也抽出来，是因为不同宿主的对象存储/鉴权差异最大。
 */
export interface AnnotateAdapter {
  createPin(draft: PinDraft): Promise<AnnotationPin>;
  uploadShot(blob: Blob): Promise<{ url: string; key: string }>;
  listPagePins(url: string): Promise<AnnotationPin[]>;
  listAssignees?(): Promise<AssignableUser[]>;
  /** 当前标注人，用于「默认是谁标注」 */
  currentUser?: { id?: string; name?: string } | null;
}

/** full=内部标注（可指派/定优先级/定时间）；feedback=用户反馈（只填问题描述） */
export type AnnotateMode = 'full' | 'feedback';
