/**
 * @文件 dup.ts
 * @职责 重复问题指纹：同一界面元素或同一段反馈正文，应并入已有卡而不是再建一张
 *
 * 持久化由宿主做。本函数只给出稳定键，前后端各算一遍必须得到同一字符串。
 * 有选择器 → 锚在「哪一页的哪个控件」；没有选择器（框选 / 联系反馈）→ 锚在归一化后的标题+正文。
 */

/** 去掉标点与多余空白，大小写不敏感，避免「登录按钮！」和「登录按钮」算成两件事 */
export function normalizeIssueText(raw: string): string {
  return (raw || '')
    .toLowerCase()
    .replace(/[\s\u3000]+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]+/gu, '')
    .trim();
}

export interface DupKeyInput {
  routePattern?: string;
  selector?: string;
  title?: string;
  body?: string;
  kind?: string;
}

/**
 * 返回空字符串表示无法判断（标题正文都空、又没有选择器）——此时宿主应新建卡，不要误并。
 */
export function buildDupKey(input: DupKeyInput): string {
  const route = (input.routePattern || '').trim();
  const selector = (input.selector || '').trim();
  if (selector) return `el:${route}|${selector}`;

  const title = normalizeIssueText(input.title || '');
  const body = normalizeIssueText(input.body || '').slice(0, 160);
  if (!title && !body) return '';
  const kind = input.kind === 'FEEDBACK' ? 'fb' : 'tx';
  return `${kind}:${title}|${body}`;
}
