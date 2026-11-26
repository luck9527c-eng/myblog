/**
 * 统一 fetch 封装。
 *
 * 契约要点（docs/API_CONTRACT.md §0.2 / §0.3）：
 * - 默认 `credentials: 'include'`（HttpOnly Cookie `blog_admin_session`）。
 * - 有 body 时自动加 `Content-Type: application/json`。
 * - 响应非 2xx 时抛 `ApiError`，message 取后端 `{"detail": "..."}`，
 *   缺失时用 `请求失败（HTTP xxx）`。
 * - 401 时调用已注册的 onUnauthorized 回调（App 用它把 isAdmin 置 false 并提示登录过期）；
 *   例外：`POST /api/auth/login` 的 401 是「密码不正确」，不触发该回调。
 */

const LOGIN_PATH = '/api/auth/login';

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

type UnauthorizedHandler = () => void;

let unauthorizedHandler: UnauthorizedHandler | null = null;

/** 注册全局 401 回调；传入 null 可注销。 */
export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  unauthorizedHandler = handler;
}

/** 从任意异常里取出适合直接展示给用户的文案。 */
export function getErrorMessage(error: unknown, fallback = '请求失败，请稍后重试'): string {
  if (error instanceof ApiError) return error.message || fallback;
  if (error instanceof Error) return error.message || fallback;
  if (typeof error === 'string' && error.trim()) return error;
  return fallback;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

/** 把后端 detail 归一化成一句中文提示（兼容 FastAPI 422 校验错误数组）。 */
function readDetail(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const detail = (payload as { detail?: unknown }).detail;
  if (typeof detail === 'string' && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        if (item && typeof item === 'object' && typeof (item as { msg?: unknown }).msg === 'string') {
          return (item as { msg: string }).msg;
        }
        return null;
      })
      .filter((msg): msg is string => Boolean(msg));
    if (messages.length > 0) return messages.join('；');
  }
  return null;
}

async function readBody(response: Response): Promise<unknown> {
  if (response.status === 204) return null;
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const hasBody = init.body !== undefined && init.body !== null;
  const isFormData = typeof FormData !== 'undefined' && init.body instanceof FormData;
  if (hasBody && !isFormData && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');

  let response: Response;
  try {
    response = await fetch(path, { credentials: 'include', ...init, headers });
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new ApiError(0, '网络连接失败，请确认后端服务已启动');
  }

  const payload = await readBody(response);

  if (!response.ok) {
    const detail = readDetail(payload) ?? `请求失败（HTTP ${response.status}）`;
    const isLoginAttempt = path.startsWith(LOGIN_PATH);
    if (response.status === 401 && !isLoginAttempt) {
      try {
        unauthorizedHandler?.();
      } catch {
        // 回调自身的异常不能覆盖真正的 401 错误
      }
    }
    throw new ApiError(response.status, detail);
  }

  return payload as T;
}
