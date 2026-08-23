/**
 * @文件 index.ts
 * @职责 包出口：内核（锚点/截图）+ UI（入口浮层/编辑器/看板）+ 类型
 */
import './styles.css';

export { AnnotateProvider, useAnnotate } from './context';
export type { AnnotateProviderProps } from './context';

export { default as AnnotateLauncher } from './ui/AnnotateLauncher';
export type { AnnotateLauncherProps } from './ui/AnnotateLauncher';
export { default as ElementPicker } from './ui/ElementPicker';
export type { ElementPickerProps, PickResult } from './ui/ElementPicker';
export { default as PinComposer } from './ui/PinComposer';
export type { PinComposerProps } from './ui/PinComposer';
export { default as PinBubbles } from './ui/PinBubbles';
export { default as DrawSurface, DRAW_COLORS } from './ui/DrawSurface';
export { default as AnnotationBoard, BOARD_COLUMNS } from './ui/AnnotationBoard';
export type { AnnotationBoardProps } from './ui/AnnotationBoard';

export { buildAnchor, buildSelector, resolveSelector, describeElement, toRoutePattern } from './core/anchor';
export { captureToBlob, isCaptureAvailable } from './core/capture';
export type { CaptureOptions } from './core/capture';

export type {
  AnnotateAdapter,
  AnnotateMode,
  AnnotationPin,
  AssignableUser,
  DrawShape,
  PinAnchor,
  PinDraft,
  PinKind,
  PinPriority,
  PinStatus,
} from './types';
